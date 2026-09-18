import type { SwarmIdClient } from '@snaha/swarm-id';
import { classifyError } from '../errors';
import { checkUploadCapability } from './capability';
import type { UploadRoute } from './routes';
import { uploadBytesToOwnNode } from './uploader.ownNode';
import { publishPointerViaSwarmId, uploadBytesViaSwarmId } from './uploader.swarmId';

export type UploadKind = 'photo' | 'record' | 'journal';

export interface Uploader {
  uploadBytes(kind: UploadKind, bytes: Uint8Array, onProgress?: (fraction: number) => void): Promise<string>;
  publishJournalPointer(journalRef: string, index: bigint): Promise<{ socAddress: string; index: string; owner: string }>;
}

/**
 * The only way this app writes to Swarm. Every method first awaits the
 * capability check and throws a specific UploadFailure before any upload call
 * if the check says no (signed out, no drive, node down, offline, …).
 */
export function createUploader(client: SwarmIdClient, route: UploadRoute): Uploader {
  const gate = async () => {
    const capability = await checkUploadCapability(client, route);
    if (!capability.ok) throw capability.failure;
    return capability;
  };

  return {
    async uploadBytes(kind, bytes, onProgress) {
      await gate();
      try {
        if (route.kind === 'own-node') return await uploadBytesToOwnNode(route, bytes);
        return await uploadBytesViaSwarmId(client, bytes, onProgress);
      } catch (err) {
        throw classifyError(err, kind);
      }
    },

    async publishJournalPointer(journalRef, index) {
      await gate();
      try {
        return await publishPointerViaSwarmId(client, journalRef, index);
      } catch (err) {
        throw classifyError(err, 'pointer');
      }
    },
  };
}
