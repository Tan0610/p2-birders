import type { ReaderError, ReaderErrorCode } from '../swarm/http';

const TITLES: Record<ReaderErrorCode, string> = {
  BAD_INPUT: 'That address does not look right',
  GATEWAY_UNREACHABLE: 'The gateway could not be reached',
  TIMEOUT: 'The gateway is taking too long',
  NOT_FOUND: 'Nothing found there yet',
  GATEWAY_ERROR: 'The gateway returned an error',
  EMPTY_JOURNAL: 'This journal has no sightings yet',
  BAD_FEED_UPDATE: 'The journal pointer is damaged',
  NOT_OUR_FORMAT: 'This is not a Deccan Birders journal',
  UNSUPPORTED_VERSION: 'Written in a newer format',
  INVALID_DOCUMENT: 'The journal breaks the format rules',
};

const NEXT: Partial<Record<ReaderErrorCode, string>> = {
  NOT_FOUND: 'If it was filed a minute ago, give Swarm a moment to spread it and try again.',
  EMPTY_JOURNAL: 'Nothing has been filed under this address. If someone just filed their first sighting, try again in a minute.',
  GATEWAY_UNREACHABLE: 'Try another gateway, or a local Bee node, from the list below.',
  TIMEOUT: 'Try again, or pick another gateway.',
  UNSUPPORTED_VERSION: 'This reader understands version 1.x. A newer reader is needed for this one.',
};

export function StatusNotice({ error, onRetry }: { error: ReaderError; onRetry?: () => void }) {
  const retryable = ['NOT_FOUND', 'EMPTY_JOURNAL', 'GATEWAY_UNREACHABLE', 'TIMEOUT', 'GATEWAY_ERROR'].includes(error.code);
  return (
    <section className="notice" role="alert" aria-labelledby="notice-title">
      <h2 id="notice-title">{TITLES[error.code]}</h2>
      <p>{error.message}</p>
      {NEXT[error.code] && <p className="notice-next">{NEXT[error.code]}</p>}
      {retryable && onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
      {error.detail && (
        <details>
          <summary>What the gateway said</summary>
          <code className="wrap">{error.detail}</code>
        </details>
      )}
    </section>
  );
}
