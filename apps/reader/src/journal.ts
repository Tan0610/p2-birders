import {
  JOURNAL_TOPIC_HEX,
  type JournalDocument,
  type SightingRecord,
  decodeJournal,
  decodeSighting,
  describeDecodeProblem,
  isRef,
  normaliseHex,
} from '@deccan-birders/format';
import { hexToBytes } from '@noble/hashes/utils.js';
import { downloadBytes } from './swarm/bytes';
import { type FeedUpdate, ownerBytes, resolveLatest } from './swarm/feed';
import { ReaderError } from './swarm/http';

export interface LoadedJournal {
  journal: JournalDocument;
  journalRef: string;
  /** Present when the journal was found through its owner's feed. */
  feed?: FeedUpdate;
  warnings: string[];
}

export type SightingResult =
  | { ref: string; ok: true; record: SightingRecord }
  | { ref: string; ok: false; error: ReaderError };

function decodeOrThrow<T>(result: ReturnType<typeof decodeJournal> | ReturnType<typeof decodeSighting>): T {
  if (result.kind === 'ok') return result.value as T;
  const code = result.kind === 'unsupported-version' ? 'UNSUPPORTED_VERSION' : result.kind === 'invalid' ? 'INVALID_DOCUMENT' : 'NOT_OUR_FORMAT';
  throw new ReaderError(code, describeDecodeProblem(result));
}

export async function loadJournalByRef(base: string, ref: string, signal?: AbortSignal): Promise<LoadedJournal> {
  if (!isRef(ref)) throw new ReaderError('BAD_INPUT', 'A journal reference is 64 hexadecimal characters.');
  const journalRef = normaliseHex(ref);
  const journal = decodeOrThrow<JournalDocument>(decodeJournal(await downloadBytes(base, journalRef, signal)));
  return { journal, journalRef, warnings: [] };
}

/** owner → latest feed update → journal bytes → validated journal. */
export async function loadJournalByOwner(base: string, owner: string, hint?: bigint, signal?: AbortSignal): Promise<LoadedJournal> {
  const ownerRaw = ownerBytes(owner);
  const update = await resolveLatest(base, hexToBytes(JOURNAL_TOPIC_HEX), ownerRaw, hint, signal);
  if (!update) {
    throw new ReaderError('EMPTY_JOURNAL', 'No journal edition has been published at this address: feed update 0 does not exist on this gateway.');
  }
  const loaded = await loadJournalByRef(base, update.journalRef, signal);
  const warnings: string[] = [];
  if (update.signer === null) {
    warnings.push('The signature on the journal pointer could not be checked, so this page cannot confirm who published it.');
  } else if (update.signer !== normaliseHex(owner)) {
    warnings.push(`The journal pointer is signed by 0x${update.signer}, not by the journal address you opened.`);
  }
  if (normaliseHex(loaded.journal.owner) !== normaliseHex(owner)) {
    warnings.push('The journal says it belongs to a different address than the feed it was found on.');
  }
  if (BigInt(loaded.journal.sequence) !== update.index) {
    warnings.push(`The journal says it is edition ${loaded.journal.sequence}, but it was published at feed index ${update.index.toString()}.`);
  }
  return { ...loaded, feed: update, warnings };
}

export async function loadSighting(base: string, ref: string, signal?: AbortSignal): Promise<SightingResult> {
  try {
    const record = decodeOrThrow<SightingRecord>(decodeSighting(await downloadBytes(base, normaliseHex(ref), signal)));
    return { ref, ok: true, record };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ref, ok: false, error: err instanceof ReaderError ? err : new ReaderError('GATEWAY_ERROR', String(err)) };
  }
}

/** Loads several records, four at a time, reporting each as it lands. */
export async function loadSightings(
  base: string,
  refs: string[],
  onEach: (result: SightingResult) => void,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < refs.length) {
      const ref = refs[next++]!;
      onEach(await loadSighting(base, ref, signal));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker));
}

/** Photos are raw bytes typed by the record, so the record's contentType names the Blob. */
export async function loadPhotoUrl(base: string, record: SightingRecord, signal?: AbortSignal): Promise<string> {
  if (!record.photo) throw new ReaderError('BAD_INPUT', 'This sighting has no photo.');
  const bytes = await downloadBytes(base, normaliseHex(record.photo.ref), signal);
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: record.photo.contentType }));
}

/** Walks `previous` links back from a journal, for the provenance view. */
export async function loadHistory(base: string, start: JournalDocument, limit = 10, signal?: AbortSignal) {
  const chain: { ref: string; sequence: number; updatedAt: string; entries: number }[] = [];
  let previous = start.previous;
  while (previous && chain.length < limit) {
    const { journal } = await loadJournalByRef(base, previous, signal);
    chain.push({ ref: previous, sequence: journal.sequence, updatedAt: journal.updatedAt, entries: journal.entries.length });
    previous = journal.previous;
  }
  return chain;
}
