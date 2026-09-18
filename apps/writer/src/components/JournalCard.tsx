import type { JournalEntry } from '@deccan-birders/format';
import { config } from '../config';
import { Binoculars, EmptyNest } from './Doodles';
import { CopyButton } from './CopyButton';

export interface FiledNote {
  recordRef: string;
  commonName: string;
  observedOn: string;
  filedAt: string;
}

export function JournalCard(props: {
  owner: string | null;
  filed: FiledNote[];
  pending: JournalEntry[];
  retrying: boolean;
  onRetryJournal: () => void;
}) {
  const address = props.owner ? `0x${props.owner.replace(/^0x/i, '')}` : null;

  return (
    <aside className="envelope" aria-labelledby="journal-title">
      <Binoculars className="envelope-doodle" />
      <h2 id="journal-title">Your journal</h2>

      {address ? (
        <>
          <p className="envelope-lead">
            This address always leads to your latest list of sightings. Share it with the group; they can open it in any reader.
          </p>
          <p className="address">
            <code className="ref">{address}</code>
            <CopyButton text={address} label="Copy journal address" />
          </p>
          <a className="envelope-link" href={`${config.readerUrl}/?owner=${address}`} target="_blank" rel="noreferrer">
            Read it in Almanac, the separate reader
          </a>
        </>
      ) : (
        <p className="envelope-lead">Sign in and your journal address appears here: one address for all your sightings, now and later.</p>
      )}

      {props.pending.length > 0 && (
        <div className="pending" role="status">
          <p>
            {props.pending.length === 1 ? 'One sighting is' : `${props.pending.length} sightings are`} stored but not in your journal
            list yet.
          </p>
          <button type="button" className="btn btn-small" onClick={props.onRetryJournal} disabled={props.retrying || !address}>
            {props.retrying ? 'Updating…' : 'Retry journal update'}
          </button>
        </div>
      )}

      <h3 className="tags-title">Filed from this device</h3>
      {props.filed.length === 0 ? (
        <div className="tags-empty">
          <EmptyNest className="nest" />
          <p>Nothing yet. Your first sighting gets a tag here.</p>
        </div>
      ) : (
        <ul className="tags">
          {props.filed.slice(0, 8).map((f, i) => (
            <li key={f.recordRef} className="tag" style={{ ['--tilt' as string]: `${((i * 37) % 7) - 3}deg` }}>
              <span className="tag-hole" aria-hidden="true" />
              <span className="tag-name">{f.commonName}</span>
              <span className="tag-date">{formatDate(f.observedOn)}</span>
              <a className="tag-link" href={`${config.readerUrl}/?record=${f.recordRef}`} target="_blank" rel="noreferrer">
                view<span className="visually-hidden"> {f.commonName} in Almanac</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
