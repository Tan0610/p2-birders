import { useEffect, useRef } from 'react';
import { config } from '../config';
import type { UploadFailure } from '../errors';
import { FIELD_LABEL } from '../formModel';

/**
 * Shows exactly what failed and what to do next. The code, title and message
 * differ for every failure kind; the raw detail is one click away.
 */
export function ErrorPanel(props: {
  failure: UploadFailure;
  fieldIds: string[];
  onRetry: () => void;
  onRetryJournal: () => void;
  onSignIn: () => void;
  onOpenRoute: () => void;
  onChoosePhoto: () => void;
  onDismiss: () => void;
}) {
  const { failure } = props;
  const copy = failure.copy;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (failure.code !== 'VALIDATION') headingRef.current?.focus();
  }, [failure]);

  return (
    <section className="error-slip" role="alert" aria-labelledby="error-title">
      <h2 id="error-title" ref={headingRef} tabIndex={-1}>
        {copy.title}
      </h2>
      <p>{copy.message}</p>

      {failure.code === 'VALIDATION' && props.fieldIds.length > 0 && (
        <ul className="error-fields">
          {props.fieldIds.map((id) => (
            <li key={id}>
              <a href={`#${id}`}>{FIELD_LABEL[id] ?? id}</a>
            </li>
          ))}
        </ul>
      )}

      {failure.recordRef && (
        <p className="error-saved">
          The sighting itself is stored at <code className="ref">{failure.recordRef}</code>.{' '}
          <a href={`${config.readerUrl}/?record=${failure.recordRef}`} target="_blank" rel="noreferrer">
            Open it in Almanac
          </a>
        </p>
      )}

      <p className="error-next">{copy.next}</p>

      <div className="error-actions">
        {copy.action === 'retry' && (
          <button type="button" className="btn btn-small" onClick={props.onRetry}>
            Try again
          </button>
        )}
        {copy.action === 'retry-journal' && (
          <button type="button" className="btn btn-small" onClick={props.onRetryJournal}>
            Retry journal update
          </button>
        )}
        {copy.action === 'sign-in' && (
          <button type="button" className="btn btn-small" onClick={props.onSignIn}>
            Sign in
          </button>
        )}
        {copy.action === 'open-swarm-id' && (
          <a className="btn btn-small" href={config.swarmIdStorageUrl} target="_blank" rel="noreferrer">
            Open Swarm ID
          </a>
        )}
        {(copy.action === 'open-route-settings' || copy.action === 'open-swarm-id') && (
          <button type="button" className="link-button" onClick={props.onOpenRoute}>
            Where uploads go
          </button>
        )}
        {copy.action === 'choose-photo' && (
          <button type="button" className="btn btn-small" onClick={props.onChoosePhoto}>
            Choose another photo
          </button>
        )}
        <button type="button" className="link-button" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>

      <details className="error-details">
        <summary>Details for whoever fixes this</summary>
        <dl>
          <dt>Code</dt>
          <dd>
            <code>{failure.code}</code>
          </dd>
          {failure.step && (
            <>
              <dt>Step</dt>
              <dd>{failure.step}</dd>
            </>
          )}
          {failure.detail && (
            <>
              <dt>What came back</dt>
              <dd>
                <code className="wrap">{failure.detail}</code>
              </dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
