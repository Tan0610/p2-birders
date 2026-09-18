/**
 * Where record, photo and journal bytes are uploaded.
 *
 * - swarm-id: through Swarm ID. If the user has a drive, it pays; if not, the
 *   subsidised public gateway stamps the upload. This path can reach the public
 *   gateway, so it never sends pin or tag (the gateway's CORS rules refuse them).
 * - own-node: straight to the user's own Bee node with one of its batches.
 *
 * The journal pointer (a feed update) is always signed by the user's Swarm ID
 * app key, so it always goes through Swarm ID.
 */
export type UploadRoute =
  | { kind: 'swarm-id' }
  | { kind: 'own-node'; beeUrl: string; batchId: string };

export const DEFAULT_ROUTE: UploadRoute = { kind: 'swarm-id' };

export function describeRoute(route: UploadRoute, uploadMode?: string): string {
  if (route.kind === 'own-node') return `your Bee node at ${route.beeUrl}`;
  if (uploadMode === 'user-stamp') return 'your Swarm ID drive';
  if (uploadMode === 'subsidised') return 'the public gateway (free, stamped by the gateway)';
  return 'Swarm ID';
}
