import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { JOURNAL_TOPIC_HEX, JOURNAL_TOPIC_STRING } from '@deccan-birders/format';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { feedIdentifier, socAddress } from '../apps/reader/src/swarm/feed';

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
