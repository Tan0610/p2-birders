import type { ConnectionInfo } from '@snaha/swarm-id';

/**
 * Watches for a sign-in to land after client.connect() has opened the Swarm ID window.
 *
 * connect() resolves as soon as that window opens, not when the user finishes in it.
 * The finished sign-in reaches this page only as a connectionInfoChanged message from
 * the Swarm ID frame, and the frame hears about it through a `storage` event or a
 * popup handover. When the browser keeps that news from the frame (third-party
 * storage that is only readable after a reload, a popup opened from the page rather
 * than the frame), no message ever comes: the popup says "connected" and this page
 * still says "Sign in first". A reload then picks the session up at start-up.
 *
 * So while a sign-in is pending this re-reads the connection on a short poll and
 * whenever the user comes back to this window, and if they have come back (or the
 * time runs out) with no identity, it says so, so the page can offer the reload.
 */

export interface SignInWatchOptions {
  /** Current snapshot, or null before Swarm ID is ready. Never throws. */
  readInfo: () => ConnectionInfo | null;
  /** Asks the Swarm ID frame directly; errors are ignored. */
  checkAuthStatus: () => Promise<{ authenticated: boolean }>;
  /** Called once with the snapshot that carries an identity. The watch then stops. */
  onSignedIn: (info: ConnectionInfo) => void;
  /** Called once when the user is back on this page, or time is up, and still no identity. */
  onStalled: () => void;
  /** The window, for focus/blur. Omit where there is none (tests, SSR). */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** The document, for visibilitychange. */
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  intervalMs?: number;
  timeoutMs?: number;
  /** How long after the user returns to wait for the frame before calling it stalled. */
  returnGraceMs?: number;
}

export const SIGN_IN_POLL_MS = 1_500;
export const SIGN_IN_TIMEOUT_MS = 60_000;
export const SIGN_IN_RETURN_GRACE_MS = 4_000;

export function watchSignIn(opts: SignInWatchOptions): () => void {
  const intervalMs = opts.intervalMs ?? SIGN_IN_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? SIGN_IN_TIMEOUT_MS;
  const graceMs = opts.returnGraceMs ?? SIGN_IN_RETURN_GRACE_MS;

  let done = false;
  let stalled = false;
  let left = false;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const signedIn = (): boolean => {
    if (done) return true;
    const info = opts.readInfo();
    if (!info?.identity) return false;
    stop();
    opts.onSignedIn(info);
    return true;
  };

  const stall = () => {
    if (done || stalled || signedIn()) return;
    stalled = true;
    opts.onStalled();
  };

  const check = async () => {
    if (signedIn()) return;
    try {
      await opts.checkAuthStatus();
    } catch {
      // The frame is busy or gone; the next tick asks again.
    }
    signedIn();
  };

  const onLeave = () => {
    left = true;
  };
  const onReturn = () => {
    void check();
    if (!left || stalled || graceTimer) return;
    graceTimer = setTimeout(() => {
      graceTimer = undefined;
      stall();
    }, graceMs);
  };
  const onVisibility = () => {
    if (opts.doc?.visibilityState === 'hidden') onLeave();
    else onReturn();
  };

  const poll = setInterval(() => void check(), intervalMs);
  const deadline = setTimeout(() => {
    stall();
    stop();
  }, timeoutMs);
  opts.win?.addEventListener('blur', onLeave);
  opts.win?.addEventListener('focus', onReturn);
  opts.doc?.addEventListener('visibilitychange', onVisibility);

  function stop() {
    if (done) return;
    done = true;
    clearInterval(poll);
    clearTimeout(deadline);
    if (graceTimer) clearTimeout(graceTimer);
    opts.win?.removeEventListener('blur', onLeave);
    opts.win?.removeEventListener('focus', onReturn);
    opts.doc?.removeEventListener('visibilitychange', onVisibility);
  }

  void check();
  return stop;
}
