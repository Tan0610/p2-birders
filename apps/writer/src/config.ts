/**
 * Every value here is a public URL. Nothing secret is configured in this app:
 * signing happens inside the Swarm ID iframe, and the subsidised gateway needs no key.
 */

function read(name: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  // An explicitly empty value is kept: VITE_SUBSIDISED_GATEWAY_URL= turns the gateway off.
  return value === undefined ? fallback : value.trim();
}

function refuseWebsiteHost(url: string): string {
  if (/^https?:\/\/gateway\.ethswarm\.org\/?$/i.test(url)) {
    throw new Error(
      'gateway.ethswarm.org is the gateway website, not its API. Use https://api.gateway.ethswarm.org/ for VITE_SUBSIDISED_GATEWAY_URL.',
    );
  }
  return url;
}

export const config = {
  /** Where the Swarm ID identity iframe and sign-in popup are served from. */
  swarmIdOrigin: read('VITE_SWARM_ID_ORIGIN', 'https://swarm-id.snaha.net'),
  /**
   * The route for users who hold no postage stamp: the public gateway stamps
   * their uploads with its own batch. Empty string disables it.
   */
  subsidisedGatewayUrl: refuseWebsiteHost(read('VITE_SUBSIDISED_GATEWAY_URL', 'https://api.gateway.ethswarm.org/')),
  /** Default for the optional "my own Bee node" route. */
  localBeeUrl: read('VITE_LOCAL_BEE_URL', 'http://localhost:1633'),
  /** The independent reader app, for "open in Almanac" links. */
  readerUrl: read('VITE_READER_URL', 'http://localhost:5174').replace(/\/+$/, ''),
  /** Where users add a drive (postage batch) to their Swarm ID. */
  swarmIdStorageUrl: 'https://swarm-id.snaha.net',
} as const;

export const APP_NAME = 'Deccan Birders Field Journal';
export const APP_VERSION = '1.0.0';
