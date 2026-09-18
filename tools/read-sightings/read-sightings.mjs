#!/usr/bin/env node
// read-sightings: a "fourth app" for Deccan Birders journals.
//
// Written from FORMAT.md alone. It imports nothing from this repository, only
// @noble/hashes for keccak256, to show that the stored data plus the published
// format description are enough to read everything back.
//
//   node read-sightings.mjs --owner <40-hex journal address> [--gateway URL] [--json] [--photos DIR]
//   node read-sightings.mjs --journal <64-hex ref> [...]
//   node read-sightings.mjs --record <64-hex ref> [...]

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const TOPIC_STRING = 'org.deccanbirders.sighting/journal/v1';
const SIGHTING = 'org.deccanbirders.sighting';
const JOURNAL = 'org.deccanbirders.journal';
const DEFAULT_GATEWAY = 'https://api.gateway.ethswarm.org';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class Problem extends Error {}

const { values } = parseArgs({
  options: {
    owner: { type: 'string' },
    journal: { type: 'string' },
    record: { type: 'string' },
    gateway: { type: 'string', default: DEFAULT_GATEWAY },
    hint: { type: 'string' },
    json: { type: 'boolean', default: false },
    photos: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || (!values.owner && !values.journal && !values.record)) {
  console.log(`read-sightings: read Deccan Birders sightings from Swarm

  --owner <addr>     journal address (40 hex); finds the latest journal on its feed
  --journal <ref>    a specific journal reference (64 hex)
  --record <ref>     a single sighting record reference (64 hex)
  --gateway <url>    Bee API endpoint (default ${DEFAULT_GATEWAY})
  --hint <n>         a feed index to start the search from
  --photos <dir>     save attached photos into this folder
  --json             print machine-readable JSON`);
  process.exit(values.help ? 0 : 1);
}

const base = values.gateway.replace(/\/+$/, '');

async function get(path) {
  let res;
  try {
    res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new Problem(`could not reach ${base} (${err.cause?.code ?? err.message})`);
  }
  return res;
}

async function bytes(ref) {
  const res = await get(`/bytes/${ref}`);
  if (res.status === 404) throw new Problem(`nothing found at /bytes/${ref}`);
  if (!res.ok) throw new Problem(`gateway answered ${res.status} for /bytes/${ref}`);
  return new Uint8Array(await res.arrayBuffer());
}

function hex(value, length, what) {
  const h = String(value).trim().replace(/^0x/i, '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(h)) throw new Problem(`${what} must be ${length} hex characters`);
  return h;
}

function decode(buf, expectedFormat) {
  let doc;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf));
  } catch {
    throw new Problem('stored bytes are not UTF-8 JSON');
  }
  if (doc?.format !== expectedFormat) throw new Problem(`expected format ${expectedFormat}, found ${JSON.stringify(doc?.format)}`);
  const major = /^(\d+)\./.exec(String(doc.formatVersion))?.[1];
  if (major !== '1') throw new Problem(`${expectedFormat} version ${doc.formatVersion} is not supported (this tool reads 1.x)`);
  return doc;
}

// FORMAT.md §3: identifier_i = keccak256(topic || uint64_be(i)); address = keccak256(identifier || owner)
async function feedUpdate(topic, owner, index) {
  const i = new Uint8Array(8);
  new DataView(i.buffer).setBigUint64(0, index, false);
  const identifier = keccak_256(concatBytes(topic, i));
  const address = bytesToHex(keccak_256(concatBytes(identifier, owner)));
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await get(`/chunks/${address}`);
    if (res.ok) {
      const chunk = new Uint8Array(await res.arrayBuffer());
      if (bytesToHex(chunk.subarray(0, 32)) !== bytesToHex(identifier)) throw new Problem(`chunk ${address} has the wrong identifier`);
      const payload = chunk.subarray(32 + 65 + 8);
      if (payload.length < 40) throw new Problem(`feed update ${index} is not a 40-byte journal pointer`);
      const view = new DataView(payload.buffer, payload.byteOffset, 8);
      return { index, address, timestamp: Number(view.getBigUint64(0, false)), journalRef: bytesToHex(payload.subarray(8, 40)) };
    }
    if (res.status !== 404 && res.status !== 500) throw new Problem(`gateway answered ${res.status} for /chunks/${address}`);
  }
  return null;
}

async function latestUpdate(ownerHex, hint) {
  const topic = keccak_256(utf8ToBytes(TOPIC_STRING));
  const owner = hexToBytes(ownerHex);
  const seen = new Map();
  const exists = async (i) => {
    if (!seen.has(i)) seen.set(i, await feedUpdate(topic, owner, i));
    return seen.get(i) !== null;
  };
  if (!(await exists(0n))) return null;
  let lo = 0n;
  let hi = null;
  if (hint > 0n) {
    if (await exists(hint)) lo = hint;
    else hi = hint;
  }
  for (let step = 1n; hi === null; step *= 2n) {
    if (await exists(lo + step)) lo += step;
    else hi = lo + step;
  }
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (await exists(mid)) lo = mid;
    else hi = mid;
  }
  return seen.get(lo);
}

async function main() {
  let refs;
  let journal = null;
  let feed = null;

  if (values.record) {
    refs = [hex(values.record, 64, '--record')];
  } else {
    let journalRef;
    if (values.owner) {
      feed = await latestUpdate(hex(values.owner, 40, '--owner'), values.hint ? BigInt(values.hint) : 0n);
      if (!feed) throw new Problem('this journal address has not published anything yet');
      journalRef = feed.journalRef;
    } else {
      journalRef = hex(values.journal, 64, '--journal');
    }
    journal = decode(await bytes(journalRef), JOURNAL);
    journal.ref = journalRef;
    refs = journal.entries.map((e) => hex(e.ref, 64, 'entry ref'));
  }

  const sightings = [];
  for (const ref of refs) {
    try {
      const record = decode(await bytes(ref), SIGHTING);
      if (values.photos && record.photo?.ref) {
        await mkdir(values.photos, { recursive: true });
        const file = join(values.photos, `${record.id}.${EXT[record.photo.contentType] ?? 'bin'}`);
        await writeFile(file, await bytes(hex(record.photo.ref, 64, 'photo ref')));
        record.photo.savedAs = file;
      }
      sightings.push({ ref, record });
    } catch (err) {
      if (!(err instanceof Problem)) throw err;
      sightings.push({ ref, error: err.message });
    }
  }

  if (values.json) {
    console.log(JSON.stringify({ gateway: base, feed, journal, sightings }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    return;
  }

  if (journal) {
    console.log(`Journal of ${journal.owner}, edition ${journal.sequence}, updated ${journal.updatedAt}`);
    if (feed) console.log(`found at feed index ${feed.index} (chunk ${feed.address})`);
    console.log('');
  }
  for (const s of sightings) {
    if (s.error) {
      console.log(`  ! ${s.ref.slice(0, 12)}…  ${s.error}`);
      continue;
    }
    const r = s.record;
    const count = r.count ? ` ×${r.count}` : '';
    const sci = r.species.scientificName ? ` (${r.species.scientificName})` : '';
    console.log(`  ${r.observedOn}${r.observedTime ? ' ' + r.observedTime : ''}  ${r.species.commonName}${sci}${count}`);
    console.log(`      at ${r.place.name}${r.place.coordinates ? ` [${r.place.coordinates.lat}, ${r.place.coordinates.lon}, ${r.place.precision}]` : ''}`);
    console.log(`      seen by ${r.observer.name}${r.photo ? `, photo ${r.photo.savedAs ?? r.photo.ref.slice(0, 12) + '…'}` : ''}`);
    if (r.notes) console.log(`      “${r.notes}”`);
  }
  console.log(`\n${sightings.filter((s) => !s.error).length} of ${sightings.length} sightings read from ${base}`);
}

main().catch((err) => {
  console.error(`read-sightings: ${err instanceof Problem ? err.message : err.stack}`);
  process.exit(1);
});
