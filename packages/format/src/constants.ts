/**
 * Format identifiers, versions and the journal feed binding.
 * Everything a fourth app needs to find and parse Deccan Birders data is
 * defined here and in FORMAT.md. There is no hidden state in any app.
 */

/** Written into every sighting record's bytes, as the first key. */
export const SIGHTING_FORMAT = 'org.deccanbirders.sighting' as const;
/** SemVer. Readers reject an unknown MAJOR and ignore unknown fields within a known one. */
export const SIGHTING_FORMAT_VERSION = '1.0.0' as const;

/** Written into every journal index's bytes, as the first key. */
export const JOURNAL_FORMAT = 'org.deccanbirders.journal' as const;
export const JOURNAL_FORMAT_VERSION = '1.0.0' as const;

/** Major versions this definition knows how to read. */
export const SUPPORTED_MAJOR = 1;

/** Human-readable feed topic. The topic bytes are keccak256(utf8(JOURNAL_TOPIC_STRING)). */
export const JOURNAL_TOPIC_STRING = 'org.deccanbirders.sighting/journal/v1' as const;

/**
 * keccak256(utf8(JOURNAL_TOPIC_STRING)), lowercase hex without 0x.
 * Kept as a literal so this package stays dependency-free; packages/format/test
 * recomputes it and fails if the two ever disagree.
 */
export const JOURNAL_TOPIC_HEX = '623426d9d655190ab52962b5970114111d41b9cf0dc9ad52a02e841e6bfb2391' as const;

/** A sighting record, once encoded, must not exceed this many bytes. */
export const MAX_RECORD_BYTES = 64 * 1024;

/** Photos are stored as raw bytes; these are the only content types a reader must render. */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

/** Every object in this format family is written to, and read from, the Swarm "bytes" endpoint. */
export const RETRIEVAL_BYTES = 'bytes' as const;

export const PLACE_PRECISIONS = ['exact', 'approximate', 'none'] as const;
export type PlacePrecision = (typeof PLACE_PRECISIONS)[number];

/** Journal feed update payload: uint64_be(unixSeconds) || journalRef(32). */
export const FEED_PAYLOAD_BYTES = 40;
