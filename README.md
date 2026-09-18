# Deccan Birders: take your records with you

The Deccan Birders have kept sighting records since 1998 and lost them to three apps: a forum that
closed, a Facebook group that ate the photos, and a birding app that was bought, shut down, and
left a CSV where the location column said "near the usual spot".

Meera's one rule for the next move: **whatever writes the records must not be the only thing that
can read them.**

This repository has three pieces:

| | What it is | Where |
|---|---|---|
| **Field Journal** | The app a birder uses to file a sighting. Signs in with Swarm ID and stores each sighting on Swarm under the birder's own identity. | [`apps/writer`](apps/writer) |
| **Almanac** | A separate reader, on its own origin, that shows anyone's sightings from a journal address. It shares no code with the Field Journal. | [`apps/reader`](apps/reader) |
| **The format** | The published description a fourth app relies on, with JSON Schemas, fixtures and test vectors. | [`FORMAT.md`](FORMAT.md), [`packages/format`](packages/format) |

Plus [`tools/read-sightings`](tools/read-sightings), a Node command-line reader that imports
nothing from this repository. It shows that the data and `FORMAT.md` are enough on their own.

Meera files a sighting in the Field Journal. She sends the group her journal address. They open it
in Almanac, or with `read-sightings`, or with whatever someone writes next year from `FORMAT.md`.
Nobody exports anything, because the records were never inside the app.

## How it fits together

```
 Field Journal (apps/writer)                              Swarm                             Almanac (apps/reader)
 ───────────────────────────                              ─────                             ─────────────────────
 sign in with Swarm ID
 check: signed in? can upload? online?  ── no ──► stop, show the specific reason
      │ yes
 photo bytes ─────────── bytes upload ───────────► /bytes/<photo>  ◄────── GET /bytes ──── photo, typed by the record
 sighting JSON {format, formatVersion, …} ────────► /bytes/<record> ◄────── GET /bytes ──── validate format + version
 journal JSON {entries:[…], previous} ────────────► /bytes/<journal> ◄───── GET /bytes ──── list of sightings
 feed update #n = timestamp ‖ journal ref ─ SOC ──► /chunks/<soc n> ◄───── GET /chunks ─── find latest n by probing
      signed by your Swarm ID app key                     ▲
                                                          └── the journal address (owner + fixed topic) never changes
```

- **Who pays:** if your Swarm ID has a drive (a postage batch), it pays. If it does not, which is every
  first-time user, the public subsidised gateway `https://api.gateway.ethswarm.org/` stamps the upload.
  You can also point uploads at your own Bee node and batch.
- **Who signs:** the journal pointer is a feed update signed by your Swarm ID app key, inside the Swarm
  ID iframe. This app never sees a private key.

## Run it

Node 22.12 or newer.

```sh
npm install
npm run dev:writer     # Field Journal on http://localhost:5173
npm run dev:reader     # Almanac on http://localhost:5174 (a different origin on purpose)

npm run read -- --owner 0x<journal address>          # the command-line reader
npm run read -- --owner 0x<journal address> --json --photos ./photos
```

No node and no gift code are needed: sign in with Swarm ID and the subsidised gateway covers the
uploads. To use your own node instead, open **Where uploads go** in the Field Journal and pick a
usable batch. The node has to allow the page's origin, for example
`--cors-allowed-origins="http://localhost:5173,http://localhost:5174"`.

Configuration is in `apps/writer/.env.example` and `apps/reader/.env.example`. Every value is a
public URL; there are no secrets anywhere in this project.

### Checks

```sh
npm run typecheck      # tsc, all workspaces
npm run lint           # eslint, including rules that keep the reader independent
npm test               # vitest: format rules, feed test vectors, error mapping, bee-js interop
npm run build          # both apps
npm run audit:checks   # re-verifies the requirements below from the source
npm run check          # all of the above
```

## How each requirement is met

| Requirement | Where |
|---|---|
| **Upload capability is checked before any upload.** Every write goes through `createUploader()`, whose methods each start with `await gate()`, which runs `checkUploadCapability()`: online, Swarm ID loaded, signed in, `connectionInfo.canUpload`, the unavailable reason, and for your own node, reachable with a usable batch. It throws before the upload call if any of these fail. The File button is also disabled with the reason shown. | [`apps/writer/src/swarm/uploader.ts`](apps/writer/src/swarm/uploader.ts), [`capability.ts`](apps/writer/src/swarm/capability.ts), [`CapabilityNote.tsx`](apps/writer/src/components/CapabilityNote.tsx) |
| **An upload route for users with no stamp.** `SwarmIdClient` is built with `subsidisedGatewayUrl: https://api.gateway.ethswarm.org/`. Your own Bee node is a second route. | [`apps/writer/src/swarm/client.ts`](apps/writer/src/swarm/client.ts), [`config.ts`](apps/writer/src/config.ts), [`uploader.ownNode.ts`](apps/writer/src/swarm/uploader.ownNode.ts) |
| **Each record carries its format identifier and version in the uploaded bytes.** `encodeSighting()` writes `format` and `formatVersion` as the first keys and returns the exact bytes that are uploaded. | [`packages/format/src/codec.ts`](packages/format/src/codec.ts), [`FORMAT.md` §1–2](FORMAT.md) |
| **A reader that does not import the writing app.** Almanac is its own package, Vite app and origin. It depends only on `@deccan-birders/format` (zero runtime dependencies) and `@noble/hashes`. ESLint and the audit script fail on any import of the writer, Swarm ID or bee-js. The CLI imports nothing from the repo at all. | [`apps/reader`](apps/reader), [`tools/read-sightings`](tools/read-sightings), [`eslint.config.js`](eslint.config.js) |
| **Reads use the endpoint family the data was written with.** Records, photos and journals are bytes uploads and are read from `/bytes/<ref>`. Feed updates are single-owner chunks and are read from `/chunks/<soc>`. Nothing uses `/bzz`. | [`apps/reader/src/swarm/bytes.ts`](apps/reader/src/swarm/bytes.ts), [`feed.ts`](apps/reader/src/swarm/feed.ts), [`FORMAT.md` §4](FORMAT.md) |
| **No pin or tag on the gateway path.** The Swarm ID branch's option type is `{ pin?: never; tag?: never }`. Only `uploader.ownNode.ts`, which only talks to your own node, passes `pin: true` and a tag. ESLint forbids `pin`/`tag` anywhere else in the writer. | [`uploader.swarmId.ts`](apps/writer/src/swarm/uploader.swarmId.ts), [`uploader.ownNode.ts`](apps/writer/src/swarm/uploader.ownNode.ts) |
| **A failed upload shows a specific reason.** 20 failure codes, each with its own title, explanation, next step and action button: no drive, drive expired, popup blocked, CORS refusal, payload too large, rate limited, gateway 5xx, own node down, journal update failed after the record was saved, and more. `classifyError()` maps Swarm ID and bee-js errors onto them; the raw detail is one click away. | [`apps/writer/src/errors.ts`](apps/writer/src/errors.ts), [`ErrorPanel.tsx`](apps/writer/src/components/ErrorPanel.tsx) |
| **No credentials in tracked files.** There are none to leak: signing happens in the Swarm ID iframe, and the gateway needs no key. `.env*` is ignored except `.env.example`, which holds only public URLs. `npm run audit:checks` scans every tracked file for keys, mnemonics, credential URLs and gift codes. | [`.gitignore`](.gitignore), [`scripts/audit-checks.mjs`](scripts/audit-checks.mjs) |

## Things worth knowing

- **First-time users.** A new Swarm ID has no drive. With the subsidised gateway configured (the
  default), `uploadMode` is `subsidised` and filing works. Set `VITE_SUBSIDISED_GATEWAY_URL=` to empty
  and you get the `NO_DRIVE` state, with File disabled and a link to add a drive. No request is made.
- **The gateway's limits.** It ignores any batch ID you send and refuses the `Swarm-Pin`/`Swarm-Tag`
  headers (the browser reports only "Failed to fetch"). How long it keeps gateway-stamped data is its
  operator's decision. Records that must last should go through your own drive or node.
- **Location privacy.** Coordinates are shared only if you choose to, and "Roughly" rounds them to
  about a kilometre. Photos are re-drawn through a canvas, which drops EXIF, including GPS.
- **Nothing can be deleted.** Records are public and permanent for as long as their stamp is paid. You
  can leave a record out of your next journal edition; that is all.
- **One writer per journal.** The journal index is re-published in full on each filing. The next feed
  index always comes from reading the feed just before writing, never a local counter. If this device
  published a later edition than the network shows, the app waits instead of overwriting it. Filing
  from two devices at the same moment can still race; the second edition simply wins.
- **The journal address depends on the app's origin.** Swarm ID derives a key per app origin, so the
  local dev writer and a deployed writer have different journal addresses. Deploy the writer at one
  stable URL.
- **npm audit.** `@snaha/swarm-id` 0.4.1 depends on `@ethersphere/bee-js` 11, which depends on
  `axios` 0.30. The advisories concern axios's Node proxy and form handling; this app uses it only
  in the browser, and there is no fixed release in that line.

## Deploying

Both apps are static sites (`apps/*/dist`). For Vercel, create two projects from this repository:

| Project | Root directory | Build command | Output | Environment |
|---|---|---|---|---|
| Field Journal | `apps/writer` | `cd ../.. && npm run build -w @deccan-birders/writer` | `dist` | `VITE_READER_URL=<Almanac URL>` |
| Almanac | `apps/reader` | `cd ../.. && npm run build -w @deccan-birders/reader` | `dist` | none needed |

## Layout

```
FORMAT.md                     the published format: read this to write a fourth app
packages/format/              standalone format definition: constants, types, validators, codec,
                              JSON Schemas, fixtures. Zero runtime dependencies.
apps/writer/                  Field Journal (React, Vite, @snaha/swarm-id 0.4.1, @ethersphere/bee-js 11.2.0)
  src/swarm/client.ts         the one SwarmIdClient, with the subsidised gateway configured
  src/swarm/capability.ts     can this upload happen right now, and if not, why
  src/swarm/uploader*.ts      the only code that writes to Swarm, gated by capability
  src/swarm/journal.ts        read the latest journal from your feed; build the next edition
  src/fileSighting.ts         photo → record → journal → feed pointer, step by step
  src/errors.ts               every failure, with its own words
apps/reader/                  Almanac (React, Vite, @noble/hashes); imports only packages/format
  src/swarm/feed.ts           feed maths and latest-index search, from FORMAT.md §3
  src/swarm/bytes.ts          GET /bytes
tools/read-sightings/         Node CLI reader; imports nothing from this repo
scripts/audit-checks.mjs      re-checks the requirements from source
tests/interop.test.ts         the reader's feed maths against bee-js
```

## Versions

Pinned exactly: `@snaha/swarm-id` 0.4.1, `@ethersphere/bee-js` 11.2.0 (the version Swarm ID 0.4.1
is built against, with the v11 flat API: `bee.uploadData`, `bee.getPostageBatch`),
`@noble/hashes` 2.4.0, React 19.3.0, Vite 8.3.0, TypeScript 5.9.3, Vitest 5.0.1.

## Licence

MIT
