import type { SwarmIdClient, UploadOptions } from '@snaha/swarm-id';
import { JOURNAL_TOPIC_HEX } from '@deccan-birders/format';

/**
 * The Swarm ID branch. With no drive, these uploads go through the public
 * subsidised gateway, whose CORS allow-list refuses the Swarm-Pin and
 * Swarm-Tag headers (the browser reports only "Failed to fetch"). So this
 * file never passes pin or tag, and the option type makes it impossible to.
 */
export type GatewaySafeUploadOptions = Omit<UploadOptions, 'pin' | 'tag'> & { pin?: never; tag?: never };

export async function uploadBytesViaSwarmId(
  client: SwarmIdClient,
  bytes: Uint8Array,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const options: GatewaySafeUploadOptions = {
    // Plain (unencrypted) bytes, so the 64-hex reference can be read by anyone at /bytes/<ref>.
    encrypt: false,
    onProgress: onProgress ? (p) => onProgress(p.total ? p.processed / p.total : 0) : undefined,
  };
  const { reference } = await client.uploadData(bytes, options);
  return reference;
}

/**
 * Writes the journal pointer as a sequential feed update signed by the user's
 * Swarm ID app key: payload = uint64_be(timestamp) || journalRef (40 bytes).
 * The index is always explicit, taken from the feed read just before.
 */
export async function publishPointerViaSwarmId(
  client: SwarmIdClient,
  journalRef: string,
  index: bigint,
): Promise<{ socAddress: string; index: string; owner: string }> {
  const writer = client.makeSequentialFeedWriter({ topic: JOURNAL_TOPIC_HEX });
  const refBytes = hexToBytes(journalRef);
  const result = await writer.uploadRawPayload(refBytes, { index, hasTimestamp: true, encrypt: false });
  return { socAddress: result.reference, index: result.feedIndex, owner: result.owner };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
