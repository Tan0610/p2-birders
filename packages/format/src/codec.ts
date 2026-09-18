import {
  JOURNAL_FORMAT,
  JOURNAL_FORMAT_VERSION,
  MAX_RECORD_BYTES,
  SIGHTING_FORMAT,
  SIGHTING_FORMAT_VERSION,
} from './constants';
import type { JournalDocument, JournalDraft, SightingDraft, SightingRecord } from './types';
import { type ValidationIssue, validateJournal, validateSighting } from './validate';
import { isSupportedVersion, parseSemVer } from './version';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export class FormatError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[],
  ) {
    super(message);
    this.name = 'FormatError';
  }
}

/**
 * Builds the record with `format` and `formatVersion` as the first two keys,
 * validates it, and returns the exact UTF-8 bytes that get uploaded.
 * The format identifier and version therefore travel inside the stored bytes.
 */
export function encodeSighting(draft: SightingDraft, options: { now?: Date } = {}): Uint8Array {
  const record: SightingRecord = {
    format: SIGHTING_FORMAT,
    formatVersion: SIGHTING_FORMAT_VERSION,
    ...stripFormatKeys(draft),
  };
  const checked = validateSighting(record, options);
  if (!checked.ok) throw new FormatError('Sighting does not match org.deccanbirders.sighting 1.0.0', checked.issues);
  const bytes = encoder.encode(JSON.stringify(record));
  if (bytes.byteLength > MAX_RECORD_BYTES) {
    throw new FormatError(`Sighting is ${bytes.byteLength} bytes; the limit is ${MAX_RECORD_BYTES}`, [
      { path: '', message: 'record is too large' },
    ]);
  }
  return bytes;
}

/** Same guarantees as encodeSighting, for the journal index document. */
export function encodeJournal(draft: JournalDraft): Uint8Array {
  const journal: JournalDocument = {
    format: JOURNAL_FORMAT,
    formatVersion: JOURNAL_FORMAT_VERSION,
    ...stripFormatKeys(draft),
  };
  const checked = validateJournal(journal);
  if (!checked.ok) throw new FormatError('Journal does not match org.deccanbirders.journal 1.0.0', checked.issues);
  return encoder.encode(JSON.stringify(journal));
}

export type Decoded<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-json'; message: string }
  | { kind: 'wrong-format'; found: unknown }
  | { kind: 'unsupported-version'; found: unknown }
  | { kind: 'invalid'; issues: ValidationIssue[] };

export function decodeSighting(bytes: Uint8Array, options: { now?: Date } = {}): Decoded<SightingRecord> {
  return decodeWith(bytes, SIGHTING_FORMAT, (v) => validateSighting(v, options));
}

export function decodeJournal(bytes: Uint8Array): Decoded<JournalDocument> {
  return decodeWith(bytes, JOURNAL_FORMAT, validateJournal);
}

/** One sentence a person can read, for any non-ok decode result. */
export function describeDecodeProblem(result: Exclude<Decoded<unknown>, { kind: 'ok' }>): string {
  switch (result.kind) {
    case 'not-json':
      return `These bytes are not UTF-8 JSON (${result.message}).`;
    case 'wrong-format':
      return `This is not a Deccan Birders document; its format is ${JSON.stringify(result.found) ?? 'missing'}.`;
    case 'unsupported-version': {
      const v = parseSemVer(result.found);
      return v
        ? `Written in format version ${String(result.found)}, which this reader does not understand yet (it reads 1.x).`
        : `The formatVersion field is missing or not a version number.`;
    }
    case 'invalid':
      return `The document breaks the format rules: ${result.issues
        .slice(0, 3)
        .map((i) => `${i.path || 'document'} ${i.message}`)
        .join('; ')}${result.issues.length > 3 ? '…' : ''}`;
  }
}

function decodeWith<T>(
  bytes: Uint8Array,
  expectedFormat: string,
  validate: (v: unknown) => { ok: true; value: T } | { ok: false; issues: ValidationIssue[] },
): Decoded<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch (err) {
    return { kind: 'not-json', message: err instanceof Error ? err.message : String(err) };
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'wrong-format', found: undefined };
  const { format, formatVersion } = parsed as { format?: unknown; formatVersion?: unknown };
  if (format !== expectedFormat) return { kind: 'wrong-format', found: format };
  if (!isSupportedVersion(formatVersion)) return { kind: 'unsupported-version', found: formatVersion };
  const checked = validate(parsed);
  return checked.ok ? { kind: 'ok', value: checked.value } : { kind: 'invalid', issues: checked.issues };
}

function stripFormatKeys<T extends object>(draft: T): Omit<T, 'format' | 'formatVersion'> {
  const { format: _f, formatVersion: _v, ...rest } = draft as T & { format?: unknown; formatVersion?: unknown };
  return rest;
}
