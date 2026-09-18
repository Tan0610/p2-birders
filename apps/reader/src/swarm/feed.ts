import { FEED_PAYLOAD_BYTES } from '@deccan-birders/format';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { ReaderError, getWithTimeout } from './http';
import { recoverFeedSigner } from './verify';

/**
 * Journal feed resolution, implemented from FORMAT.md §3 alone:
 *   identifier_i = keccak256(topic || uint64_be(i))
 *   socAddress_i = keccak256(identifier_i || owner)
 *   GET /chunks/<socAddress_i>  ->  identifier(32) || signature(65) || span(8, LE) || payload
 *   payload = uint64_be(unixSeconds) || journalRef(32)
 *
 * Endpoint choice: the writer stores each update with the single-owner-chunk
 * upload (POST /soc/<owner>/<id>), which puts ONE chunk at socAddress_i. A SOC
 * is a chunk, so the matching read is GET /chunks/<socAddress_i>: it returns the
 * chunk byte for byte, signature included (FORMAT.md §4). Nothing here is a
 * bytes tree or a manifest, so /bytes and /bzz do not apply. /feeds/... would
 * report the index only in swarm-feed-index headers, which the public gateway
 * does not expose to browsers, so the latest index is found by probing.
 */

export function topicFromString(topic: string): Uint8Array {
  return keccak_256(utf8ToBytes(topic));
}

export function feedIdentifier(topic: Uint8Array, index: bigint): Uint8Array {
  const i = new Uint8Array(8);
  new DataView(i.buffer).setBigUint64(0, index, false);
  return keccak_256(concatBytes(topic, i));
}

export function socAddress(identifier: Uint8Array, owner: Uint8Array): Uint8Array {
  return keccak_256(concatBytes(identifier, owner));
}

export function ownerBytes(owner: string): Uint8Array {
  const hex = owner.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new ReaderError('BAD_INPUT', 'A journal address is 40 hexadecimal characters, optionally starting with 0x.');
  }
  return hexToBytes(hex.toLowerCase());
}

export interface FeedUpdate {
  index: bigint;
  /** Seconds since the Unix epoch, as written by the publisher. */
  timestamp: number;
  journalRef: string;
  socAddress: string;
  /** 40-hex address recovered from the chunk signature, or null if it could not be recovered. */
  signer: string | null;
}

const IDENTIFIER = 32;
const SIGNATURE = 65;
const SPAN = 8;

/** Parses a single-owner chunk and checks it is the update we asked for. */
export function parseFeedChunk(chunk: Uint8Array, expectedIdentifier: Uint8Array): { timestamp: number; journalRef: string } {
  const header = IDENTIFIER + SIGNATURE + SPAN;
  if (chunk.length < header + FEED_PAYLOAD_BYTES) {
    throw new ReaderError('BAD_FEED_UPDATE', `The feed update is ${chunk.length} bytes, too short to hold a journal pointer.`);
  }
  const identifier = chunk.subarray(0, IDENTIFIER);
  if (bytesToHex(identifier) !== bytesToHex(expectedIdentifier)) {
    throw new ReaderError('BAD_FEED_UPDATE', 'The chunk at this address belongs to a different feed update.');
  }
  const spanView = new DataView(chunk.buffer, chunk.byteOffset + IDENTIFIER + SIGNATURE, SPAN);
  const span = spanView.getBigUint64(0, true);
  const payload = chunk.subarray(header);
  if (span !== BigInt(FEED_PAYLOAD_BYTES) || payload.length < FEED_PAYLOAD_BYTES) {
    throw new ReaderError('BAD_FEED_UPDATE', `Expected a 40-byte journal pointer, found ${span.toString()} bytes.`);
  }
  const timestamp = Number(new DataView(payload.buffer, payload.byteOffset, 8).getBigUint64(0, false));
  const journalRef = bytesToHex(payload.subarray(8, FEED_PAYLOAD_BYTES));
  return { timestamp, journalRef };
}

/**
 * Fetches update `index`. Returns null when it does not exist.
 * Gateways answer a missing chunk with 404 or, sometimes, 500, so a non-200
 * answer is retried once before it counts as "absent".
 */
export async function fetchFeedUpdate(
  base: string,
  topic: Uint8Array,
  owner: Uint8Array,
  index: bigint,
  signal?: AbortSignal,
  onMiss?: (index: bigint, status: number) => void,
): Promise<FeedUpdate | null> {
  const id = feedIdentifier(topic, index);
  const address = bytesToHex(socAddress(id, owner));
  let status = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    // GET /chunks is the read side of the single-owner-chunk upload (POST /soc) that
    // wrote this update: it returns the chunk exactly as stored, identifier and
    // signature included, which is what lets the reader check who signed it.
    const res = await getWithTimeout(`${base}/chunks/${address}`, 10_000, signal);
    if (res.ok) {
      const chunk = new Uint8Array(await res.arrayBuffer());
      const parsed = parseFeedChunk(chunk, id);
      return { index, socAddress: address, signer: recoverFeedSigner(chunk), ...parsed };
    }
    status = res.status;
    if (status !== 404 && status !== 500) {
      throw new ReaderError('GATEWAY_ERROR', `The gateway answered ${status} while looking up the journal.`);
    }
  }
  onMiss?.(index, status);
  return null;
}

/**
 * Finds the highest index for which `exists` is true, assuming updates have no
 * gaps (FORMAT.md §3). Gallops upward from the hint, then binary-searches.
 * Returns null for an empty feed.
 */
export async function findLatestIndex(exists: (i: bigint) => Promise<boolean>, hint?: bigint): Promise<bigint | null> {
  if (!(await exists(0n))) return null;
  let lo = 0n;
  let hi: bigint | null = null;
  if (hint !== undefined && hint > 0n) {
    if (await exists(hint)) lo = hint;
    else hi = hint;
  }
  let step = 1n;
  while (hi === null) {
    const candidate = lo + step;
    if (await exists(candidate)) {
      lo = candidate;
      step *= 2n;
    } else {
      hi = candidate;
    }
  }
  let upper: bigint = hi;
  while (upper - lo > 1n) {
    const mid: bigint = (lo + upper) / 2n;
    if (await exists(mid)) lo = mid;
    else upper = mid;
  }
  return lo;
}

/** Resolves the latest journal pointer for an owner. Null means the feed has no updates yet. */
export async function resolveLatest(
  base: string,
  topic: Uint8Array,
  owner: Uint8Array,
  hint?: bigint,
  signal?: AbortSignal,
  onMiss?: (index: bigint, status: number) => void,
): Promise<FeedUpdate | null> {
  const seen = new Map<bigint, FeedUpdate | null>();
  const probe = async (i: bigint) => {
    if (!seen.has(i)) seen.set(i, await fetchFeedUpdate(base, topic, owner, i, signal, onMiss));
    return seen.get(i) !== null;
  };
  const latest = await findLatestIndex(probe, hint);
  return latest === null ? null : (seen.get(latest) ?? null);
}
