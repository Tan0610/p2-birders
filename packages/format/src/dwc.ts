/**
 * Darwin Core (https://dwc.tdwg.org/terms/) occurrence mapping for sighting records,
 * and an RFC 4180 CSV serialiser for it. Pure functions, no dependencies: this is how
 * a journal leaves Swarm for GBIF, iNaturalist imports, a spreadsheet or a museum.
 *
 * FORMAT.md "Mapping to Darwin Core" is the contract. tools/read-sightings carries its
 * own copy of this mapping (it imports nothing from the repo); tests/dwc-parity.test.ts
 * holds both to the same golden file, packages/format/fixtures/dwc/expected.csv.
 */
import type { SightingRecord } from './types';

/** Column order of the CSV. Every term is a Darwin Core (dwc:) or Dublin Core (dcterms:) term. */
export const DWC_TERMS = [
  'occurrenceID',
  'basisOfRecord',
  'occurrenceStatus',
  'datasetName',
  'modified',
  'scientificName',
  'vernacularName',
  'individualCount',
  'eventDate',
  'locality',
  'decimalLatitude',
  'decimalLongitude',
  'geodeticDatum',
  'coordinateUncertaintyInMeters',
  'coordinatePrecision',
  'informationWithheld',
  'dataGeneralizations',
  'recordedBy',
  'occurrenceRemarks',
  'associatedMedia',
  'references',
  'dynamicProperties',
] as const;
export type DwcTerm = (typeof DWC_TERMS)[number];
/** One occurrence. A term that is absent is written as an empty CSV field. */
export type DwcOccurrence = Partial<Record<DwcTerm, string>>;

/** Where associatedMedia and references point unless told otherwise. */
export const DWC_DEFAULT_GATEWAY = 'https://api.gateway.ethswarm.org';

/**
 * coordinateUncertaintyInMeters for precision "approximate". Rounding to 2 decimal places
 * moves a point at most 0.005° in each axis: 556 m north-south, at most 556 m east-west (at
 * the equator), so at most 786 m in a straight line. 1000 m covers that plus the unknown
 * error of the original fix, and is the "about 1 km" FORMAT.md promises.
 */
export const DWC_APPROXIMATE_UNCERTAINTY_M = 1000;

export const DWC_WITHHELD_APPROXIMATE =
  'Precise coordinates withheld by the observer; published rounded to 2 decimal places (about 1 km).';
export const DWC_WITHHELD_NONE = 'Coordinates not shared by the observer; only the place name is given.';
export const DWC_GENERALIZED_APPROXIMATE = 'Coordinates rounded to 2 decimal places before publication.';

export interface DwcContext {
  /** 64-hex Swarm reference of the record bytes. */
  recordRef: string;
  /** Bee API base URL used for associatedMedia and references. */
  gateway?: string;
  /** 40-hex journal address the record was listed in, if known. */
  journalOwner?: string;
}

const hex = (v: string) => v.replace(/^0x/i, '').toLowerCase();

/** A number as plain decimal text, never exponent notation. */
function decimal(n: number): string {
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(12).replace(/\.?0+$/, '') : s;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The UTC offset ("+05:30") of a local date and time in an IANA time zone, or undefined
 * if the zone is unknown to this runtime, the time does not exist there (a DST gap), or
 * the offset is not a whole number of minutes (historic local mean time).
 */
export function dwcUtcOffset(timeZone: string, date: string, time: string): string | undefined {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !timeZone.trim()) return undefined;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return undefined;
  }
  // The wall-clock reading in the zone at instant `at`, expressed as if it were UTC.
  const wallAt = (at: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(at))) if (part.type !== 'literal') p[part.type] = Number(part.value);
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  };
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let instant = wall - (wallAt(wall) - wall);
  instant = wall - (wallAt(instant) - instant);
  if (wallAt(instant) !== wall) return undefined;
  const minutes = (wall - instant) / 60000;
  if (!Number.isInteger(minutes)) return undefined;
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** ISO 8601 eventDate: the date, plus the local time if known, plus its offset if the zone is known. */
export function dwcEventDate(observedOn: string, observedTime?: string, timeZone?: string): string {
  if (!observedTime) return observedOn;
  const offset = timeZone ? dwcUtcOffset(timeZone, observedOn, observedTime) : undefined;
  return `${observedOn}T${observedTime}${offset ?? ''}`;
}

/** Maps one validated sighting record to a Darwin Core occurrence. */
export function toDwcOccurrence(record: SightingRecord, ctx: DwcContext): DwcOccurrence {
  const gateway = (ctx.gateway ?? DWC_DEFAULT_GATEWAY).replace(/\/+$/, '');
  const recordRef = hex(ctx.recordRef);
  const owner = ctx.journalOwner ? hex(ctx.journalOwner) : undefined;
  const { place } = record;
  const out: DwcOccurrence = {
    occurrenceID: `urn:uuid:${record.id.toLowerCase()}`,
    basisOfRecord: 'HumanObservation',
    occurrenceStatus: 'present',
    datasetName: owner ? `Deccan Birders journal 0x${owner}` : 'Deccan Birders sightings',
    modified: record.createdAt,
    scientificName: record.species.scientificName,
    vernacularName: record.species.commonName,
    individualCount: record.count === undefined ? undefined : String(record.count),
    eventDate: dwcEventDate(record.observedOn, record.observedTime, record.timeZone),
    locality: place.name,
    recordedBy: record.observer.name,
    occurrenceRemarks: record.notes,
    associatedMedia: record.photo ? `${gateway}/bytes/${hex(record.photo.ref)}` : undefined,
    references: `${gateway}/bytes/${recordRef}`,
  };
  if (place.precision !== 'none' && place.coordinates) {
    const approximate = place.precision === 'approximate';
    const lat = approximate ? round2(place.coordinates.lat) : place.coordinates.lat;
    const lon = approximate ? round2(place.coordinates.lon) : place.coordinates.lon;
    out.decimalLatitude = decimal(lat);
    out.decimalLongitude = decimal(lon);
    out.geodeticDatum = 'WGS84';
    if (approximate) {
      out.coordinateUncertaintyInMeters = String(DWC_APPROXIMATE_UNCERTAINTY_M);
      out.coordinatePrecision = '0.01';
      out.informationWithheld = DWC_WITHHELD_APPROXIMATE;
      out.dataGeneralizations = DWC_GENERALIZED_APPROXIMATE;
    }
    // exact: the format does not record the accuracy of the fix, so uncertainty stays empty
    // ("unknown" in Darwin Core) rather than an invented number.
  } else {
    out.informationWithheld = DWC_WITHHELD_NONE;
  }
  out.dynamicProperties = JSON.stringify({
    swarmRecordRef: recordRef,
    ...(owner ? { swarmJournalOwner: `0x${owner}` } : {}),
    format: record.format,
    formatVersion: record.formatVersion,
    placePrecision: place.precision,
    ...(record.timeZone ? { timeZone: record.timeZone } : {}),
  });
  return out;
}

/** One CSV field per RFC 4180: quoted if it holds a comma, a double quote, CR or LF; quotes doubled. */
export function csvField(value: string | undefined): string {
  const v = value ?? '';
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC 4180 CSV: a header row of term names, then one row per occurrence, CRLF line endings. */
export function dwcCsv(rows: DwcOccurrence[]): string {
  const lines = [DWC_TERMS.join(','), ...rows.map((row) => DWC_TERMS.map((term) => csvField(row[term])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/** Records (with the Swarm reference each was read from) straight to a Darwin Core CSV. */
export function toDwcCsv(
  records: { ref: string; record: SightingRecord }[],
  options: { gateway?: string; journalOwner?: string } = {},
): string {
  return dwcCsv(records.map(({ ref, record }) => toDwcOccurrence(record, { ...options, recordRef: ref })));
}
