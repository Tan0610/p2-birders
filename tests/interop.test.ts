import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { JOURNAL_TOPIC_HEX, JOURNAL_TOPIC_STRING } from '@deccan-birders/format';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { feedIdentifier, socAddress } from '../apps/reader/src/swarm/feed';
import { contentAddress, recoverFeedSigner } from '../apps/reader/src/swarm/verify';

// Cross-checks the reader's hand-written feed maths against bee-js, the library
// Swarm ID uses to write the feed. If these ever disagree, the reader would
// look for journal updates at the wrong address.
const require = createRequire(import.meta.url);
const beeRoot = dirname(require.resolve('@ethersphere/bee-js', { paths: [join(process.cwd(), 'apps/writer')] }));
const bee = require(join(beeRoot, 'index.js'));
const { makeFeedIdentifier } = require(join(beeRoot, 'feed/identifier.js'));
const { makeSOCAddress } = require(join(beeRoot, 'chunk/soc.js'));

describe('reader feed maths agrees with bee-js 11', () => {
  it('topic', () => {
    expect(bee.Topic.fromString(JOURNAL_TOPIC_STRING).toHex()).toBe(JOURNAL_TOPIC_HEX);
  });

  it.each([0, 1, 2, 7, 5000])('identifier and SOC address at index %i', (i) => {
    const owner = '9f3c4b27e1d0a6c5b8f2e7d4c3b2a1f0e9d8c7b6';
    const expectedId = makeFeedIdentifier(bee.Topic.fromString(JOURNAL_TOPIC_STRING), i);
    const expectedSoc = makeSOCAddress(expectedId, new bee.EthAddress(owner));
    const id = feedIdentifier(hexToBytes(JOURNAL_TOPIC_HEX), BigInt(i));
    expect(bytesToHex(id)).toBe(expectedId.toHex());
    expect(bytesToHex(socAddress(id, hexToBytes(owner)))).toBe(expectedSoc.toHex());
  });
});

describe('reader signature check agrees with bee-js 11', () => {
  const { makeContentAddressedChunk } = require(join(beeRoot, 'chunk/cac.js'));

  it('computes the same content address (BMT) for a 40-byte pointer payload', () => {
    const payload = new Uint8Array(40).map((_, i) => i * 7);
    const cac = makeContentAddressedChunk(payload);
    const span = cac.data.subarray(0, 8);
    expect(bytesToHex(contentAddress(span, payload))).toBe(cac.address.toHex());
  });

  it('recovers the feed owner from a feed update signed by bee-js', () => {
    // A fresh throwaway key per run, so no key material ever sits in the repository.
    const key = new bee.PrivateKey(crypto.getRandomValues(new Uint8Array(32)));
    const identifier = feedIdentifier(hexToBytes(JOURNAL_TOPIC_HEX), 3n);
    const soc = makeContentAddressedChunk(new Uint8Array(40).fill(9)).toSingleOwnerChunk(identifier, key);
    expect(recoverFeedSigner(soc.data)).toBe(key.publicKey().address().toHex());
  });

  it('does not attribute an unsigned chunk to anyone', () => {
    const chunk = new Uint8Array(145);
    expect(recoverFeedSigner(chunk)).toBeNull();
  });
});
