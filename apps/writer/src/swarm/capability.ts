import type { ConnectionInfo, SwarmIdClient } from '@snaha/swarm-id';
import { UploadFailure } from '../errors';
import { isOwnNodeReady } from './uploader.ownNode';
import type { UploadRoute } from './routes';

export type Capability =
  | { ok: true; uploadMode: 'user-stamp' | 'subsidised' | 'own-node'; info: ConnectionInfo }
  | { ok: false; failure: UploadFailure };

/**
 * Decides whether an upload may be attempted, right now, on this route.
 * Read fresh on every call: connectionInfo changes when the user signs in or
 * out, adds a drive, or the drive expires. Every write path in uploader.ts
 * awaits this and stops before touching the network if it says no.
 */
export async function checkUploadCapability(client: SwarmIdClient, route: UploadRoute): Promise<Capability> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, failure: new UploadFailure('OFFLINE', { step: 'check' }) };
  }

  let info: ConnectionInfo;
  try {
    info = client.connectionInfo;
  } catch (err) {
    return { ok: false, failure: new UploadFailure('SWARM_ID_UNAVAILABLE', { step: 'check', detail: String(err) }) };
  }

  if (!info.identity) return { ok: false, failure: new UploadFailure('NOT_SIGNED_IN', { step: 'check' }) };

  // Even on the own-node route the journal pointer is signed and sent by Swarm ID,
  // so Swarm ID has to be able to upload too.
  if (!info.canUpload || info.uploadMode === 'unavailable') {
    return { ok: false, failure: new UploadFailure(reasonToCode(info.uploadUnavailableReason), { step: 'check', detail: info.uploadUnavailableReason }) };
  }

  if (route.kind === 'own-node') {
    const node = await isOwnNodeReady(route);
    if (!node.ok) return { ok: false, failure: new UploadFailure(node.code, { step: 'check', detail: node.detail }) };
    return { ok: true, uploadMode: 'own-node', info };
  }

  return { ok: true, uploadMode: info.uploadMode === 'user-stamp' ? 'user-stamp' : 'subsidised', info };
}

function reasonToCode(reason: string | undefined) {
  switch (reason) {
    case 'no-stamp':
      return 'NO_DRIVE' as const;
    case 'stamper-failed':
      return 'STAMPER_FAILED' as const;
    // Listed in the Swarm ID docs though not in the 0.4.1 types.
    case 'stamp-expired':
      return 'DRIVE_EXPIRED' as const;
    default:
      return 'UPLOAD_UNAVAILABLE' as const;
  }
}
