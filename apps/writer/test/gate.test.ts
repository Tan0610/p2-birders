import type { ConnectionInfo, SwarmIdClient } from '@snaha/swarm-id';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readiness } from '../src/components/CapabilityNote';
import { publishJournal } from '../src/fileSighting';
import { DEFAULT_ROUTE } from '../src/swarm/routes';
import { createUploader } from '../src/swarm/uploader';

// A stand-in for SwarmIdClient that records every write. Nothing here talks to a network.
function fakeClient(info: Partial<ConnectionInfo>) {
  const writes: string[] = [];
  const bytes = new Map<string, Uint8Array>();
  const feed: Uint8Array[] = [];
  let n = 0;
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const owner = 'ab'.repeat(20);
  const client = {
    get connectionInfo() {
      return { canUpload: false, ...info } as ConnectionInfo;
    },
    async uploadData(data: Uint8Array) {
      writes.push('uploadData');
      await tick();
      const reference = (++n).toString(16).padStart(64, '0');
      bytes.set(reference, data);
      return { reference };
    },
    async downloadData(ref: string) {
      await tick();
      return bytes.get(ref)!;
    },
    makeSequentialFeedReader() {
      return {
        getOwner: async () => owner,
        downloadRawPayload: async () => {
          await tick();
          if (feed.length === 0) throw new Error('Sequential feed has no updates');
          return { payload: feed[feed.length - 1]!, feedIndex: String(feed.length - 1), feedIndexNext: String(feed.length) };
        },
      };
    },
    makeSequentialFeedWriter() {
      return {
        uploadRawPayload: async (payload: Uint8Array, opts: { index: bigint }) => {
          writes.push(`feed@${opts.index}`);
          await tick();
          if (feed[Number(opts.index)]) throw new Error(`index ${opts.index} already written`);
          feed[Number(opts.index)] = payload;
          return { reference: 'soc', feedIndex: String(opts.index), owner };
        },
      };
    },
  };
  return { client: client as unknown as SwarmIdClient, writes, feed };
}

const identity = { id: 'i', name: 'Meera', address: 'cd'.repeat(20), avatar: { source: 'generated' as const, url: 'data:,' } };

beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
afterEach(() => vi.unstubAllGlobals());

describe('every upload waits for the capability check', () => {
  it.each([
    ['signed out', { canUpload: false }, 'NOT_SIGNED_IN'],
    ['signed in, no drive and no gateway', { identity, canUpload: false, uploadMode: 'unavailable', uploadUnavailableReason: 'no-stamp' }, 'NO_DRIVE'],
    ['signed in, stamper failed', { identity, canUpload: false, uploadMode: 'unavailable', uploadUnavailableReason: 'stamper-failed' }, 'STAMPER_FAILED'],
  ] as const)('%s: refuses with %s and makes no upload call', async (_label, info, code) => {
    const { client, writes } = fakeClient(info as Partial<ConnectionInfo>);
    const uploader = createUploader(client, DEFAULT_ROUTE);
    await expect(uploader.uploadBytes('record', new Uint8Array([1]))).rejects.toMatchObject({ code: code });
    await expect(uploader.publishJournalPointer('00'.repeat(32), 0n)).rejects.toMatchObject({ code: code });
    expect(writes).toEqual([]);
  });

  it('refuses while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { client, writes } = fakeClient({ identity, canUpload: true, uploadMode: 'subsidised' });
    await expect(createUploader(client, DEFAULT_ROUTE).uploadBytes('photo', new Uint8Array([1]))).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(writes).toEqual([]);
  });

  it('uploads once the check passes (subsidised gateway, no drive)', async () => {
    const { client, writes } = fakeClient({ identity, canUpload: true, uploadMode: 'subsidised' });
    await createUploader(client, DEFAULT_ROUTE).uploadBytes('record', new Uint8Array([1]));
    expect(writes).toEqual(['uploadData']);
  });
});

describe('journal publishing in one tab is serialised', () => {
  it('two overlapping runs take consecutive feed indexes instead of racing for the same one', async () => {
    const { client, writes, feed } = fakeClient({ identity, canUpload: true, uploadMode: 'subsidised' });
    const uploader = createUploader(client, DEFAULT_ROUTE);
    const noop = () => {};
    const [a, b] = await Promise.all([publishJournal(client, uploader, noop), publishJournal(client, uploader, noop)]);
    expect([a.feedIndex, b.feedIndex]).toEqual(['0', '1']);
    expect(writes.filter((w) => w.startsWith('feed@'))).toEqual(['feed@0', 'feed@1']);
    expect(feed).toHaveLength(2);
  });
});

describe('what the note says before anyone presses File', () => {
  const ready = (info: Partial<ConnectionInfo>) =>
    readiness({ swarmId: 'ready', info: { canUpload: false, ...info } as ConnectionInfo, route: DEFAULT_ROUTE, online: true });

  it('explains the free gateway to a first-time user with no drive', () => {
    expect(ready({ identity, canUpload: true, uploadMode: 'subsidised' })).toMatchObject({ tone: 'ready', subsidised: true });
    expect(ready({ identity, canUpload: true, uploadMode: 'user-stamp' })).toMatchObject({ tone: 'ready', subsidised: false });
  });

  it('blocks a signed-in user who cannot upload, with the same reason the gate gives', () => {
    expect(ready({ identity, canUpload: false, uploadMode: 'unavailable', uploadUnavailableReason: 'no-stamp' })).toEqual({ tone: 'blocked', code: 'NO_DRIVE' });
    expect(ready({ identity, canUpload: false, uploadMode: 'unavailable', uploadUnavailableReason: 'stamper-failed' })).toEqual({ tone: 'blocked', code: 'STAMPER_FAILED' });
  });

  it('waits while the Swarm ID window is open, then offers a reload if nothing arrives', () => {
    const signedOut = { canUpload: false } as ConnectionInfo;
    const note = (signIn: 'idle' | 'pending' | 'stalled') => readiness({ swarmId: 'ready', info: signedOut, route: DEFAULT_ROUTE, online: true, signIn });
    expect(note('idle')).toEqual({ tone: 'blocked', code: 'NOT_SIGNED_IN' });
    expect(note('pending')).toMatchObject({ tone: 'wait' });
    expect(note('stalled')).toEqual({ tone: 'blocked', code: 'SIGN_IN_NOT_RECEIVED' });
  });

  it('never lets a pending sign-in stand in for a signed-in user who cannot upload', () => {
    const info = { identity, canUpload: false, uploadMode: 'unavailable', uploadUnavailableReason: 'no-stamp' } as ConnectionInfo;
    expect(readiness({ swarmId: 'ready', info, route: DEFAULT_ROUTE, online: true, signIn: 'pending' })).toEqual({ tone: 'blocked', code: 'NO_DRIVE' });
  });
});
