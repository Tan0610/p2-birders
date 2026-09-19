import type { SightingRecord } from '@deccan-birders/format';
import { useEffect, useRef, useState } from 'react';
import { loadPhotoUrl } from '../journal';
import { ReaderError } from '../swarm/http';

type PhotoState = { url: string | null; failed: false } | { url: null; failed: true; mismatch: boolean; reason: string };

/** Lazily fetches the photo bytes and turns them into an object URL typed by the record. */
export function usePhoto(gateway: string, record: SightingRecord | null, enabled = true) {
  const [state, setState] = useState<PhotoState>({ url: null, failed: false });
  useEffect(() => {
    if (!record?.photo || !enabled) return;
    const ctrl = new AbortController();
    let url: string | null = null;
    loadPhotoUrl(gateway, record, ctrl.signal)
      .then((u) => {
        url = u;
        setState({ url: u, failed: false });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        // INVALID_DOCUMENT here means the bytes did not match the record's byteLength.
        const mismatch = err instanceof ReaderError && err.code === 'INVALID_DOCUMENT';
        setState({ url: null, failed: true, mismatch, reason: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [gateway, record, enabled]);
  return state;
}

export function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function SightingSheet(props: { gateway: string; record: SightingRecord; index: number; onOpen: () => void }) {
  const { record } = props;
  const [visible, setVisible] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = articleRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  const photo = usePhoto(props.gateway, record, visible);
  const tilt = ((props.index * 53) % 5) - 2;

  return (
    <li className="sheet" style={{ ['--tilt' as string]: `${tilt * 0.6}deg` }}>
      <article
        ref={articleRef}
        aria-labelledby={`s-${record.id}`}
      >
        {record.photo && (
          <div className="mount">
            <span className="strap strap-a" aria-hidden="true" />
            <span className="strap strap-b" aria-hidden="true" />
            {photo.url ? (
              <img src={photo.url} alt={`${record.species.commonName} at ${record.place.name}`} loading="lazy" />
            ) : (
              <div className={`mount-wait ${photo.failed ? 'mount-failed' : ''}`}>{photo.failed ? (photo.mismatch ? 'Photo does not match its record' : 'Photo not reachable') : 'Developing…'}</div>
            )}
          </div>
        )}

        <div className="label-slip">
          <h3 id={`s-${record.id}`}>
            <button type="button" className="sheet-open" onClick={props.onOpen}>
              {record.species.commonName}
              {record.count && record.count > 1 ? <span className="count"> ×{record.count}</span> : null}
            </button>
          </h3>
          {record.species.scientificName && <p className="sci">{record.species.scientificName}</p>}
          <dl>
            <dt>Where</dt>
            <dd>{record.place.name}</dd>
            <dt>When</dt>
            <dd>
              {formatDay(record.observedOn)}
              {record.observedTime ? `, ${record.observedTime}` : ''}
            </dd>
            <dt>Seen by</dt>
            <dd>{record.observer.name}</dd>
          </dl>
        </div>
        {record.notes && <p className="sheet-notes">{record.notes}</p>}
      </article>
    </li>
  );
}
