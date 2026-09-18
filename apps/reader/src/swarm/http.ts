/**
 * The reader talks to any Bee API endpoint (the public gateway, a local node,
 * or anything else) with plain GET requests and no custom headers, so it works
 * across origins without CORS preflights.
 */

export type ReaderErrorCode =
  | 'BAD_INPUT'
  | 'GATEWAY_UNREACHABLE'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'GATEWAY_ERROR'
  | 'EMPTY_JOURNAL'
  | 'BAD_FEED_UPDATE'
  | 'NOT_OUR_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_DOCUMENT';

export class ReaderError extends Error {
  constructor(
    readonly code: ReaderErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ReaderError';
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Removes trailing slashes so `${base}/bytes/...` never doubles up. */
export function normaliseBase(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new ReaderError('BAD_INPUT', 'The gateway address has to start with http:// or https://');
  }
  if (/^https?:\/\/gateway\.ethswarm\.org$/i.test(trimmed)) {
    throw new ReaderError(
      'BAD_INPUT',
      'gateway.ethswarm.org is the website host and answers every address with HTML. Use https://api.gateway.ethswarm.org instead.',
    );
  }
  return trimmed;
}

export async function getWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onOuterAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onOuterAbort, { once: true });
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (controller.signal.aborted) {
      throw new ReaderError('TIMEOUT', `The gateway did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, url);
    }
    throw new ReaderError(
      'GATEWAY_UNREACHABLE',
      'Could not reach the gateway. Check the address, your connection, or whether the node allows requests from this page.',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
