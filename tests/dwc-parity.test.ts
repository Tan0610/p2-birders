import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type SightingRecord, toDwcCsv } from '../packages/format/src';
// @ts-expect-error: plain ESM helper without type declarations
import { createStore, startMockGateway } from '../scripts/mock-gateway.mjs';

// The CLI carries its own copy of the Darwin Core mapping, because it imports nothing
// from this repository. This test holds that copy and packages/format to one golden file.

const run = promisify(execFile);
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const fixture = JSON.parse(readFileSync(here('../packages/format/fixtures/dwc/sightings.json'), 'utf8')) as {
  gateway: string;
  journal: Record<string, unknown> & { owner: string };
  records: { ref: string; record: SightingRecord }[];
};
const expected = readFileSync(here('../packages/format/fixtures/dwc/expected.csv'), 'utf8');
const JOURNAL_REF = 'dc'.repeat(32);

let gateway: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  // Serve the fixture records at their fixture refs, listed by a journal owned by the fixture owner.
  const store = createStore();
  const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
  for (const { ref, record } of fixture.records) store.bytes.set(ref, bytes(record));
  const entries = fixture.records.map(({ ref, record }) => ({
    ref,
    id: record.id,
    commonName: record.species.commonName,
    observedOn: record.observedOn,
    hasPhoto: Boolean(record.photo),
    addedAt: record.createdAt,
  }));
  store.bytes.set(JOURNAL_REF, bytes({ ...fixture.journal, entries }));
  gateway = await startMockGateway({ port: 0, store });
});
afterAll(() => gateway.close());

const cli = (...args: string[]) => run(process.execPath, ['tools/read-sightings/read-sightings.mjs', '--journal', JOURNAL_REF, '--gateway', gateway.url, ...args]);

describe('Darwin Core: read-sightings --dwc and packages/format agree', () => {
  it('the CLI prints exactly what the format package produces', async () => {
    const { stdout } = await cli('--dwc');
    expect(stdout).toBe(toDwcCsv(fixture.records, { gateway: gateway.url, journalOwner: fixture.journal.owner }));
  });

  it('and both match the golden file once the gateway URL is the public one', async () => {
    const { stdout } = await cli('--dwc');
    expect(stdout.split(gateway.url).join(fixture.gateway)).toBe(expected);
  });

  it('--out writes the same CSV to a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dwc-'));
    try {
      const file = join(dir, 'sightings.csv');
      const { stdout, stderr } = await cli('--dwc', '--out', file);
      expect(stdout).toBe('');
      expect(stderr).toContain('wrote');
      expect(readFileSync(file, 'utf8').split(gateway.url).join(fixture.gateway)).toBe(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses --out without an output format', async () => {
    await expect(cli('--out', 'x.csv')).rejects.toMatchObject({ stderr: expect.stringContaining('--out writes') });
  });
});
