import type {
  JOURNAL_FORMAT,
  PhotoContentType,
  PlacePrecision,
  RETRIEVAL_BYTES,
  SIGHTING_FORMAT,
} from './constants';

export interface Coordinates {
  /** WGS84 decimal degrees, -90..90 */
  lat: number;
  /** WGS84 decimal degrees, -180..180 */
  lon: number;
}

export interface Place {
  name: string;
  /** exact: as recorded. approximate: rounded to 2 decimals (~1 km). none: no coordinates at all. */
  precision: PlacePrecision;
  /** Present if and only if precision is not "none". */
  coordinates?: Coordinates;
}

/** A photo is an attachment blob: raw image bytes stored separately, typed by the record. */
export interface PhotoAttachment {
  /** 64-hex Swarm reference of the raw image bytes. */
  ref: string;
  /** Always "bytes": fetch from /bytes/<ref>, never /bzz. */
  retrieval: typeof RETRIEVAL_BYTES;
  contentType: PhotoContentType;
  byteLength: number;
  width?: number;
  height?: number;
}

export interface SightingRecord {
  format: typeof SIGHTING_FORMAT;
  formatVersion: string;
  /** UUID v4, stable across edits; used to de-duplicate. */
  id: string;
  species: { commonName: string; scientificName?: string };
  count?: number;
  /** YYYY-MM-DD, the local date at the place of observation. */
  observedOn: string;
  /** HH:MM, 24-hour, local time at the place. */
  observedTime?: string;
  /** IANA time zone name, e.g. Asia/Kolkata. Absent means unknown. */
  timeZone?: string;
  place: Place;
  observer: { name: string };
  notes?: string;
  photo?: PhotoAttachment;
  /** RFC 3339, UTC. When the record was created. */
  createdAt: string;
  /** Informational only. Readers must not change behaviour based on it. */
  generator?: { name: string; version: string };
}

/** Everything the author fills in; format keys and createdAt are added by the codec. */
export type SightingDraft = Omit<SightingRecord, 'format' | 'formatVersion'>;

export interface JournalEntry {
  /** 64-hex reference of the encoded SightingRecord bytes. */
  ref: string;
  id: string;
  commonName: string;
  observedOn: string;
  hasPhoto: boolean;
  addedAt: string;
}

export interface JournalDocument {
  format: typeof JOURNAL_FORMAT;
  formatVersion: string;
  /** 40-hex address of the feed owner that publishes this journal. */
  owner: string;
  /** Human-readable topic string; its keccak256 is the feed topic. */
  feedTopic: string;
  /** Equals the feed index this journal is published at. */
  sequence: number;
  /** 64-hex reference of the previous journal, or null for the first one. */
  previous: string | null;
  updatedAt: string;
  /** Newest first, unique by id. The record itself is authoritative; these are summaries. */
  entries: JournalEntry[];
}

export type JournalDraft = Omit<JournalDocument, 'format' | 'formatVersion'>;
