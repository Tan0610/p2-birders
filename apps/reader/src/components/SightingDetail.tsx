import type { SightingRecord } from '@deccan-birders/format';
import { useEffect, useRef } from 'react';
import { bytesUrl } from '../swarm/bytes';
import { formatDay, usePhoto } from './SightingSheet';

export function SightingDetail(props: { gateway: string; record: SightingRecord; recordRef: string; onClose: () => void }) {
  const { record } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = usePhoto(props.gateway, record);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const coords = record.place.coordinates;
  const mapLink = coords ? `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=${record.place.precision === 'exact' ? 16 : 13}/${coords.lat}/${coords.lon}` : null;

  return (
    <dialog ref={dialog} className="detail" onClose={props.onClose} aria-labelledby="detail-title">
      <button type="button" className="detail-close" onClick={() => dialog.current?.close()} aria-label="Close">
        Close
      </button>
      <div className="detail-body">
        {record.photo && (
          <figure className="detail-photo">
            {photo.url ? (
              <img src={photo.url} alt={`${record.species.commonName} at ${record.place.name}`} />
            ) : (
              <div className="mount-wait">{photo.failed ? (photo.mismatch ? photo.reason : `The photo could not be fetched from this gateway: ${photo.reason}`) : 'Developing…'}</div>
            )}
          </figure>
        )}
        <div>
          <h2 id="detail-title">{record.species.commonName}</h2>
          {record.species.scientificName && <p className="sci">{record.species.scientificName}</p>}
          <dl className="detail-facts">
            {record.count !== undefined && (
              <>
                <dt>How many</dt>
                <dd>{record.count}</dd>
              </>
            )}
            <dt>When</dt>
            <dd>
              {formatDay(record.observedOn)}
              {record.observedTime ? ` at ${record.observedTime}` : ''}
              {record.timeZone ? ` (${record.timeZone})` : ''}
            </dd>
            <dt>Where</dt>
            <dd>
              {record.place.name}
              {coords && mapLink && (
                <>
                  <br />
                  <a href={mapLink} target="_blank" rel="noreferrer">
                    {coords.lat}, {coords.lon}
                  </a>{' '}
                  <span className="muted">({record.place.precision === 'exact' ? 'exact spot' : 'rounded to about a kilometre'})</span>
                </>
              )}
              {record.place.precision === 'none' && <span className="muted"> (no coordinates shared)</span>}
            </dd>
            <dt>Seen by</dt>
            <dd>{record.observer.name}</dd>
            {record.notes && (
              <>
                <dt>Notes</dt>
                <dd className="detail-notes">{record.notes}</dd>
              </>
            )}
          </dl>

          <p className="valid-seal">
            Valid <code>{record.format}</code> {record.formatVersion}
          </p>

          <details className="raw">
            <summary>The stored record, as bytes on Swarm</summary>
            <p>
              <a href={bytesUrl(props.gateway, props.recordRef)} target="_blank" rel="noreferrer">
                /bytes/{props.recordRef.slice(0, 16)}…
              </a>
              {record.photo && (
                <>
                  {' and the photo at '}
                  <a href={bytesUrl(props.gateway, record.photo.ref)} target="_blank" rel="noreferrer">
                    /bytes/{record.photo.ref.slice(0, 16)}…
                  </a>
                </>
              )}
            </p>
            <pre>{JSON.stringify(record, null, 2)}</pre>
          </details>
        </div>
      </div>
    </dialog>
  );
}
