#!/usr/bin/env node
// A small stand-in for a Bee gateway, for tests and for looking at the reader
// without network access. It serves exactly the read endpoints FORMAT.md uses:
//
//   GET /bytes/<ref>     raw bytes
//   GET /chunks/<addr>   single-owner chunks (journal feed updates)
//
// with permissive CORS, like the public gateway. References here are keccak256
// of the content, not real Swarm BMT hashes; readers treat references as opaque,
// so that difference does not matter to them. Feed updates are properly signed,
// by a throwaway key made fresh each time the gateway starts.
//
//   node scripts/mock-gateway.mjs            # seeded with a sample journal, port 4555
//   node scripts/mock-gateway.mjs --port 0   # any free port

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const TOPIC = keccak_256(utf8ToBytes('org.deccanbirders.sighting/journal/v1'));

/** A journal owner for this run only: a random key that is never written anywhere. */
export function createThrowawaySigner() {
  const secretKey = secp256k1.utils.randomSecretKey();
  const owner = bytesToHex(keccak_256(secp256k1.getPublicKey(secretKey, false).subarray(1)).subarray(12));
  return { owner, secretKey };
}

const bmtRoot = (payload) => {
  const data = new Uint8Array(4096);
  data.set(payload);
  let level = [];
  for (let i = 0; i < 4096; i += 32) level.push(data.subarray(i, i + 32));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(keccak_256(concatBytes(level[i], level[i + 1])));
    level = next;
  }
  return level[0];
};

/** Signs a single-owner chunk the way Bee expects (Ethereum signed-message over identifier ‖ address). */
function signSoc(secretKey, identifier, span, payload) {
  const cacAddress = keccak_256(concatBytes(span, bmtRoot(payload)));
  const digest = keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n32'), keccak_256(concatBytes(identifier, cacAddress))));
  const sig = secp256k1.Signature.fromBytes(secp256k1.sign(digest, secretKey, { prehash: false, format: 'recovered' }), 'recovered');
  const out = new Uint8Array(65);
  out.set(hexToBytes(sig.r.toString(16).padStart(64, '0')), 0);
  out.set(hexToBytes(sig.s.toString(16).padStart(64, '0')), 32);
  out[64] = 27 + sig.recovery;
  return out;
}

export function createStore() {
  const bytes = new Map();
  const chunks = new Map();
  return {
    bytes,
    chunks,
    putBytes(buf) {
      const ref = bytesToHex(keccak_256(buf));
      bytes.set(ref, buf);
      return ref;
    },
    putJson(obj) {
      return this.putBytes(utf8ToBytes(JSON.stringify(obj)));
    },
    /** Writes feed update `index` exactly as FORMAT.md §3.2 describes. */
    putFeedUpdate(signer, index, journalRef, unixSeconds) {
      const i = new Uint8Array(8);
      new DataView(i.buffer).setBigUint64(0, BigInt(index), false);
      const identifier = keccak_256(concatBytes(TOPIC, i));
      const address = bytesToHex(keccak_256(concatBytes(identifier, hexToBytes(signer.owner))));
      const span = new Uint8Array(8);
      new DataView(span.buffer).setBigUint64(0, 40n, true);
      const ts = new Uint8Array(8);
      new DataView(ts.buffer).setBigUint64(0, BigInt(unixSeconds), false);
      const payload = concatBytes(ts, hexToBytes(journalRef));
      chunks.set(address, concatBytes(identifier, signSoc(signer.secretKey, identifier, span, payload), span, payload));
      return address;
    },
  };
}

// ---------- tiny PNG painter, so sample photos are real images ----------

function png(width, height, paint) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const td = concatBytes(utf8ToBytes(type), data);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(td));
    return concatBytes(len, td, crc);
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  );
}

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

/** A bird-shaped silhouette on a perch against a sky; colours vary per sample. */
function birdPicture(sky, ground, bird, accent) {
  return png(480, 360, (x, y) => {
    const inBody = ((x - 0.52) / 0.17) ** 2 + ((y - 0.52) / 0.1) ** 2 < 1;
    const inHead = ((x - 0.68) / 0.065) ** 2 + ((y - 0.4) / 0.075) ** 2 < 1;
    const inTail = x > 0.3 && x < 0.4 && y > 0.28 && y < 0.52 && Math.abs(y - (0.28 + (0.4 - x) * 0.3) - (x - 0.3) * 1.9) < 0.05;
    const inBeak = x > 0.73 && x < 0.79 && Math.abs(y - 0.4) < 0.012 * (0.79 - x) * 30;
    const inPatch = ((x - 0.5) / 0.06) ** 2 + ((y - 0.59) / 0.025) ** 2 < 1;
    const inPerch = y > 0.64 && y < 0.68 && x > 0.08 && x < 0.95;
    if (inPatch && accent) return accent;
    if (inBody || inHead || inTail || inBeak) return bird;
    if (inPerch) return [74, 52, 36];
    if (y > 0.78) return mix(ground, [40, 30, 20], (y - 0.78) * 2);
    return mix(sky, [250, 240, 215], y * 0.9);
  });
}

// ---------- the sample journal ----------

export function seedSampleJournal(store, signer = createThrowawaySigner()) {
  const { owner } = signer;
  const base = { formatVersion: '1.0.0', generator: { name: 'mock-gateway seed', version: '1.0.0' } };
  const photo = (pic) => ({ ref: store.putBytes(pic), retrieval: 'bytes', contentType: 'image/png', byteLength: pic.length, width: 480, height: 360 });
  const sightings = [
    {
      id: '3f6c2a9e-8b1d-4c7e-9a2f-5d0e1b7c4a61',
      species: { commonName: 'Indian Robin', scientificName: 'Copsychus fulicatus' },
      count: 2,
      observedOn: '2026-09-14',
      observedTime: '06:40',
      timeZone: 'Asia/Kolkata',
      place: { name: 'Hussain Sagar lakeside scrub, Hyderabad', precision: 'approximate', coordinates: { lat: 17.42, lon: 78.47 } },
      observer: { name: 'Meera' },
      notes: 'Pair on the rocks by the path, male flicking his tail up. Second one sat quietly in the lantana.',
      photo: photo(birdPicture([196, 214, 226], [160, 120, 80], [34, 30, 28], [150, 60, 40])),
      createdAt: '2026-09-14T02:05:11Z',
    },
    {
      id: '9d8e7f60-1a2b-4c3d-8e4f-50617283a4b5',
      species: { commonName: 'Great Indian Bustard', scientificName: 'Ardeotis nigriceps' },
      observedOn: '1998-01-11',
      place: { name: 'Nannaj grasslands, north of Solapur', precision: 'none' },
      observer: { name: 'R. Kulkarni' },
      notes: 'Copied from the 1998 notebook. One male displaying, seen from the watchtower.',
      createdAt: '2026-09-13T11:20:00Z',
    },
    {
      id: '0c1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5',
      species: { commonName: 'Yellow-throated Bulbul', scientificName: 'Pycnonotus xantholaemus' },
      count: 3,
      observedOn: '2026-08-02',
      observedTime: '07:15',
      timeZone: 'Asia/Kolkata',
      place: { name: 'Boulders above the Tungabhadra, Hampi', precision: 'exact', coordinates: { lat: 15.33512, lon: 76.46234 } },
      observer: { name: 'Arjun' },
      notes: 'Calling from the scrub between boulders. Easy to miss until they move.',
      photo: photo(birdPicture([232, 214, 180], [178, 140, 96], [120, 110, 70], [226, 196, 64])),
      createdAt: '2026-08-02T04:30:00Z',
    },
    {
      id: '5b6c7d8e-9f01-4a2b-8c3d-4e5f60718293',
      species: { commonName: 'Painted Stork', scientificName: 'Mycteria leucocephala' },
      count: 14,
      observedOn: '2026-02-21',
      place: { name: 'Bhigwan backwaters', precision: 'approximate', coordinates: { lat: 18.3, lon: 74.76 } },
      observer: { name: 'Meera' },
      photo: photo(birdPicture([182, 204, 214], [96, 120, 110], [236, 232, 222], [214, 110, 130])),
      createdAt: '2026-02-21T09:12:00Z',
    },
    {
      id: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
      species: { commonName: 'Indian Courser', scientificName: 'Cursorius coromandelicus' },
      count: 2,
      observedOn: '2026-03-08',
      observedTime: '17:50',
      timeZone: 'Asia/Kolkata',
      place: { name: 'Saswad grasslands', precision: 'none' },
      observer: { name: 'Farah' },
      notes: 'Running, stopping, running. Chestnut crown caught the last light.',
      createdAt: '2026-03-08T13:00:00Z',
    },
    {
      id: '1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b',
      species: { commonName: 'Spotted Owlet', scientificName: 'Athene brama' },
      observedOn: '2026-09-10',
      observedTime: '19:20',
      timeZone: 'Asia/Kolkata',
      place: { name: 'Old banyan by the Mula river footbridge, Pune', precision: 'approximate', coordinates: { lat: 18.53, lon: 73.85 } },
      observer: { name: 'Meera' },
      photo: photo(birdPicture([70, 70, 96], [40, 40, 40], [132, 110, 88], null)),
      createdAt: '2026-09-10T14:00:00Z',
    },
  ];
  const refs = sightings.map((s) => store.putJson({ format: 'org.deccanbirders.sighting', ...base, ...s }));
  const entry = (i) => ({
    ref: refs[i],
    id: sightings[i].id,
    commonName: sightings[i].species.commonName,
    observedOn: sightings[i].observedOn,
    hasPhoto: Boolean(sightings[i].photo),
    addedAt: sightings[i].createdAt,
  });

  // Newest first, as FORMAT.md asks; three editions so readers can walk the history.
  const editions = [[0], [0, 1], [0, 1, 5, 2, 4, 3]];
  let previous = null;
  const journalRefs = [];
  editions.forEach((indexes, sequence) => {
    const updatedAt = new Date(Date.UTC(2026, 8, 14 + sequence, 3, 0, 0)).toISOString().replace('.000', '');
    const ref = store.putJson({
      format: 'org.deccanbirders.journal',
      formatVersion: '1.0.0',
      owner,
      feedTopic: 'org.deccanbirders.sighting/journal/v1',
      sequence,
      previous,
      updatedAt,
      entries: indexes.map(entry),
    });
    store.putFeedUpdate(signer, sequence, ref, Date.parse(updatedAt) / 1000);
    journalRefs.push(ref);
    previous = ref;
  });
  return { owner, sightingRefs: refs, journalRefs };
}

export function startMockGateway({ port = 4555, store = createStore() } = {}) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const [, kind, ref] = (req.url ?? '').split('?')[0].split('/');
    const found = kind === 'bytes' ? store.bytes.get(ref) : kind === 'chunks' ? store.chunks.get(ref) : undefined;
    if (found) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': found.length });
      return res.end(found);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: 404, message: 'Not Found' }));
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ url: `http://127.0.0.1:${actual}`, store, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 4555;
  const gateway = await startMockGateway({ port });
  const seeded = seedSampleJournal(gateway.store);
  console.log(`Mock gateway on ${gateway.url}`);
  console.log(`Sample journal address: 0x${seeded.owner}`);
  console.log(`Open Almanac at http://localhost:5174/?owner=0x${seeded.owner}&gateway=${encodeURIComponent(gateway.url)}`);
}
