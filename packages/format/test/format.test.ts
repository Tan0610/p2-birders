import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  FormatError,
  JOURNAL_TOPIC_HEX,
  JOURNAL_TOPIC_STRING,
  type SightingDraft,
  decodeJournal,
  decodeSighting,
  describeDecodeProblem,
  encodeJournal,
  encodeSighting,
  validateSighting,
} from '../src';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))));
const now = new Date('2026-09-19T00:00:00Z');

const draft: SightingDraft = {
  id: '3f6c2a9e-8b1d-4c7e-9a2f-5d0e1b7c4a61',
  species: { commonName: 'Indian Robin', scientificName: 'Copsychus fulicatus' },
  observedOn: '2026-09-14',
  place: { name: 'Hussain Sagar', precision: 'approximate', coordinates: { lat: 17.42, lon: 78.47 } },
  observer: { name: 'Meera' },
  createdAt: '2026-09-14T02:05:11Z',
};

describe('topic', () => {
  it('JOURNAL_TOPIC_HEX is keccak256 of the topic string', () => {
    expect(bytesToHex(keccak_256(utf8ToBytes(JOURNAL_TOPIC_STRING)))).toBe(JOURNAL_TOPIC_HEX);
  });
});

describe('encodeSighting', () => {
  it('writes format and formatVersion as the first two keys of the uploaded bytes', () => {
    const text = new TextDecoder().decode(encodeSighting(draft, { now }));
    expect(text.startsWith('{"format":"org.deccanbirders.sighting","formatVersion":"1.0.0",')).toBe(true);
  });

  it('ignores any format keys smuggled into the draft', () => {
    const sneaky = { ...draft, format: 'something.else', formatVersion: '9.9.9' } as unknown as SightingDraft;
    const parsed = JSON.parse(new TextDecoder().decode(encodeSighting(sneaky, { now })));
    expect(parsed.format).toBe('org.deccanbirders.sighting');
    expect(parsed.formatVersion).toBe('1.0.0');
  });

  it('refuses an invalid draft with field-level issues', () => {
    const bad = { ...draft, place: { name: 'x', precision: 'exact' } } as SightingDraft;
    try {
      encodeSighting(bad, { now });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FormatError);
      expect((err as FormatError).issues.map((i) => i.path)).toContain('place.coordinates');
    }
  });

  it('round-trips through decodeSighting', () => {
    const decoded = decodeSighting(encodeSighting(draft, { now }), { now });
    expect(decoded.kind).toBe('ok');
  });
});

describe('decodeSighting', () => {
  it('accepts the full and minimal fixtures', () => {
    expect(decodeSighting(fixture('sighting.valid.json'), { now }).kind).toBe('ok');
    expect(decodeSighting(fixture('sighting.minimal.json'), { now }).kind).toBe('ok');
  });

  it('reads a later 1.x minor and ignores its unknown fields', () => {
    const r = decodeSighting(fixture('sighting.future-minor.json'), { now });
    expect(r.kind).toBe('ok');
  });

  it('rejects an unknown major version instead of guessing', () => {
    const r = decodeSighting(fixture('sighting.v2.json'), { now });
    expect(r.kind).toBe('unsupported-version');
    if (r.kind !== 'ok') expect(describeDecodeProblem(r)).toMatch(/2\.0\.0/);
  });

  it('reports every broken rule', () => {
    const r = decodeSighting(fixture('sighting.invalid.json'), { now });
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') {
      expect(r.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(['id', 'species.commonName', 'observedOn', 'place.coordinates', 'createdAt']),
      );
    }
  });

  it('tells a journal apart from a sighting', () => {
    expect(decodeSighting(fixture('journal.valid.json'), { now }).kind).toBe('wrong-format');
  });

  it('handles bytes that are not JSON', () => {
    expect(decodeSighting(new Uint8Array([0xff, 0xfe, 0x00]), { now }).kind).toBe('not-json');
  });

  it('refuses sightings dated in the future', () => {
    const r = validateSighting({ ...JSON.parse(new TextDecoder().decode(fixture('sighting.valid.json'))), observedOn: '2030-01-01' }, { now });
    expect(r.ok).toBe(false);
  });
});

describe('journal', () => {
  it('decodes the fixture and rejects duplicate ids', () => {
    expect(decodeJournal(fixture('journal.valid.json')).kind).toBe('ok');
    const j = JSON.parse(new TextDecoder().decode(fixture('journal.valid.json')));
    j.entries.push({ ...j.entries[0] });
    expect(decodeJournal(new TextEncoder().encode(JSON.stringify(j))).kind).toBe('invalid');
  });

  it('encodes with format keys first', () => {
    const bytes = encodeJournal({
      owner: '1234567890abcdef1234567890abcdef12345678',
      feedTopic: JOURNAL_TOPIC_STRING,
      sequence: 0,
      previous: null,
      updatedAt: '2026-09-14T02:05:40Z',
      entries: [],
    });
    expect(new TextDecoder().decode(bytes).startsWith('{"format":"org.deccanbirders.journal","formatVersion":"1.0.0",')).toBe(true);
  });
});
