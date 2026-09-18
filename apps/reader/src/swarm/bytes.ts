import { ReaderError, getWithTimeout } from './http';

/**
 * Records, journals and photos are all written with the "bytes" upload, so they
 * are read back from /bytes/<ref>. Reading them through /bzz would fail
 * (a bytes reference is not a manifest).
 */
export async function downloadBytes(base: string, ref: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await getWithTimeout(`${base}/bytes/${ref}`, undefined, signal);
  if (res.status === 404) {
    throw new ReaderError(
      'NOT_FOUND',
      'Nothing is stored at that reference on this gateway yet. Fresh uploads can take a minute to spread.',
      ref,
    );
  }
  if (!res.ok) {
    throw new ReaderError('GATEWAY_ERROR', `The gateway answered ${res.status} for /bytes/${ref.slice(0, 8)}…`, await safeText(res));
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function bytesUrl(base: string, ref: string): string {
  return `${base}/bytes/${ref}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
