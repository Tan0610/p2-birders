#!/usr/bin/env node
// read-sightings: a "fourth app" for Deccan Birders journals.
//
// Written from FORMAT.md alone. It imports nothing from this repository, only
// @noble/hashes (keccak256) and @noble/curves (secp256k1, to check who signed the
// journal pointer), to show that the stored data plus the published format
// description are enough to read everything back.
//
//   node read-sightings.mjs --owner <40-hex journal address> [--gateway URL] [--json] [--photos DIR]
//   node read-sightings.mjs --owner <40-hex journal address> --dwc [--out sightings.csv]
//   node read-sightings.mjs --journal <64-hex ref> [...]
//   node read-sightings.mjs --record <64-hex ref> [...]

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const TOPIC_STRING = 'org.deccanbirders.sighting/journal/v1';
const SIGHTING = 'org.deccanbirders.sighting';
const JOURNAL = 'org.deccanbirders.journal';
const DEFAULT_GATEWAY = 'https://api.gateway.ethswarm.org';
const PREFIX = String.fromCharCode(0x19) + 'Ethereum Signed Message:' + String.fromCharCode(10) + '32';
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
    dwc: { type: 'boolean', default: false },
    out: { type: 'string' },
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
  --json             print machine-readable JSON
  --dwc              print a Darwin Core occurrence CSV (FORMAT.md "Mapping to Darwin Core")
  --out <file>       write the --dwc or --json output to this file instead of stdout`);
  process.exit(values.help ? 0 : 1);
}

const base = values.gateway.replace(/\/+$/, '');

// ---------- Darwin Core, from FORMAT.md "Mapping to Darwin Core" ----------
// This tool's own copy of the mapping (it imports nothing from the repository).
// tests/dwc-parity.test.ts holds it and packages/format to the same golden file.

const DWC_TERMS = [
  'occurrenceID', 'basisOfRecord', 'occurrenceStatus', 'datasetName', 'modified', 'scientificName', 'vernacularName',
  'individualCount', 'eventDate', 'locality', 'decimalLatitude', 'decimalLongitude', 'geodeticDatum',
  'coordinateUncertaintyInMeters', 'coordinatePrecision', 'informationWithheld', 'dataGeneralizations', 'recordedBy',
  'occurrenceRemarks', 'associatedMedia', 'references', 'dynamicProperties',
];
const bare = (v) => String(v).replace(/^0x/i, '').toLowerCase();
const decimal = (n) => (/e/i.test(String(n)) ? n.toFixed(12).replace(/\.?0+$/, '') : String(n));
const round2 = (n) => Math.round(n * 100) / 100;

// The UTC offset of a local date and time in an IANA zone, or undefined (unknown zone, DST gap, odd offset).
function utcOffset(timeZone, date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !String(timeZone).trim()) return undefined;
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return undefined;
  }
  const wallAt = (at) => {
    const p = {};
    for (const part of fmt.formatToParts(new Date(at))) if (part.type !== 'literal') p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  };
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let instant = wall - (wallAt(wall) - wall);
  instant = wall - (wallAt(instant) - instant);
  if (wallAt(instant) !== wall) return undefined;
  const minutes = (wall - instant) / 60000;
  if (!Number.isInteger(minutes)) return undefined;
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function toDwc(r, recordRef, gateway, journalOwner) {
  const owner = journalOwner ? bare(journalOwner) : undefined;
  const offset = r.observedTime && r.timeZone ? utcOffset(r.timeZone, r.observedOn, r.observedTime) : undefined;
  const out = {
    occurrenceID: `urn:uuid:${String(r.id).toLowerCase()}`,
    basisOfRecord: 'HumanObservation',
    occurrenceStatus: 'present',
    datasetName: owner ? `Deccan Birders journal 0x${owner}` : 'Deccan Birders sightings',
    modified: r.createdAt,
    scientificName: r.species.scientificName,
    vernacularName: r.species.commonName,
    individualCount: r.count === undefined ? undefined : String(r.count),
    eventDate: r.observedTime ? `${r.observedOn}T${r.observedTime}${offset ?? ''}` : r.observedOn,
    locality: r.place.name,
    recordedBy: r.observer.name,
    occurrenceRemarks: r.notes,
    associatedMedia: r.photo ? `${gateway}/bytes/${bare(r.photo.ref)}` : undefined,
    references: `${gateway}/bytes/${bare(recordRef)}`,
  };
  const c = r.place.coordinates;
  if (r.place.precision !== 'none' && c) {
    const approximate = r.place.precision === 'approximate';
    out.decimalLatitude = decimal(approximate ? round2(c.lat) : c.lat);
    out.decimalLongitude = decimal(approximate ? round2(c.lon) : c.lon);
    out.geodeticDatum = 'WGS84';
    if (approximate) {
      out.coordinateUncertaintyInMeters = '1000';
      out.coordinatePrecision = '0.01';
      out.informationWithheld = 'Precise coordinates withheld by the observer; published rounded to 2 decimal places (about 1 km).';
      out.dataGeneralizations = 'Coordinates rounded to 2 decimal places before publication.';
    }
  } else {
    out.informationWithheld = 'Coordinates not shared by the observer; only the place name is given.';
  }
  out.dynamicProperties = JSON.stringify({
    swarmRecordRef: bare(recordRef),
    ...(owner ? { swarmJournalOwner: `0x${owner}` } : {}),
    format: r.format,
    formatVersion: r.formatVersion,
    placePrecision: r.place.precision,
    ...(r.timeZone ? { timeZone: r.timeZone } : {}),
  });
  return out;
}

// RFC 4180: header row, CRLF line endings, a field quoted when it holds , " CR or LF, with " doubled.
const csvField = (v) => {
  const s = v ?? '';
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dwcCsv = (rows) => `${[DWC_TERMS.join(','), ...rows.map((row) => DWC_TERMS.map((t) => csvField(row[t])).join(','))].join('\r\n')}\r\n`;

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
  const missing = REQUIRED[expectedFormat].filter((path) => !present(doc, path));
  if (missing.length) throw new Problem(`${expectedFormat} is missing ${missing.join(', ')}`);
  return doc;
}

// The required fields of FORMAT.md §2 and §3.1. This tool prints them, so it checks they are there;
// Almanac applies the full rules.
const REQUIRED = {
  [SIGHTING]: ['id', 'species.commonName', 'observedOn', 'place.name', 'place.precision', 'observer.name', 'createdAt'],
  [JOURNAL]: ['owner', 'feedTopic', 'sequence', 'previous', 'updatedAt', 'entries'],
};

function present(doc, path) {
  let v = doc;
  for (const key of path.split('.')) v = v !== null && typeof v === 'object' ? v[key] : undefined;
  return path === 'previous' ? v === null || typeof v === 'string' : v !== undefined && v !== null && v !== '';
}

// FORMAT.md §3.2 rule 3: recover the address that signed a feed update.
function signerOf(chunk) {
  const data = new Uint8Array(4096);
  data.set(chunk.subarray(105, 105 + 4096));
  let level = [];
  for (let i = 0; i < 4096; i += 32) level.push(data.subarray(i, i + 32));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(keccak_256(concatBytes(level[i], level[i + 1])));
    level = next;
  }
  const address = keccak_256(concatBytes(chunk.subarray(97, 105), level[0]));
  const digest = keccak_256(concatBytes(utf8ToBytes(PREFIX), keccak_256(concatBytes(chunk.subarray(0, 32), address))));
  const sig = chunk.subarray(32, 97);
  const recovery = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  try {
    const r = BigInt('0x' + bytesToHex(sig.subarray(0, 32)));
    const s = BigInt('0x' + bytesToHex(sig.subarray(32, 64)));
    const pub = new secp256k1.Signature(r, s, recovery).recoverPublicKey(digest).toBytes(false);
    return bytesToHex(keccak_256(pub.subarray(1)).subarray(12));
  } catch {
    return null;
  }
}

// Feed indexes whose last answer was 500: Bee says that for a missing chunk and when it is struggling.
const answered500 = new Set();

// FORMAT.md §3: identifier_i = keccak256(topic || uint64_be(i)); address = keccak256(identifier || owner)
async function feedUpdate(topic, owner, index) {
  const i = new Uint8Array(8);
  new DataView(i.buffer).setBigUint64(0, index, false);
  const identifier = keccak_256(concatBytes(topic, i));
  const address = bytesToHex(keccak_256(concatBytes(identifier, owner)));
  // A feed update was written with the single-owner-chunk upload (POST /soc), i.e. as one chunk,
  // so it is read back with GET /chunks: the stored chunk, signature included (FORMAT.md §4).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await get(`/chunks/${address}`);
    if (res.ok) {
      const chunk = new Uint8Array(await res.arrayBuffer());
      if (bytesToHex(chunk.subarray(0, 32)) !== bytesToHex(identifier)) throw new Problem(`chunk ${address} has the wrong identifier`);
      const span = chunk.length >= 105 ? new DataView(chunk.buffer, chunk.byteOffset + 97, 8).getBigUint64(0, true) : -1n;
      const payload = chunk.subarray(32 + 65 + 8);
      if (span !== 40n || payload.length < 40) throw new Problem(`feed update ${index} is not a 40-byte journal pointer (span ${span})`);
      const view = new DataView(payload.buffer, payload.byteOffset, 8);
      return { index, address, signer: signerOf(chunk), timestamp: Number(view.getBigUint64(0, false)), journalRef: bytesToHex(payload.subarray(8, 40)) };
    }
    if (res.status !== 404 && res.status !== 500) throw new Problem(`gateway answered ${res.status} for /chunks/${address}`);
    if (res.status === 500) answered500.add(index);
    else answered500.delete(index);
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

  const owner = values.owner ? hex(values.owner, 40, '--owner') : null;
  const warnings = [];
  if (values.dwc && values.json) throw new Problem('choose one of --dwc and --json');
  if (values.out && !values.dwc && !values.json) throw new Problem('--out writes the --dwc or --json output; add one of them');

  if (values.record) {
    refs = [hex(values.record, 64, '--record')];
  } else {
    let journalRef;
    if (owner) {
      if (values.hint !== undefined && !/^\d+$/.test(values.hint)) throw new Problem('--hint must be a whole number (a feed index)');
      feed = await latestUpdate(owner, values.hint ? BigInt(values.hint) : 0n);
      if (!feed) {
        throw new Problem(
          answered500.has(0n)
            ? 'the gateway answered 500 for feed update 0, twice: either nothing is published at this address yet, or the gateway is having trouble'
            : 'this journal address has not published anything yet (feed update 0: 404)',
        );
      }
      journalRef = feed.journalRef;
    } else {
      journalRef = hex(values.journal, 64, '--journal');
    }
    journal = decode(await bytes(journalRef), JOURNAL);
    journal.ref = journalRef;
    if (!Array.isArray(journal.entries)) throw new Problem('the journal has no entries list');
    refs = journal.entries.map((e) => hex(e?.ref, 64, 'entry ref'));
    // FORMAT.md §3.2 rules 3 and 4: the pointer is signed by the address we looked up, and the journal agrees.
    if (feed) {
      if (feed.signer !== owner) warnings.push(`the journal pointer is signed by ${feed.signer ? '0x' + feed.signer : 'an unreadable signature'}, not by 0x${owner}`);
      if (String(journal.owner).replace(/^0x/i, '').toLowerCase() !== owner) warnings.push(`the journal says it belongs to ${journal.owner}, not 0x${owner}`);
      if (String(journal.sequence) !== String(feed.index)) warnings.push(`the journal says it is edition ${journal.sequence}, but it was found at feed index ${feed.index}`);
    }
  }

  const sightings = [];
  for (const ref of refs) {
    try {
      const record = decode(await bytes(ref), SIGHTING);
      if (values.photos && record.photo?.ref) {
        await mkdir(values.photos, { recursive: true });
        const photo = await bytes(hex(record.photo.ref, 64, 'photo ref'));
        // FORMAT.md §2.1: typed by the record, and checked against its byteLength.
        if (photo.length !== record.photo.byteLength) {
          record.photo.problem = `photo is ${photo.length} bytes, the record says ${record.photo.byteLength}; not saved`;
        } else {
          const file = join(values.photos, `${record.id}.${EXT[record.photo.contentType] ?? 'bin'}`);
          await writeFile(file, photo);
          record.photo.savedAs = file;
        }
      }
      sightings.push({ ref, record });
    } catch (err) {
      if (!(err instanceof Problem)) throw err;
      sightings.push({ ref, error: err.message });
    }
  }

  if (values.dwc || values.json) {
    let text;
    if (values.dwc) {
      text = dwcCsv(sightings.filter((s) => !s.error).map((s) => toDwc(s.record, s.ref, base, journal?.owner)));
      // The CSV holds only the records that read; everything else goes to stderr so the file stays clean.
      for (const w of warnings) console.error(`WARNING: ${w}`);
      for (const s of sightings.filter((x) => x.error)) console.error(`skipped ${s.ref}: ${s.error}`);
    } else {
      text = `${JSON.stringify({ gateway: base, feed, journal, warnings, sightings }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`;
    }
    if (values.out) {
      await writeFile(values.out, text, 'utf8');
      console.error(`wrote ${values.out}`);
    } else {
      process.stdout.write(text);
    }
    return;
  }

  if (journal) {
    console.log(`Journal of ${journal.owner}, edition ${journal.sequence}, updated ${journal.updatedAt}`);
    if (feed) {
      console.log(`found at feed index ${feed.index} (chunk ${feed.address})`);
      if (feed.signer === owner) console.log('pointer signature checks out: signed by the journal address');
    }
    for (const w of warnings) console.log(`WARNING: ${w}`);
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
    console.log(`      seen by ${r.observer.name}${r.photo ? `, photo ${r.photo.savedAs ?? r.photo.problem ?? r.photo.ref.slice(0, 12) + '…'}` : ''}`);
    if (r.notes) console.log(`      “${r.notes}”`);
  }
  console.log(`\n${sightings.filter((s) => !s.error).length} of ${sightings.length} sightings read from ${base}`);
}

main().catch((err) => {
  console.error(`read-sightings: ${err instanceof Problem ? err.message : err.stack}`);
  process.exit(1);
});
