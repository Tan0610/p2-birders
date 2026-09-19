import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DWC_TERMS,
  type SightingRecord,
  csvField,
  decodeSighting,
  dwcCsv,
  dwcEventDate,
  dwcUtcOffset,
  toDwcCsv,
  toDwcOccurrence,
} from '../src';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const fixture = JSON.parse(readFileSync(here('../fixtures/dwc/sightings.json'), 'utf8')) as {
  gateway: string;
  journal: { owner: string };
  records: { ref: string; record: SightingRecord }[];
};
const byRef = (digit: string) => fixture.records.find((r) => r.ref === digit.repeat(64))!;
const REF = 'ab'.repeat(32);

const base: SightingRecord = {
  format: 'org.deccanbirders.sighting',
  formatVersion: '1.0.0',
  id: '3F6C2A9E-8B1D-4C7E-9A2F-5D0E1B7C4A61',
  species: { commonName: 'Indian Robin' },
  observedOn: '2026-09-14',
  place: { name: 'Hussain Sagar', precision: 'none' },
  observer: { name: 'Meera' },
  createdAt: '2026-09-14T02:05:11Z',
};

describe('the shared fixture', () => {
  it('holds records that Almanac would accept', () => {
    for (const { record } of fixture.records) {
      const result = decodeSighting(new TextEncoder().encode(JSON.stringify(record)), { now: new Date('2026-09-19T00:00:00Z') });
      expect(result.kind, record.id).toBe('ok');
    }
  });

  it('maps to expected.csv byte for byte', () => {
    const expected = readFileSync(here('../fixtures/dwc/expected.csv'), 'utf8');
    expect(toDwcCsv(fixture.records, { gateway: fixture.gateway, journalOwner: fixture.journal.owner })).toBe(expected);
  });
});

describe('toDwcOccurrence', () => {
  it('fills the fixed terms and a urn:uuid occurrenceID', () => {
    const o = toDwcOccurrence(base, { recordRef: `0x${REF.toUpperCase()}` });
    expect(o.occurrenceID).toBe('urn:uuid:3f6c2a9e-8b1d-4c7e-9a2f-5d0e1b7c4a61');
    expect(o.basisOfRecord).toBe('HumanObservation');
    expect(o.occurrenceStatus).toBe('present');
    expect(o.vernacularName).toBe('Indian Robin');
    expect(o.recordedBy).toBe('Meera');
    expect(o.locality).toBe('Hussain Sagar');
    expect(o.modified).toBe('2026-09-14T02:05:11Z');
    expect(o.references).toBe(`https://api.gateway.ethswarm.org/bytes/${REF}`);
    expect(o.datasetName).toBe('Deccan Birders sightings');
  });

  it('leaves missing optional fields empty rather than inventing them', () => {
    const o = toDwcOccurrence(base, { recordRef: REF });
    for (const term of ['scientificName', 'individualCount', 'occurrenceRemarks', 'associatedMedia'] as const) expect(o[term]).toBeUndefined();
    expect(JSON.parse(o.dynamicProperties!)).toEqual({
      swarmRecordRef: REF,
      format: 'org.deccanbirders.sighting',
      formatVersion: '1.0.0',
      placePrecision: 'none',
    });
  });

  it('precision none: no coordinates, and says they were withheld', () => {
    const o = toDwcOccurrence(base, { recordRef: REF });
    expect(o.decimalLatitude).toBeUndefined();
    expect(o.decimalLongitude).toBeUndefined();
    expect(o.geodeticDatum).toBeUndefined();
    expect(o.coordinateUncertaintyInMeters).toBeUndefined();
    expect(o.informationWithheld).toMatch(/not shared/);
  });

  it('precision exact: coordinates as recorded, WGS84, uncertainty left unknown', () => {
    const o = toDwcOccurrence(byRef('3').record, { recordRef: REF });
    expect([o.decimalLatitude, o.decimalLongitude, o.geodeticDatum]).toEqual(['15.33512', '76.46234', 'WGS84']);
    expect(o.coordinateUncertaintyInMeters).toBeUndefined();
    expect(o.informationWithheld).toBeUndefined();
    expect(o.dataGeneralizations).toBeUndefined();
  });

  it('precision approximate: rounded to 2 decimals, 1000 m, precision 0.01, and says so', () => {
    const o = toDwcOccurrence(byRef('5').record, { recordRef: REF });
    expect([o.decimalLatitude, o.decimalLongitude]).toEqual(['40.66', '-73.97']);
    expect(o.coordinateUncertaintyInMeters).toBe('1000');
    expect(o.coordinatePrecision).toBe('0.01');
    expect(o.informationWithheld).toMatch(/rounded to 2 decimal places/);
    expect(o.dataGeneralizations).toMatch(/rounded/);
  });

  it('points associatedMedia at the photo bytes on the chosen gateway', () => {
    const o = toDwcOccurrence(byRef('1').record, { recordRef: REF, gateway: 'http://localhost:1633/' });
    expect(o.associatedMedia).toBe('http://localhost:1633/bytes/a3b1c9d27e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeef');
    expect(o.references).toBe(`http://localhost:1633/bytes/${REF}`);
  });

  it('names the journal in datasetName and dynamicProperties when it is known', () => {
    const o = toDwcOccurrence(base, { recordRef: REF, journalOwner: '0xF80B71C26F071455D837C5BD959AEC084523B002' });
    expect(o.datasetName).toBe('Deccan Birders journal 0xf80b71c26f071455d837c5bd959aec084523b002');
    expect(JSON.parse(o.dynamicProperties!).swarmJournalOwner).toBe('0xf80b71c26f071455d837c5bd959aec084523b002');
  });
});

describe('eventDate and time zones', () => {
  it('is just the date when no time was recorded', () => {
    expect(dwcEventDate('1998-01-11')).toBe('1998-01-11');
    expect(dwcEventDate('1998-01-11', undefined, 'Asia/Kolkata')).toBe('1998-01-11');
  });

  it('adds the offset of the recorded zone on that date', () => {
    expect(dwcEventDate('2026-09-14', '06:40', 'Asia/Kolkata')).toBe('2026-09-14T06:40+05:30');
    expect(dwcEventDate('2026-06-01', '05:10', 'Europe/London')).toBe('2026-06-01T05:10+01:00');
    expect(dwcEventDate('2026-01-10', '05:10', 'Europe/London')).toBe('2026-01-10T05:10+00:00');
    expect(dwcEventDate('2026-01-10', '08:00', 'America/New_York')).toBe('2026-01-10T08:00-05:00');
    expect(dwcEventDate('2026-07-10', '08:00', 'America/New_York')).toBe('2026-07-10T08:00-04:00');
  });

  it('leaves the offset off when the zone is unknown or absent', () => {
    expect(dwcEventDate('2026-09-10', '19:20', 'Mars/Olympus_Mons')).toBe('2026-09-10T19:20');
    expect(dwcEventDate('2026-02-21', '16:05')).toBe('2026-02-21T16:05');
  });

  it('leaves the offset off for a local time that does not exist (spring-forward gap)', () => {
    expect(dwcUtcOffset('Europe/London', '2026-03-29', '01:30')).toBeUndefined();
    expect(dwcUtcOffset('Europe/London', '2026-03-29', '02:30')).toBe('+01:00');
  });
});

describe('CSV (RFC 4180)', () => {
  it('quotes commas, quotes and line breaks, and doubles quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(undefined)).toBe('');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('cr\rhere')).toBe('"cr\rhere"');
  });

  it('writes a header of term names and CRLF-terminated rows', () => {
    const csv = dwcCsv([{ occurrenceID: 'urn:uuid:x', occurrenceRemarks: 'one, "two"' }]);
    const [header, row, end] = csv.split('\r\n');
    expect(header).toBe(DWC_TERMS.join(','));
    expect(row!.split(',')).toHaveLength(DWC_TERMS.length + 1); // the quoted comma adds one split
    expect(row).toContain('"one, ""two"""');
    expect(end).toBe('');
  });

  it('keeps non-ASCII text as UTF-8', () => {
    const csv = toDwcCsv([{ ref: REF, record: { ...base, observer: { name: 'Mīrā' }, notes: 'कोकिळ' } }]);
    expect(new TextDecoder().decode(new TextEncoder().encode(csv))).toContain('Mīrā');
    expect(csv).toContain('कोकिळ');
  });
});
