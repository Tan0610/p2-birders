import type { ConnectionInfo } from '@snaha/swarm-id';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSignIn } from '../src/swarm/signInWatch';

const identity = { id: 'i', name: 'Meera', address: 'cd'.repeat(20), avatar: { source: 'generated' as const, url: 'data:,' } };
const signedOut = { canUpload: false } as ConnectionInfo;
const signedIn = { canUpload: true, uploadMode: 'subsidised', identity } as ConnectionInfo;

function setup() {
  let info: ConnectionInfo = signedOut;
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const onSignedIn = vi.fn();
  const onStalled = vi.fn();
  const checkAuthStatus = vi.fn(async () => ({ authenticated: Boolean(info.identity) }));
  const stop = watchSignIn({
    readInfo: () => info,
    checkAuthStatus,
    onSignedIn,
    onStalled,
    win: win as unknown as Window,
    doc: doc as unknown as Document,
  });
  return {
    stop,
    win,
    doc,
    onSignedIn,
    onStalled,
    checkAuthStatus,
    signIn: () => (info = signedIn),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watching for a sign-in after the Swarm ID window opens', () => {
  it('picks the sign-in up on the poll even if no connection event ever fired', async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(w.onSignedIn).not.toHaveBeenCalled();
    w.signIn();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(w.onSignedIn).toHaveBeenCalledTimes(1);
    expect(w.onSignedIn.mock.calls[0]![0].identity.name).toBe('Meera');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.onSignedIn).toHaveBeenCalledTimes(1);
    expect(w.onStalled).not.toHaveBeenCalled();
  });

  it('checks again the moment the user comes back to this window', async () => {
    const w = setup();
    w.win.dispatchEvent(new Event('blur'));
    w.signIn();
    w.win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(w.onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('says it has stalled when the user is back and nothing has arrived', async () => {
    const w = setup();
    w.doc.visibilityState = 'hidden';
    w.doc.dispatchEvent(new Event('visibilitychange'));
    w.doc.visibilityState = 'visible';
    w.doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(w.onStalled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(w.onStalled).toHaveBeenCalledTimes(1);
    // Still watching: a late sign-in clears it.
    w.signIn();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(w.onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('does not call it stalled on a focus that never followed leaving the page', async () => {
    const w = setup();
    w.win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.onStalled).not.toHaveBeenCalled();
  });

  it('gives up after a minute, once, and stops asking', async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(w.onStalled).toHaveBeenCalledTimes(1);
    const asked = w.checkAuthStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.checkAuthStatus.mock.calls.length).toBe(asked);
  });

  it('survives the Swarm ID frame failing to answer', async () => {
    const w = setup();
    w.checkAuthStatus.mockRejectedValue(new Error('Request timeout'));
    await vi.advanceTimersByTimeAsync(1_500);
    w.signIn();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(w.onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('stops listening when stopped', async () => {
    const w = setup();
    w.stop();
    w.signIn();
    w.win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(w.onSignedIn).not.toHaveBeenCalled();
    expect(w.onStalled).not.toHaveBeenCalled();
  });
});
