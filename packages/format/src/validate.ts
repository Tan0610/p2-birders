import {
  JOURNAL_FORMAT,
  PHOTO_CONTENT_TYPES,
  PLACE_PRECISIONS,
  RETRIEVAL_BYTES,
  SIGHTING_FORMAT,
} from './constants';
import type { JournalDocument, SightingRecord } from './types';
import { isSupportedVersion } from './version';

export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. "place.coordinates.lat". */
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

const REF = /^(0x)?[0-9a-fA-F]{64}$/;
const ADDRESS = /^(0x)?[0-9a-fA-F]{40}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// RFC 3339 date-time, with Z or an offset.
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const isRef = (v: unknown): v is string => typeof v === 'string' && REF.test(v);
export const isAddress = (v: unknown): v is string => typeof v === 'string' && ADDRESS.test(v);

/** Lowercase, without 0x. Readers accept either case and an optional 0x. */
export function normaliseHex(v: string): string {
  return v.replace(/^0x/i, '').toLowerCase();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRealCalendarDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

class Collector {
  issues: ValidationIssue[] = [];
  add(path: string, message: string) {
    this.issues.push({ path, message });
  }
  text(obj: Record<string, unknown>, key: string, path: string, opts: { required: boolean; min?: number; max: number }) {
    const v = obj[key];
    if (v === undefined) {
      if (opts.required) this.add(path, 'is required');
      return;
    }
    if (typeof v !== 'string') return this.add(path, 'must be text');
    const len = v.trim().length;
    if (len < (opts.min ?? (opts.required ? 1 : 0))) this.add(path, opts.required ? 'cannot be empty' : 'is too short');
    if (v.length > opts.max) this.add(path, `must be at most ${opts.max} characters`);
  }
}

export interface ValidateOptions {
  /** Used for the "not in the future" rule. Defaults to the current time. */
  now?: Date;
}

export function validateSighting(input: unknown, options: ValidateOptions = {}): ValidationResult<SightingRecord> {
  const c = new Collector();
  if (!isObject(input)) return { ok: false, issues: [{ path: '', message: 'must be a JSON object' }] };

  if (input.format !== SIGHTING_FORMAT) c.add('format', `must be "${SIGHTING_FORMAT}"`);
  if (!isSupportedVersion(input.formatVersion)) c.add('formatVersion', 'must be a 1.x.y SemVer string');

  if (typeof input.id !== 'string' || !UUID_V4.test(input.id)) c.add('id', 'must be a UUID v4');

  if (!isObject(input.species)) {
    c.add('species', 'is required');
  } else {
    c.text(input.species, 'commonName', 'species.commonName', { required: true, max: 120 });
    c.text(input.species, 'scientificName', 'species.scientificName', { required: false, max: 120 });
  }

  if (input.count !== undefined) {
    if (!Number.isInteger(input.count) || (input.count as number) < 1 || (input.count as number) > 100000) {
      c.add('count', 'must be a whole number from 1 to 100000');
    }
  }

  if (typeof input.observedOn !== 'string' || !isRealCalendarDate(input.observedOn)) {
    c.add('observedOn', 'must be a real date written YYYY-MM-DD');
  } else {
    // A day of slack so a sighting filed just after midnight elsewhere is not rejected.
    const now = options.now ?? new Date();
    const latest = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (input.observedOn > latest) c.add('observedOn', 'cannot be in the future');
  }

  if (input.observedTime !== undefined && (typeof input.observedTime !== 'string' || !TIME.test(input.observedTime))) {
    c.add('observedTime', 'must be HH:MM in 24-hour time');
  }
  if (input.timeZone !== undefined && (typeof input.timeZone !== 'string' || input.timeZone.length === 0 || input.timeZone.length > 64)) {
    c.add('timeZone', 'must be an IANA time zone name');
  }

  if (!isObject(input.place)) {
    c.add('place', 'is required');
  } else {
    const place = input.place;
    c.text(place, 'name', 'place.name', { required: true, max: 200 });
    const precision = place.precision;
    if (typeof precision !== 'string' || !(PLACE_PRECISIONS as readonly string[]).includes(precision)) {
      c.add('place.precision', `must be one of ${PLACE_PRECISIONS.join(', ')}`);
    } else if (precision === 'none') {
      if (place.coordinates !== undefined) c.add('place.coordinates', 'must be absent when precision is "none"');
    } else if (!isObject(place.coordinates)) {
      c.add('place.coordinates', 'is required unless precision is "none"');
    } else {
      const { lat, lon } = place.coordinates;
      if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) c.add('place.coordinates.lat', 'must be between -90 and 90');
      if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) c.add('place.coordinates.lon', 'must be between -180 and 180');
    }
  }

  if (!isObject(input.observer)) c.add('observer', 'is required');
  else c.text(input.observer, 'name', 'observer.name', { required: true, max: 120 });

  c.text(input, 'notes', 'notes', { required: false, max: 2000 });

  if (input.photo !== undefined) {
    const p = input.photo;
    if (!isObject(p)) {
      c.add('photo', 'must be an object');
    } else {
      if (!isRef(p.ref)) c.add('photo.ref', 'must be a 64-character hex reference');
      if (p.retrieval !== RETRIEVAL_BYTES) c.add('photo.retrieval', `must be "${RETRIEVAL_BYTES}"`);
      if (typeof p.contentType !== 'string' || !(PHOTO_CONTENT_TYPES as readonly string[]).includes(p.contentType)) {
        c.add('photo.contentType', `must be one of ${PHOTO_CONTENT_TYPES.join(', ')}`);
      }
      if (!Number.isInteger(p.byteLength) || (p.byteLength as number) < 1) c.add('photo.byteLength', 'must be a positive whole number');
      for (const k of ['width', 'height'] as const) {
        if (p[k] !== undefined && (!Number.isInteger(p[k]) || (p[k] as number) < 1)) c.add(`photo.${k}`, 'must be a positive whole number');
      }
    }
  }

  if (typeof input.createdAt !== 'string' || !DATETIME.test(input.createdAt)) c.add('createdAt', 'must be an RFC 3339 timestamp');

  if (input.generator !== undefined) {
    if (!isObject(input.generator) || typeof input.generator.name !== 'string' || typeof input.generator.version !== 'string') {
      c.add('generator', 'must be { name, version }');
    }
  }

  return c.issues.length === 0
    ? { ok: true, value: input as unknown as SightingRecord, issues: [] }
    : { ok: false, issues: c.issues };
}

export function validateJournal(input: unknown): ValidationResult<JournalDocument> {
  const c = new Collector();
  if (!isObject(input)) return { ok: false, issues: [{ path: '', message: 'must be a JSON object' }] };

  if (input.format !== JOURNAL_FORMAT) c.add('format', `must be "${JOURNAL_FORMAT}"`);
  if (!isSupportedVersion(input.formatVersion)) c.add('formatVersion', 'must be a 1.x.y SemVer string');
  if (!isAddress(input.owner)) c.add('owner', 'must be a 40-character hex address');
  if (typeof input.feedTopic !== 'string' || input.feedTopic.length === 0) c.add('feedTopic', 'is required');
  if (!Number.isInteger(input.sequence) || (input.sequence as number) < 0) c.add('sequence', 'must be a whole number, 0 or more');
  if (input.previous !== null && !isRef(input.previous)) c.add('previous', 'must be a 64-character hex reference or null');
  if (typeof input.updatedAt !== 'string' || !DATETIME.test(input.updatedAt)) c.add('updatedAt', 'must be an RFC 3339 timestamp');

  if (!Array.isArray(input.entries)) {
    c.add('entries', 'must be a list');
  } else {
    const seen = new Set<string>();
    input.entries.forEach((e, i) => {
      const at = `entries.${i}`;
      if (!isObject(e)) return c.add(at, 'must be an object');
      if (!isRef(e.ref)) c.add(`${at}.ref`, 'must be a 64-character hex reference');
      if (typeof e.id !== 'string' || e.id.length === 0) c.add(`${at}.id`, 'is required');
      else if (seen.has(e.id)) c.add(`${at}.id`, 'appears more than once');
      else seen.add(e.id);
      if (typeof e.commonName !== 'string') c.add(`${at}.commonName`, 'must be text');
      if (typeof e.observedOn !== 'string' || !DATE.test(e.observedOn)) c.add(`${at}.observedOn`, 'must be YYYY-MM-DD');
      if (typeof e.hasPhoto !== 'boolean') c.add(`${at}.hasPhoto`, 'must be true or false');
      if (typeof e.addedAt !== 'string' || !DATETIME.test(e.addedAt)) c.add(`${at}.addedAt`, 'must be an RFC 3339 timestamp');
    });
  }

  return c.issues.length === 0
    ? { ok: true, value: input as unknown as JournalDocument, issues: [] }
    : { ok: false, issues: c.issues };
}
