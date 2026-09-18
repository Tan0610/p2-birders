import { type ConnectionInfo, SwarmIdClient } from '@snaha/swarm-id';
import { APP_NAME, config } from '../config';

/**
 * One SwarmIdClient per page. initialize() may only run once, and React's
 * StrictMode mounts effects twice, so the promise is memoised at module level.
 * The iframe it creates stays mounted for the life of the page, as Swarm ID requires.
 */

type Listener = (info: ConnectionInfo) => void;
const listeners = new Set<Listener>();
let client: SwarmIdClient | null = null;
let ready: Promise<SwarmIdClient> | null = null;

export function getSwarmId(): SwarmIdClient {
  if (!client) {
    client = new SwarmIdClient({
      iframeOrigin: config.swarmIdOrigin,
      // The upload route for a user with no postage stamp of their own: the
      // public gateway stamps their chunks with its own batch. Without this,
      // every first-time user gets canUpload: false.
      ...(config.subsidisedGatewayUrl ? { subsidisedGatewayUrl: config.subsidisedGatewayUrl } : {}),
      metadata: {
        name: APP_NAME,
        description: 'Files bird sightings for the Deccan Birders under your own Swarm ID. Records are public.',
      },
      popupMode: 'popup',
      onConnectionChange: (info) => listeners.forEach((l) => l(info)),
    });
  }
  return client;
}

export function initSwarmId(): Promise<SwarmIdClient> {
  ready ??= (async () => {
    const c = getSwarmId();
    await c.initialize();
    return c;
  })();
  return ready;
}

export function onConnectionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** connectionInfo throws before initialize() finishes; this never does. */
export function currentConnectionInfo(): ConnectionInfo | null {
  try {
    return client ? client.connectionInfo : null;
  } catch {
    return null;
  }
}
