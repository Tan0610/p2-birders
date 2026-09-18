import { useState } from 'react';
import { type LoadedJournal, loadHistory } from '../journal';
import { bytesUrl } from '../swarm/bytes';

export function Provenance({ gateway, loaded }: { gateway: string; loaded: LoadedJournal }) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadHistory>> | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const { journal, feed } = loaded;

  const walk = async () => {
    setState('busy');
    try {
      setHistory(await loadHistory(gateway, journal));
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  return (
    <details className="provenance">
      <summary>How this page found the journal</summary>
      <ol className="trail">
        {feed ? (
          <li>
            Looked up feed index <strong>{feed.index.toString()}</strong> of topic <code>{journal.feedTopic}</code> owned by{' '}
            <code>0x{journal.owner}</code>, at chunk <code className="ref">{feed.socAddress}</code>. It was written{' '}
            {new Date(feed.timestamp * 1000).toLocaleString('en-IN')}.
          </li>
        ) : (
          <li>Opened directly by its reference; no feed lookup.</li>
        )}
        <li>
          Read the journal from{' '}
          <a href={bytesUrl(gateway, loaded.journalRef)} target="_blank" rel="noreferrer">
            /bytes/{loaded.journalRef.slice(0, 16)}…
          </a>{' '}
          and checked it against <code>{journal.format}</code> {journal.formatVersion}.
        </li>
        <li>Fetched each sighting from /bytes and checked it against its own format field.</li>
      </ol>

      {journal.previous ? (
        history ? (
          <ul className="history">
            {history.map((h) => (
              <li key={h.ref}>
                Edition {h.sequence}, {new Date(h.updatedAt).toLocaleDateString('en-IN')}, {h.entries} sightings{' '}
                <code className="ref">{h.ref.slice(0, 12)}…</code>
              </li>
            ))}
            {history.length === 0 && <li>No earlier editions could be read.</li>}
          </ul>
        ) : (
          <button type="button" className="button button-quiet" onClick={walk} disabled={state === 'busy'}>
            {state === 'busy' ? 'Walking back…' : 'Show earlier editions'}
          </button>
        )
      ) : (
        <p className="muted">This is the first edition of the journal.</p>
      )}
      {state === 'failed' && <p className="muted">An earlier edition could not be read from this gateway.</p>}
    </details>
  );
}
