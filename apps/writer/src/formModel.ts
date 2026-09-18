import type { PlacePrecision, SightingDraft } from '@deccan-birders/format';
import { APP_VERSION } from './config';

export interface FormState {
  id: string;
  commonName: string;
  scientificName: string;
  count: string;
  observedOn: string;
  observedTime: string;
  placeName: string;
  precision: PlacePrecision;
  lat: string;
  lon: string;
  observer: string;
  notes: string;
}

export function localToday(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyForm(observer = ''): FormState {
  return {
    id: crypto.randomUUID(),
    commonName: '',
    scientificName: '',
    count: '1',
    observedOn: localToday(),
    observedTime: '',
    placeName: '',
    precision: 'approximate',
    lat: '',
    lon: '',
    observer,
    notes: '',
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Turns what was typed into a draft record. Validation happens in the format package. */
export function toDraft(form: FormState, now = new Date()): SightingDraft {
  const count = Number.parseInt(form.count, 10);
  const lat = Number.parseFloat(form.lat);
  const lon = Number.parseFloat(form.lon);
  const hasCoords = form.lat.trim() !== '' && form.lon.trim() !== '';
  const coordinates =
    form.precision === 'none' || !hasCoords
      ? undefined
      : form.precision === 'approximate'
        ? { lat: round2(lat), lon: round2(lon) }
        : { lat, lon };

  return {
    id: form.id,
    species: {
      commonName: form.commonName.trim(),
      ...(form.scientificName.trim() ? { scientificName: form.scientificName.trim() } : {}),
    },
    ...(Number.isFinite(count) ? { count } : {}),
    observedOn: form.observedOn,
    ...(form.observedTime ? { observedTime: form.observedTime } : {}),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    place: {
      name: form.placeName.trim(),
      precision: form.precision,
      ...(coordinates ? { coordinates } : {}),
    },
    observer: { name: form.observer.trim() },
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    createdAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    generator: { name: 'deccan-birders-field-journal', version: APP_VERSION },
  };
}

/** Field ids for focusing the first invalid input. */
export const FIELD_FOR_PATH: Record<string, string> = {
  'species.commonName': 'f-species',
  'species.scientificName': 'f-scientific',
  count: 'f-count',
  observedOn: 'f-date',
  observedTime: 'f-time',
  'place.name': 'f-place',
  'place.coordinates': 'f-lat',
  'place.coordinates.lat': 'f-lat',
  'place.coordinates.lon': 'f-lon',
  'observer.name': 'f-observer',
  notes: 'f-notes',
};

export const FIELD_LABEL: Record<string, string> = {
  'f-species': 'Bird',
  'f-scientific': 'Scientific name',
  'f-count': 'How many',
  'f-date': 'Date',
  'f-time': 'Time',
  'f-place': 'Place',
  'f-lat': 'Latitude',
  'f-lon': 'Longitude',
  'f-observer': 'Seen by',
  'f-notes': 'Notes',
};
