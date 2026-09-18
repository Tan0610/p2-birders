import { Bee } from '@ethersphere/bee-js';
import type { ErrorCode } from '../errors';
import type { UploadRoute } from './routes';

/**
 * The own-node branch. This is the ONLY file allowed to pass pin or tag:
 * it only ever talks to the user's own Bee node (never the public gateway),
 * where pinning keeps a local copy and a tag lets the node report sync progress.
 *
 * Capability gate: uploadBytesToOwnNode is only called from uploader.ts after
 * gate() has confirmed the node is reachable with a usable batch.
 */

type OwnNodeRoute = Extract<UploadRoute, { kind: 'own-node' }>;

export async function isOwnNodeReady(route: OwnNodeRoute): Promise<{ ok: true } | { ok: false; code: ErrorCode; detail?: string }> {
  const bee = new Bee(route.beeUrl);
  const connected = await bee.isConnected({ timeout: 5000 }).catch(() => false);
  if (!connected) return { ok: false, code: 'LOCAL_NODE_UNREACHABLE', detail: route.beeUrl };
  try {
    const batch = await bee.getPostageBatch(route.batchId, { timeout: 5000 });
    if (!batch.usable) return { ok: false, code: 'LOCAL_NODE_NO_USABLE_BATCH', detail: `batch ${route.batchId.slice(0, 8)}… is not usable yet` };
  } catch (err) {
    return { ok: false, code: 'LOCAL_NODE_NO_USABLE_BATCH', detail: String(err) };
  }
  return { ok: true };
}

/** Lists the node's usable batches for the route picker. */
export async function listUsableBatches(beeUrl: string): Promise<{ id: string; label: string; ttlDays: number | null }[]> {
  const bee = new Bee(beeUrl);
  const batches = await bee.getAllPostageBatch({ timeout: 5000 });
  return batches
    .filter((b) => b.usable)
    .map((b) => ({
      id: b.batchID.toHex(),
      label: b.label,
      ttlDays: typeof b.duration?.toDays === 'function' ? Math.floor(b.duration.toDays()) : null,
    }));
}

export async function uploadBytesToOwnNode(route: OwnNodeRoute, bytes: Uint8Array): Promise<string> {
  const bee = new Bee(route.beeUrl);
  const tag = await bee.createTag();
  const { reference } = await bee.uploadData(route.batchId, bytes, { pin: true, tag: tag.uid, encrypt: false });
  return reference.toHex();
}
