import { JOURNAL_TOPIC_HEX, JOURNAL_TOPIC_STRING } from '@deccan-birders/format';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { feedIdentifier, findLatestIndex, ownerBytes, parseFeedChunk, socAddress, topicFromString } from '../src/swarm/feed';

// The same vectors are printed in FORMAT.md §3.4. They were produced with
// @ethersphere/bee-js 11.2.0 (makeFeedIdentifier / makeSOCAddress) and
// independently with @noble/hashes; this test keeps the reader honest.
const OWNER = '1234567890abcdef1234567890abcdef12345678';
const VECTORS = [
  {
    index: 0n,
    identifier: '8cdb678c9ecd87da36fee3e677870c94dbe10dad4eee2917e7744dad8797e988',
    soc: '137186da227428fbc007f5ec121de10e0817136e73d8a98094645830df508e9b',
  },
  {
    index: 1n,
    identifier: 'a04788475252a73952e48912c1f294d64339158665f5f43011c3953a91fa0172',
    soc: '24318ee008ee0689486b9c0a7bcf41309d65c63c8cbd8a1b3154cca4b75457f7',
  },
  {
    index: 5n,
    identifier: 'ec9e4cc6a05c82a28af5e9281e0d00bac5b8b5f39478e5fe5caf69b003fc83c7',
    soc: '7efc894d178fe1e7de05d1c4cc79794572097dadb5d2840e494996acf65d6304',
  },
];

describe('FORMAT.md test vectors', () => {
  it('topic', () => {
    expect(bytesToHex(topicFromString(JOURNAL_TOPIC_STRING))).toBe(JOURNAL_TOPIC_HEX);
    expect(JOURNAL_TOPIC_HEX).toBe('623426d9d655190ab52962b5970114111d41b9cf0dc9ad52a02e841e6bfb2391');
  });

  for (const v of VECTORS) {
    it(`identifier and SOC address for index ${v.index}`, () => {
      const id = feedIdentifier(hexToBytes(JOURNAL_TOPIC_HEX), v.index);
      expect(bytesToHex(id)).toBe(v.identifier);
      expect(bytesToHex(socAddress(id, ownerBytes(OWNER)))).toBe(v.soc);
    });
  }

  it('accepts 0x-prefixed and mixed-case owners', () => {
    expect(bytesToHex(ownerBytes(`0x${OWNER.toUpperCase()}`))).toBe(OWNER);
    expect(() => ownerBytes('0x1234')).toThrow(/40 hexadecimal/);
  });
});

function fakeChunk(identifier: Uint8Array, timestamp: bigint, ref: string, span = 40n) {
  const spanBytes = new Uint8Array(8);
  new DataView(spanBytes.buffer).setBigUint64(0, span, true);
  const ts = new Uint8Array(8);
  new DataView(ts.buffer).setBigUint64(0, timestamp, false);
  return concatBytes(identifier, new Uint8Array(65), spanBytes, ts, hexToBytes(ref));
}

describe('parseFeedChunk', () => {
  const id = feedIdentifier(hexToBytes(JOURNAL_TOPIC_HEX), 3n);
  const ref = 'ab'.repeat(32);

  it('extracts timestamp and journal reference', () => {
    expect(parseFeedChunk(fakeChunk(id, 1_758_000_000n, ref), id)).toEqual({ timestamp: 1_758_000_000, journalRef: ref });
  });

  it('refuses a chunk for a different identifier', () => {
    const other = feedIdentifier(hexToBytes(JOURNAL_TOPIC_HEX), 4n);
    expect(() => parseFeedChunk(fakeChunk(id, 1n, ref), other)).toThrow(/different feed update/);
  });

  it('refuses a payload that is not a 40-byte pointer', () => {
    expect(() => parseFeedChunk(fakeChunk(id, 1n, ref, 72n), id)).toThrow(/40-byte/);
  });
});

describe('findLatestIndex', () => {
  const upTo = (n: number | null) => {
    const calls: bigint[] = [];
    const exists = async (i: bigint) => {
      calls.push(i);
      return n !== null && i <= BigInt(n);
    };
    return { exists, calls };
  };

  it('returns null for an empty feed after one probe', async () => {
    const f = upTo(null);
    expect(await findLatestIndex(f.exists)).toBeNull();
    expect(f.calls).toEqual([0n]);
  });

  it.each([0, 1, 2, 7, 8, 100, 1023])('finds %i without a hint', async (n) => {
    expect(await findLatestIndex(upTo(n).exists)).toBe(BigInt(n));
  });

  it.each([
    [40, 40n],
    [40, 39n],
    [40, 41n],
    [40, 500n],
    [3, 1n],
  ])('finds %i with hint %s', async (n, hint) => {
    expect(await findLatestIndex(upTo(n).exists, hint)).toBe(BigInt(n));
  });

  it('uses few requests when the hint is right', async () => {
    const f = upTo(40);
    await findLatestIndex(f.exists, 40n);
    expect(f.calls.length).toBeLessThanOrEqual(3);
  });
});
