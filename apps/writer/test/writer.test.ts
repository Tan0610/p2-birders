import { JOURNAL_TOPIC_STRING, decodeSighting, encodeSighting } from '@deccan-birders/format';
import { describe, expect, it } from 'vitest';
import { MESSAGES, UploadFailure, classifyError } from '../src/errors';
import { emptyForm, newSightingId, toDraft } from '../src/formModel';
import { buildNextJournal } from '../src/swarm/journal';

const online = () => true;

describe('classifyError gives every failure its own reason', () => {
  const cases: [unknown, string][] = [
    [new Error('Not authenticated. Please login first.'), 'NOT_SIGNED_IN'],
    [new Error("The account's drive has expired. Top it up."), 'DRIVE_EXPIRED'],
    [new Error('Subsidised chunk upload failed: 413 Payload Too Large - body'), 'PAYLOAD_TOO_LARGE'],
    [new Error('Subsidised chunk upload failed: 429 Too Many Requests - slow down'), 'RATE_LIMITED'],
    [new Error('SOC upload failed: 500 Internal Server Error - boom'), 'GATEWAY_5XX'],
    [Object.assign(new Error('Request failed'), { status: 400 }), 'GATEWAY_REJECTED'],
    [new TypeError('Failed to fetch'), 'GATEWAY_CORS_REFUSED'],
    [new Error('Proxy initialization timeout - proxy did not respond within 30000ms'), 'SWARM_ID_UNAVAILABLE'],
    [new Error('Request timed out'), 'TIMEOUT'],
    [new Error('something nobody expected'), 'UNKNOWN'],
  ];
  it.each(cases)('%s → %s', (err, code) => {
    expect(classifyError(err, 'record', online).code).toBe(code);
  });

  it('reports OFFLINE before anything else when the device is offline', () => {
    expect(classifyError(new TypeError('Failed to fetch'), 'record', () => false).code).toBe('OFFLINE');
  });

  it('keeps an existing UploadFailure as it is', () => {
    const f = new UploadFailure('NO_DRIVE', { step: 'check' });
    expect(classifyError(f)).toBe(f);
  });

  it('never shows two failures with the same title', () => {
    const titles = Object.values(MESSAGES).map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('toDraft', () => {
  const base = { ...emptyForm('Meera'), commonName: 'Indian Robin', placeName: 'Hussain Sagar', observedOn: '2026-09-14' };

  it('rounds approximate coordinates to about a kilometre', () => {
    const d = toDraft({ ...base, precision: 'approximate', lat: '17.423456', lon: '78.473219' });
    expect(d.place.coordinates).toEqual({ lat: 17.42, lon: 78.47 });
  });

  it('drops coordinates entirely when only the name is shared', () => {
    const d = toDraft({ ...base, precision: 'none', lat: '17.4', lon: '78.4' });
    expect(d.place.coordinates).toBeUndefined();
  });

  it('produces a record the format accepts, with format keys first in the bytes', () => {
    const bytes = encodeSighting(toDraft({ ...base, precision: 'exact', lat: '17.4234', lon: '78.4732' }), { now: new Date('2026-09-19T00:00:00Z') });
    expect(new TextDecoder().decode(bytes)).toMatch(/^\{"format":"org\.deccanbirders\.sighting","formatVersion":"1\.0\.0"/);
    expect(decodeSighting(bytes, { now: new Date('2026-09-19T00:00:00Z') }).kind).toBe('ok');
  });
});

describe('buildNextJournal', () => {
  const entry = (id: string, ref: string) => ({ ref: ref.repeat(64).slice(0, 64), id, commonName: id, observedOn: '2026-09-01', hasPhoto: false, addedAt: '2026-09-01T00:00:00Z' });

  it('starts at sequence 0 with no previous edition when the feed is empty', () => {
    const j = buildNextJournal(null, '0xABCDEF0123456789abcdef0123456789ABCDEF01', [entry('a', '1')]);
    expect(j.sequence).toBe(0);
    expect(j.previous).toBeNull();
    expect(j.owner).toBe('abcdef0123456789abcdef0123456789abcdef01');
    expect(j.feedTopic).toBe(JOURNAL_TOPIC_STRING);
  });

  it('takes its sequence from the index read off the network and keeps older entries', () => {
    const latest = {
      index: 6n,
      ref: 'f'.repeat(64),
      journal: {
        format: 'org.deccanbirders.journal' as const,
        formatVersion: '1.0.0',
        owner: 'a'.repeat(40),
        feedTopic: JOURNAL_TOPIC_STRING,
        sequence: 6,
        previous: null,
        updatedAt: '2026-09-01T00:00:00Z',
        entries: [entry('old', '2'), entry('dup', '3')],
      },
    };
    const j = buildNextJournal(latest, 'a'.repeat(40), [entry('new', '4'), entry('dup', '5')]);
    expect(j.sequence).toBe(7);
    expect(j.previous).toBe('f'.repeat(64));
    expect(j.entries.map((e) => e.id)).toEqual(['new', 'dup', 'old']);
  });
});

describe('newSightingId', () => {
  it('makes a UUID v4 the format accepts, even without crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    try {
      // @ts-expect-error simulating a non-secure context
      crypto.randomUUID = undefined;
      const id = newSightingId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
