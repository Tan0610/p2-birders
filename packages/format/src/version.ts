import { SUPPORTED_MAJOR } from './constants';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.+-]*)?$/;

export function parseSemVer(value: unknown): SemVer | null {
  if (typeof value !== 'string') return null;
  const m = SEMVER.exec(value);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** A reader may parse any 1.x.y document; unknown fields inside a known major are ignored. */
export function isSupportedVersion(value: unknown): boolean {
  const v = parseSemVer(value);
  return v !== null && v.major === SUPPORTED_MAJOR;
}
