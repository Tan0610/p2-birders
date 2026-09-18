import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Checks who signed a journal feed update (FORMAT.md §3.2, rule 3).
 *
 *   cacAddress = keccak256(span ‖ bmtRoot(payload))
 *   digest     = keccak256(identifier ‖ cacAddress)
 *   signature  = secp256k1 over keccak256("\x19Ethereum Signed Message:\n32" ‖ digest), as r ‖ s ‖ v
 *
 * Returns the 40-hex address that signed it, or null when the signature does
 * not decode (for example an all-zero test signature).
 */

const SEGMENT = 32;
const CHUNK = 4096;

/** Binary Merkle tree root over the payload padded to 4096 bytes, keccak256 at every node. */
export function bmtRoot(payload: Uint8Array): Uint8Array {
  const data = new Uint8Array(CHUNK);
  data.set(payload.subarray(0, CHUNK));
  let level: Uint8Array[] = [];
  for (let i = 0; i < CHUNK; i += SEGMENT) level.push(data.subarray(i, i + SEGMENT));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(keccak_256(concatBytes(level[i]!, level[i + 1]!)));
    level = next;
  }
  return level[0]!;
}

export function contentAddress(span: Uint8Array, payload: Uint8Array): Uint8Array {
  return keccak_256(concatBytes(span, bmtRoot(payload)));
}

export function recoverFeedSigner(chunk: Uint8Array): string | null {
  const identifier = chunk.subarray(0, 32);
  const signature = chunk.subarray(32, 97);
  const span = chunk.subarray(97, 105);
  const payload = chunk.subarray(105);
  const digest = keccak_256(concatBytes(identifier, contentAddress(span, payload)));
  const prefixed = keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n32'), digest));
  const v = signature[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery > 3) return null;
  try {
    const r = BigInt(`0x${bytesToHex(signature.subarray(0, 32))}`);
    const s = BigInt(`0x${bytesToHex(signature.subarray(32, 64))}`);
    const publicKey = new secp256k1.Signature(r, s, recovery).recoverPublicKey(prefixed).toBytes(false);
    return bytesToHex(keccak_256(publicKey.subarray(1)).subarray(12));
  } catch {
    return null;
  }
}
