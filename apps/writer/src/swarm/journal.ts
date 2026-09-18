import {
  JOURNAL_TOPIC_HEX,
  JOURNAL_TOPIC_STRING,
  type JournalDocument,
  type JournalEntry,
  decodeJournal,
  describeDecodeProblem,
} from '@deccan-birders/format';
import type { SwarmIdClient } from '@snaha/swarm-id';
import { UploadFailure, classifyError } from '../errors';

export interface LatestJournal {
  journal: JournalDocument;
  ref: string;
  index: bigint;
}

/**
 * Reads the signed-in user's latest journal from their feed, through Swarm ID.
 * Returns null only when the feed genuinely has no updates yet; any other
 * failure is thrown, so a flaky read can never make us start over at index 0
 * and publish a journal that forgets earlier sightings.
 */
export async function readLatestJournal(client: SwarmIdClient, owner: string): Promise<LatestJournal | null> {
  const reader = client.makeSequentialFeedReader({ topic: JOURNAL_TOPIC_HEX, owner });
  let update;
  try {
    update = await reader.downloadRawPayload({ lookupTimeoutMs: 8000, hasTimestamp: true });
  } catch (err) {
    if (/no updates|not found|404/i.test(err instanceof Error ? err.message : String(err))) return null;
    throw classifyError(err, 'journal');
  }
  if (update.payload.length !== 32) {
    throw new UploadFailure('JOURNAL_PUBLISH_FAILED', {
      step: 'journal',
      detail: `Your journal feed holds a ${update.payload.length}-byte payload instead of a 32-byte journal reference.`,
    });
  }
  const ref = toHex(update.payload);
  let bytes: Uint8Array;
  try {
    bytes = await client.downloadData(ref);
  } catch (err) {
    throw classifyError(err, 'journal');
  }
  const decoded = decodeJournal(bytes);
  if (decoded.kind !== 'ok') {
    throw new UploadFailure('JOURNAL_PUBLISH_FAILED', { step: 'journal', detail: describeDecodeProblem(decoded) });
  }
  return { journal: decoded.value, ref, index: BigInt(update.feedIndex) };
}

/**
 * The next journal edition: new entries first, then everything already listed,
 * de-duplicated by record id. Its sequence is the feed index it will be
 * published at, which comes from the network read above, never a local counter.
 */
export function buildNextJournal(
  latest: LatestJournal | null,
  owner: string,
  newEntries: JournalEntry[],
  now: Date = new Date(),
): Omit<JournalDocument, 'format' | 'formatVersion'> {
  const seen = new Set<string>();
  const entries: JournalEntry[] = [];
  for (const entry of [...newEntries, ...(latest?.journal.entries ?? [])]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return {
    owner: owner.replace(/^0x/i, '').toLowerCase(),
    feedTopic: JOURNAL_TOPIC_STRING,
    sequence: latest ? Number(latest.index + 1n) : 0,
    previous: latest?.ref ?? null,
    updatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    entries,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
