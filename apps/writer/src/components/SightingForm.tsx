import type { PlacePrecision } from '@deccan-birders/format';
import { type FormEvent, useId, useState } from 'react';
import { DECCAN_SPECIES, scientificNameFor } from '../data/deccanSpecies';
import type { FormState } from '../formModel';
import type { PreparedPhoto } from '../photo';
import { Squiggle } from './Doodles';

interface Props {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  photo: PreparedPhoto | null;
  photoBusy: boolean;
  onPickPhoto: (file: File | null) => void;
  fieldErrors: Record<string, string>;
  disabled: boolean;
  blockedReason: string | null;
  submitting: boolean;
  onSubmit: () => void;
}

const PRECISIONS: { value: PlacePrecision; label: string; hint: string }[] = [
  { value: 'approximate', label: 'Roughly', hint: 'rounded to about a kilometre' },
  { value: 'exact', label: 'Exact spot', hint: 'as your phone reports it' },
  { value: 'none', label: 'Just the name', hint: 'no coordinates, good for nesting sites' },
];

export function SightingForm(p: Props) {
  const { form, fieldErrors: errors } = p;
  const listId = useId();
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied'>('idle');

  const err = (id: string) =>
    errors[id] ? (
      <span className="field-error" id={`${id}-err`}>
        {errors[id]}
      </span>
    ) : null;
  const described = (id: string, extra?: string) => [errors[id] ? `${id}-err` : '', extra ?? ''].filter(Boolean).join(' ') || undefined;

  const locate = () => {
    if (!('geolocation' in navigator)) return setLocating('denied');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        p.onChange({
          lat: pos.coords.latitude.toFixed(5),
          lon: pos.coords.longitude.toFixed(5),
          precision: form.precision === 'none' ? 'approximate' : form.precision,
        });
        setLocating('idle');
      },
      () => setLocating('denied'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSubmit();
  };

  return (
    <form className="sighting-form" onSubmit={submit} noValidate aria-describedby="form-intro">
      <h1 className="page-title">
        Spotted something?
        <Squiggle className="title-squiggle" />
      </h1>
      <p id="form-intro" className="page-intro">
        Write it down here. It is saved to Swarm under your own name, and any app that knows the format can read it back.
      </p>

      <div className="row row-species">
        <label className="field grow" htmlFor="f-species">
          <span className="label">Bird</span>
          <input
            id="f-species"
            list={listId}
            autoComplete="off"
            placeholder="Indian Robin"
            value={form.commonName}
            aria-invalid={Boolean(errors['f-species'])}
            aria-describedby={described('f-species')}
            onChange={(e) => {
              const commonName = e.target.value;
              const sci = scientificNameFor(commonName);
              p.onChange({ commonName, ...(sci ? { scientificName: sci } : {}) });
            }}
          />
          <datalist id={listId}>
            {DECCAN_SPECIES.map(([c, s]) => (
              <option key={c} value={c} label={s} />
            ))}
          </datalist>
          {err('f-species')}
        </label>
        <label className="field narrow" htmlFor="f-count">
          <span className="label">How many</span>
          <input
            id="f-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={form.count}
            aria-invalid={Boolean(errors['f-count'])}
            aria-describedby={described('f-count')}
            onChange={(e) => p.onChange({ count: e.target.value })}
          />
          {err('f-count')}
        </label>
      </div>

      <label className="field" htmlFor="f-scientific">
        <span className="label">
          Scientific name <span className="optional">if you know it</span>
        </span>
        <input
          id="f-scientific"
          className="italic"
          autoComplete="off"
          placeholder="Copsychus fulicatus"
          value={form.scientificName}
          onChange={(e) => p.onChange({ scientificName: e.target.value })}
        />
      </label>

      <div className="row">
        <label className="field" htmlFor="f-date">
          <span className="label">Date</span>
          <input
            id="f-date"
            type="date"
            value={form.observedOn}
            aria-invalid={Boolean(errors['f-date'])}
            aria-describedby={described('f-date')}
            onChange={(e) => p.onChange({ observedOn: e.target.value })}
          />
          {err('f-date')}
        </label>
        <label className="field" htmlFor="f-time">
          <span className="label">
            Time <span className="optional">optional</span>
          </span>
          <input id="f-time" type="time" value={form.observedTime} onChange={(e) => p.onChange({ observedTime: e.target.value })} />
        </label>
      </div>

      <label className="field" htmlFor="f-place">
        <span className="label">Place</span>
        <input
          id="f-place"
          placeholder="Kas plateau, north end by the pond"
          value={form.placeName}
          aria-invalid={Boolean(errors['f-place'])}
          aria-describedby={described('f-place', 'place-hint')}
          onChange={(e) => p.onChange({ placeName: e.target.value })}
        />
        <span className="hint" id="place-hint">
          Name it the way another birder would find it. “Near the usual spot” helps nobody in twenty years.
        </span>
        {err('f-place')}
      </label>

      <fieldset className="precision">
        <legend className="label">How precisely to share where</legend>
        <div className="precision-options">
          {PRECISIONS.map((opt) => (
            <label key={opt.value} className={`chip ${form.precision === opt.value ? 'chip-on' : ''}`}>
              <input
                type="radio"
                name="precision"
                value={opt.value}
                checked={form.precision === opt.value}
                onChange={() => p.onChange({ precision: opt.value })}
              />
              <span className="chip-label">{opt.label}</span>
              <span className="chip-hint">{opt.hint}</span>
            </label>
          ))}
        </div>

        {form.precision !== 'none' && (
          <div className="coords">
            <label className="field" htmlFor="f-lat">
              <span className="label">Latitude</span>
              <input
                id="f-lat"
                inputMode="decimal"
                placeholder="17.42"
                value={form.lat}
                aria-invalid={Boolean(errors['f-lat'])}
                aria-describedby={described('f-lat')}
                onChange={(e) => p.onChange({ lat: e.target.value })}
              />
              {err('f-lat')}
            </label>
            <label className="field" htmlFor="f-lon">
              <span className="label">Longitude</span>
              <input
                id="f-lon"
                inputMode="decimal"
                placeholder="78.47"
                value={form.lon}
                aria-invalid={Boolean(errors['f-lon'])}
                aria-describedby={described('f-lon')}
                onChange={(e) => p.onChange({ lon: e.target.value })}
              />
              {err('f-lon')}
            </label>
            <button type="button" className="btn btn-quiet locate" onClick={locate} disabled={locating === 'busy'}>
              {locating === 'busy' ? 'Finding you…' : 'Use my location'}
            </button>
            {locating === 'denied' && (
              <span className="hint coords-note" role="status">
                Location is off for this page. Type the coordinates, or share just the name.
              </span>
            )}
          </div>
        )}
      </fieldset>

      <label className="field" htmlFor="f-observer">
        <span className="label">Seen by</span>
        <input
          id="f-observer"
          autoComplete="name"
          value={form.observer}
          aria-invalid={Boolean(errors['f-observer'])}
          aria-describedby={described('f-observer')}
          onChange={(e) => p.onChange({ observer: e.target.value })}
        />
        {err('f-observer')}
      </label>

      <label className="field" htmlFor="f-notes">
        <span className="label">
          Notes <span className="optional">behaviour, call, weather</span>
        </span>
        <textarea
          id="f-notes"
          rows={3}
          maxLength={2000}
          placeholder="Pair on the rocks by the path, male flicking his tail up."
          value={form.notes}
          onChange={(e) => p.onChange({ notes: e.target.value })}
        />
      </label>

      <div className="photo-field">
        <span className="label" id="photo-label">
          Photo <span className="optional">optional, shrunk to 1600px, location data stripped</span>
        </span>
        {p.photo ? (
          <figure className="polaroid">
            <span className="tape tape-left" aria-hidden="true" />
            <span className="tape tape-right" aria-hidden="true" />
            <img src={p.photo.previewUrl} alt={`Photo of ${form.commonName || 'the sighting'}`} />
            <figcaption>
              {(p.photo.bytes.byteLength / 1024).toFixed(0)} KB, {p.photo.width}×{p.photo.height}
              <button type="button" className="link-button" onClick={() => p.onPickPhoto(null)}>
                Remove
              </button>
            </figcaption>
          </figure>
        ) : (
          <label className="photo-drop" htmlFor="f-photo">
            <input
              id="f-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              aria-labelledby="photo-label"
              onChange={(e) => p.onPickPhoto(e.target.files?.[0] ?? null)}
            />
            <span>{p.photoBusy ? 'Shrinking the photo…' : 'Add a photo'}</span>
          </label>
        )}
      </div>

      <div className="submit-row">
        <button type="submit" className="btn btn-file" disabled={p.disabled || p.submitting} aria-describedby={p.blockedReason ? 'blocked-why' : undefined}>
          {p.submitting ? 'Filing…' : 'File this sighting'}
        </button>
        {p.blockedReason && (
          <span className="hint blocked-why" id="blocked-why">
            {p.blockedReason}
          </span>
        )}
      </div>
      {hasDraft(form) && !p.submitting && (
        <p className="draft-note" aria-live="polite">
          Draft kept on this device until you file it. It is not on Swarm yet.
        </p>
      )}
    </form>
  );
}

function hasDraft(form: FormState) {
  return Boolean(form.commonName.trim() || form.placeName.trim() || form.notes.trim());
}
