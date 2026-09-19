# Deccan Birders record format, version 1

This document is the contract. If you have the bytes stored on Swarm and this
page, you can read every sighting without the app that wrote them. Almanac
(`apps/reader`) and `tools/read-sightings` were both written against this page.

- Sighting record: `org.deccanbirders.sighting`, format version `1.0.0`
- Journal index: `org.deccanbirders.journal`, format version `1.0.0`
- Machine-readable schemas: [`packages/format/schema/sighting.v1.schema.json`](packages/format/schema/sighting.v1.schema.json),
  [`packages/format/schema/journal.v1.schema.json`](packages/format/schema/journal.v1.schema.json) (JSON Schema 2020-12)
- Example documents: [`packages/format/fixtures/`](packages/format/fixtures), including a complete signed
  feed update ([`feed-update.vector.json`](packages/format/fixtures/feed-update.vector.json), §3.4)

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. General rules

1. Every document is UTF-8 JSON with no byte-order mark, stored on Swarm as raw bytes with the
   **bytes** upload (`POST /bytes`) and read back with `GET /bytes/<reference>`. None of them is a
   manifest, so `/bzz/<reference>` does not work for them.
2. Every document names itself. `format` and `formatVersion` MUST be present and writers MUST put
   them first, so the first bytes of any record read
   `{"format":"org.deccanbirders.sighting","formatVersion":"1.0.0",…`.
3. `formatVersion` is SemVer.
   - A reader MUST reject a document whose MAJOR version it does not know, and say so. It MUST NOT guess.
   - Within a known MAJOR, a reader MUST ignore fields it does not recognise.
   - A MINOR release only adds optional fields. A PATCH release only clarifies wording.
   - A MINOR release never adds a value to an existing list of allowed values (`place.precision`,
     `photo.contentType`, `photo.retrieval`) and never changes what a field means; either would be a
     new MAJOR. So within 1.x a value outside those lists makes the document invalid.
4. References are 64 hexadecimal characters and addresses are 40. Writers use lowercase without
   `0x`; readers MUST accept either case and an optional `0x`.
5. Times are RFC 3339 in UTC (`2026-09-14T02:05:11Z`). Dates are `YYYY-MM-DD`.
6. Everything is public. Nothing on Swarm can be deleted; a writer can only leave a record out of
   its next journal edition.

## 2. Sighting record: `org.deccanbirders.sighting` 1.0.0

At most 64 KiB once encoded. One JSON object:

| Field | Type | Required | Rules |
|---|---|---|---|
| `format` | string | yes | exactly `org.deccanbirders.sighting` |
| `formatVersion` | string | yes | `1.x.y` |
| `id` | string | yes | UUID v4. Stable for this sighting; readers de-duplicate on it |
| `species.commonName` | string | yes | 1–120 characters, as the observer wrote it |
| `species.scientificName` | string | no | up to 120 characters |
| `count` | integer | no | 1–100000 |
| `observedOn` | string | yes | `YYYY-MM-DD`, the local date where the bird was seen; not in the future |
| `observedTime` | string | no | `HH:MM`, 24-hour, local time |
| `timeZone` | string | no | IANA name such as `Asia/Kolkata`. Absent means unknown |
| `place.name` | string | yes | 1–200 characters. A name another birder could find |
| `place.precision` | string | yes | `exact`, `approximate` (coordinates rounded to 2 decimal places, about 1 km) or `none` |
| `place.coordinates` | object | if precision is not `none` | `{ "lat": number, "lon": number }`, WGS84 decimal degrees. MUST be absent when precision is `none` |
| `observer.name` | string | yes | 1–120 characters |
| `notes` | string | no | up to 2000 characters |
| `photo` | object | no | see below |
| `createdAt` | string | yes | RFC 3339 UTC, when the record was written |
| `generator` | object | no | `{ "name", "version" }` of the writing software. Informational only; readers MUST NOT change behaviour on it |

Rules a JSON Schema cannot express, which readers and writers MUST also apply:

- `observedOn` is a real calendar date (`2026-02-30` is invalid) and is no later than one day after the
  reader's current UTC date (the day of slack covers time zones).
- A required text field that is empty or only whitespace counts as missing.
- A document that breaks any rule is invalid as a whole. Readers report it and do not show a partial record.

### 2.1 Photo attachment

A photo is stored separately, as the raw image bytes (bytes upload), and the record types it:

| Field | Type | Required | Rules |
|---|---|---|---|
| `ref` | string | yes | 64-hex reference of the image bytes |
| `retrieval` | string | yes | always `bytes`: fetch it from `GET /bytes/<ref>` |
| `contentType` | string | yes | `image/jpeg`, `image/png` or `image/webp` |
| `byteLength` | integer | yes | size of the stored image; readers SHOULD check it |
| `width`, `height` | integer | no | pixels |

The bytes carry no filename and no content type of their own. Use `contentType` from the record:
a reader MUST type the bytes with it (for example as a `Blob` of that type) and MUST NOT guess the type
from the bytes. A reader SHOULD refuse to show a photo whose length differs from `byteLength`, and say
so. Photos are public like everything else, so writers SHOULD strip embedded metadata (EXIF, GPS)
before uploading; the Field Journal re-encodes every photo for that reason.

### 2.2 Example

```json
{
  "format": "org.deccanbirders.sighting",
  "formatVersion": "1.0.0",
  "id": "3f6c2a9e-8b1d-4c7e-9a2f-5d0e1b7c4a61",
  "species": { "commonName": "Indian Robin", "scientificName": "Copsychus fulicatus" },
  "count": 2,
  "observedOn": "2026-09-14",
  "observedTime": "06:40",
  "timeZone": "Asia/Kolkata",
  "place": { "name": "Hussain Sagar lakeside scrub, Hyderabad", "precision": "approximate", "coordinates": { "lat": 17.42, "lon": 78.47 } },
  "observer": { "name": "Meera" },
  "notes": "Pair on the rocks by the path, male flicking his tail up.",
  "photo": { "ref": "a3b1…eeef", "retrieval": "bytes", "contentType": "image/jpeg", "byteLength": 184233, "width": 1600, "height": 1067 },
  "createdAt": "2026-09-14T02:05:11Z",
  "generator": { "name": "deccan-birders-field-journal", "version": "1.0.0" }
}
```

## 3. Finding someone's sightings

Each observer has a **journal address**: a 20-byte Ethereum-style address that owns a Swarm
feed. The feed always points at the latest **journal index**, which lists that observer's
records. The address never changes, so it can be printed, shared and bookmarked.

In the Field Journal app the address is the user's Swarm ID app key for that app. Nothing about
reading depends on that; any key can publish a journal.

### 3.1 Journal index: `org.deccanbirders.journal` 1.0.0

Every field below is required. `previous` is required too, and is `null` for the first edition.

| Field | Type | Rules |
|---|---|---|
| `format` | string | exactly `org.deccanbirders.journal` |
| `formatVersion` | string | `1.x.y` |
| `owner` | string | 40-hex address of the feed that publishes this journal |
| `feedTopic` | string | the topic string, `org.deccanbirders.sighting/journal/v1` |
| `sequence` | integer | the feed index this edition is published at |
| `previous` | string or null | 64-hex reference of the previous edition, or `null` for the first |
| `updatedAt` | string | RFC 3339 UTC |
| `entries` | array | newest first, unique by `id` |
| `entries[].ref` | string | 64-hex reference of the sighting record bytes |
| `entries[].id` | string | the record's `id` |
| `entries[].commonName`, `entries[].observedOn` | string | summary only (`observedOn` is `YYYY-MM-DD`); where it differs from the record, the record wins |
| `entries[].hasPhoto` | boolean | summary only |
| `entries[].addedAt` | string | RFC 3339 UTC |

Each edition lists every sighting still in the journal, so a reader only needs the latest one.
`previous` lets a reader walk the history.

### 3.2 The feed

The journal feed is a Swarm sequential feed:

```
topic         = keccak256(utf8("org.deccanbirders.sighting/journal/v1"))
              = 623426d9d655190ab52962b5970114111d41b9cf0dc9ad52a02e841e6bfb2391
identifier_i  = keccak256(topic ‖ uint64_big_endian(i))           i = 0, 1, 2, …
socAddress_i  = keccak256(identifier_i ‖ owner)                    owner = 20 bytes
```

Update `i` is a single-owner chunk at `socAddress_i`. Fetch it with `GET /chunks/<socAddress_i>`.
The response body is:

```
identifier (32 bytes) ‖ signature (65 bytes) ‖ span (8 bytes, little-endian) ‖ payload (span bytes)
payload = uint64_big_endian(unixSeconds) ‖ journalReference (32 bytes)        → span is 40
```

Rules:

1. Updates start at index 0 and have no gaps. The latest update is the highest `i` that exists.
2. A reader MUST check that the returned identifier equals `identifier_i` and that the span is 40.
3. A reader MAY verify the signature, and SHOULD warn when it does not match. Almanac and
   `read-sightings` both do this:

   ```
   bmtRoot      = binary Merkle root of payload zero-padded to 4096 bytes: split it into 128
                  segments of 32 bytes, then repeatedly replace each adjacent pair (a, b) with
                  keccak256(a ‖ b) until one 32-byte value is left
   chunkAddress = keccak256(span ‖ bmtRoot)                          span = the 8 bytes from the chunk
   digest       = keccak256(identifier ‖ chunkAddress)
   signed       = keccak256(utf8("Ethereum Signed Message:
32") ‖ digest)
   signature    = r (32 bytes) ‖ s (32 bytes) ‖ v (1 byte, 27 or 28; treat 0 or 1 the same way)
   signer       = last 20 bytes of keccak256(uncompressed public key recovered from signature and signed,
                  without its leading 0x04 byte)
   ```

   The signer must equal the `owner` you looked up. (A Bee node refuses to store a single-owner chunk
   whose signature does not match its address, so a mismatch means the gateway itself is misbehaving.)
4. The journal's own `sequence` SHOULD equal `i`, and its `owner` SHOULD equal the address you
   looked up. Warn if they differ.

### 3.3 Reader algorithm

```
1. latest = highest i such that GET /chunks/socAddress_i returns 200
     - if index 0 is missing, the journal is empty
     - gateways answer a missing chunk with 404, sometimes 500; retry once before calling it missing,
       and if index 0 only ever got 500, say the gateway may be at fault rather than "empty"
     - search: check 0, then 1, 2, 4, 8, … until a miss, then binary-search between the last hit and the miss
2. journalRef = payload[8..40] of that chunk
3. journal    = GET /bytes/<journalRef>, check format + major version + rules above
4. for each entry: record = GET /bytes/<entry.ref>, check format + major version + rules above
5. for each record with a photo: GET /bytes/<photo.ref>, typed by photo.contentType
```

A record that cannot be fetched, or fails validation, MUST NOT hide the others: show the rest and
say which entry failed and why. Documents of any size are read the same way; `GET /bytes` reassembles
content larger than one chunk.

The public gateway `https://api.gateway.ethswarm.org` serves all of these to browsers from any
origin. It does not expose the `swarm-feed-index` response headers across origins, which is why
step 1 probes chunks directly instead of calling `GET /feeds/…`. Any Bee node works the same way.

### 3.4 Test vectors

For `owner = 1234567890abcdef1234567890abcdef12345678`:

| i | identifier_i | socAddress_i |
|---|---|---|
| 0 | `8cdb678c9ecd87da36fee3e677870c94dbe10dad4eee2917e7744dad8797e988` | `137186da227428fbc007f5ec121de10e0817136e73d8a98094645830df508e9b` |
| 1 | `a04788475252a73952e48912c1f294d64339158665f5f43011c3953a91fa0172` | `24318ee008ee0689486b9c0a7bcf41309d65c63c8cbd8a1b3154cca4b75457f7` |
| 5 | `ec9e4cc6a05c82a28af5e9281e0d00bac5b8b5f39478e5fe5caf69b003fc83c7` | `7efc894d178fe1e7de05d1c4cc79794572097dadb5d2840e494996acf65d6304` |

These were produced with `@ethersphere/bee-js` 11.2.0 (`makeFeedIdentifier`, `makeSOCAddress`)
and, separately, with `@noble/hashes`. `apps/reader/test/feed.test.ts` and
`tests/interop.test.ts` assert them.

A complete signed update, for testing a parser and signature check end to end, is in
[`packages/format/fixtures/feed-update.vector.json`](packages/format/fixtures/feed-update.vector.json).
It is update 0 of owner `f80b71c26f071455d837c5bd959aec084523b002` (signed once with a throwaway key
that was then discarded), pointing at journal
`0b8f3a2c1d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e` with timestamp `1789351540`
(2026-09-14T02:05:40Z):

| Value | Hex |
|---|---|
| `socAddress_0` | `c982a96fef19d296958e7084ed6d218e26a0a93223b9681c614b61b82bb625cf` |
| `bmtRoot` of the 40-byte payload | `39c3cf3f26999e8829ee6b164c0ff85485911285ce38e543e7af83a0c0730f60` |
| `chunkAddress` | `a140cab4fc31e259c7517c2ff4fcab5b879e231be430d24b7cd68f8bab51a722` |
| `digest` (before the prefix) | `daf4a21bdec8e492aaa58361e54a54eac2ad7bdb37daf352476901177d60b6eb` |

The file also holds the signature and the full 145-byte chunk exactly as `GET /chunks` returns it.
bee-js's own `unmarshalSingleOwnerChunk` accepts it at `socAddress_0` (`tests/interop.test.ts`).

## 4. Where each object lives

| Object | Written with | Read with |
|---|---|---|
| Sighting record | bytes upload | `GET /bytes/<ref>` |
| Photo | bytes upload | `GET /bytes/<ref>` |
| Journal index | bytes upload | `GET /bytes/<ref>` |
| Journal pointer (feed update) | single-owner chunk upload (`POST /soc/<owner>/<identifier>?sig=…`) | `GET /chunks/<socAddress>` |

Nothing in this format is read through `/bzz`.

Why `/chunks` is the matching read for a feed update: a single-owner chunk is a chunk. `POST /soc`
stores exactly one chunk at `socAddress = keccak256(identifier ‖ owner)`, and `GET /chunks/<address>`
returns that chunk as stored, `identifier ‖ signature ‖ span ‖ payload`. It is the only read that
hands back the signature in the body, which rule 3 of §3.2 needs. The alternatives are not
equivalent: `GET /feeds/<owner>/<topic>` resolves the index on the node and reports it only in
`swarm-feed-index` response headers, which a browser cannot read across origins unless the
gateway exposes them, and `GET /soc/<owner>/<identifier>` (newer Bee versions) returns the payload
with the signature moved into a response header. There is no bytes or manifest step in between,
so `/bytes` and `/bzz` do not apply to the pointer at all.

## 5. Sharing links

The reference apps accept these query strings, and other apps are encouraged to do the same:

- `?owner=0x<journal address>`, optionally with `&hint=<feed index>` to start the search there
- `?journal=<journal reference>`
- `?record=<sighting reference>`
- `&gateway=<Bee API URL>` to read through a particular node

## 6. Writing a reader: checklist

1. Topic: `keccak256(utf8("org.deccanbirders.sighting/journal/v1"))`; check your value against §3.2.
2. Latest index: probe `GET /chunks/<socAddress_i>` as in §3.3; check identifier and span (§3.2 rules 1–2).
3. Journal: `GET /bytes/<payload[8..40]>`; check `format`, the MAJOR of `formatVersion`, and §3.1.
4. Records: `GET /bytes/<entry.ref>`; check `format`, MAJOR, §2 and the rules below its table. Ignore unknown fields.
5. Photos: `GET /bytes/<photo.ref>`; type by `contentType`, compare with `byteLength` (§2.1).
6. Report each failure on its own, in words, and keep showing everything that did load.
7. Test against the fixtures: `sighting.valid`, `sighting.minimal` and `sighting.future-minor` must be
   accepted, `sighting.invalid` rejected as invalid, `sighting.v2` rejected as an unknown MAJOR, and
   `feed-update.vector` parsed to its journal reference and signer.

## 7. Changes

- 1.0.0: first version.
