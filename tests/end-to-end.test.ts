import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHistory, loadJournalByOwner, loadJournalByRef, loadSighting } from '../apps/reader/src/journal';
// @ts-expect-error: plain ESM helper without type declarations
import { createStore, seedSampleJournal, startMockGateway } from '../scripts/mock-gateway.mjs';

// Both independent readers, against a gateway holding data laid out exactly as
// FORMAT.md describes: feed updates at /chunks, everything else at /bytes.

const run = promisify(execFile);
let gateway: { url: string; close: () => Promise<void> };
let seeded: { owner: string; sightingRefs: string[]; journalRefs: string[] };

beforeAll(async () => {
  const store = createStore();
  seeded = seedSampleJournal(store);
  gateway = await startMockGateway({ port: 0, store });
});
afterAll(() => gateway.close());

describe('Almanac loader', () => {
  it('follows a journal address to its latest edition', async () => {
    const loaded = await loadJournalByOwner(gateway.url, `0x${seeded.owner}`);
    expect(loaded.feed?.index).toBe(2n);
    expect(loaded.journalRef).toBe(seeded.journalRefs[2]);
    expect(loaded.journal.entries).toHaveLength(6);
    expect(loaded.warnings).toEqual([]);
  });

  it('gets there with fewer requests when given a hint', async () => {
    const loaded = await loadJournalByOwner(gateway.url, seeded.owner, 2n);
    expect(loaded.feed?.index).toBe(2n);
  });

  it('reports an address with no updates as an empty journal', async () => {
    await expect(loadJournalByOwner(gateway.url, '0x' + '1'.repeat(40))).rejects.toMatchObject({ code: 'EMPTY_JOURNAL' });
  });

  it('reads every record, validated against its own format field', async () => {
    for (const ref of seeded.sightingRefs) {
      const r = await loadSighting(gateway.url, ref);
      expect(r.ok).toBe(true);
    }
  });

  it('refuses a journal where a sighting should be', async () => {
    const r = await loadSighting(gateway.url, seeded.journalRefs[0]!);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_OUR_FORMAT');
  });

  it('walks back through earlier editions', async () => {
    const { journal } = await loadJournalByRef(gateway.url, seeded.journalRefs[2]!);
    const history = await loadHistory(gateway.url, journal);
    expect(history.map((h) => h.sequence)).toEqual([1, 0]);
  });
});

describe('read-sightings CLI', () => {
  it('prints every sighting from just the journal address', async () => {
    const { stdout } = await run(process.execPath, ['tools/read-sightings/read-sightings.mjs', '--owner', `0x${seeded.owner}`, '--gateway', gateway.url, '--json']);
    const out = JSON.parse(stdout);
    expect(out.feed.index).toBe('2');
    expect(out.sightings).toHaveLength(6);
    expect(out.sightings.every((s: { record?: { format: string } }) => s.record?.format === 'org.deccanbirders.sighting')).toBe(true);
  });
});
