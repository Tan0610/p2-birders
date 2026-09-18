import { useEffect, useRef } from 'react';
import { config } from '../config';
import type { Filed } from '../fileSighting';
import { CopyButton } from './CopyButton';

export function FiledStamp({ filed, onAnother }: { filed: Filed; onAnother: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const readerLink = `${config.readerUrl}/?owner=0x${filed.owner.replace(/^0x/, '')}&hint=${filed.feedIndex}`;

  return (
    <section className="filed" aria-labelledby="filed-title">
      <div className="stamp" aria-hidden="true">
        <span>Filed</span>
        <small>on Swarm</small>
      </div>
      <h2 id="filed-title" ref={headingRef} tabIndex={-1}>
        {filed.record.species.commonName}
        {filed.record.count && filed.record.count > 1 ? ` ×${filed.record.count}` : ''} is in your journal.
      </h2>
      <p>
        Saved through {filed.route}. Your journal is now at edition {filed.feedIndex}, and anyone with your journal address
        can read it, with this app or without it.
      </p>
      <dl className="filed-refs">
        <dt>Sighting</dt>
        <dd>
          <code className="ref">{filed.recordRef}</code>
          <CopyButton text={filed.recordRef} label="Copy sighting reference" />
        </dd>
        <dt>Journal edition</dt>
        <dd>
          <code className="ref">{filed.journalRef}</code>
          <CopyButton text={filed.journalRef} label="Copy journal reference" />
        </dd>
      </dl>
      <div className="filed-actions">
        <a className="btn btn-ink" href={readerLink} target="_blank" rel="noreferrer">
          Open in Almanac
        </a>
        <button type="button" className="btn btn-quiet" onClick={onAnother}>
          File another
        </button>
      </div>
    </section>
  );
}
