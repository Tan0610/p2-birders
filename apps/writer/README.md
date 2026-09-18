# Field Journal: the sighting app

The app a Deccan Birders member uses to file a sighting. It signs in with
[Swarm ID](https://swarm.snaha.net/docs/) and stores everything on Swarm under
the birder's own identity.

```sh
npm run dev:writer     # http://localhost:5173
```

## What happens when you press "File this sighting"

1. **Check.** `checkUploadCapability()` reads Swarm ID's `connectionInfo` fresh: are you
   online, signed in, and allowed to upload (`canUpload`, `uploadMode`,
   `uploadUnavailableReason`)? On the own-node route it also asks the node whether it is
   reachable and the batch usable. If anything says no, nothing is uploaded and the reason is shown.
2. **Photo.** Shrunk to 1600px and re-encoded as JPEG in the browser, which drops EXIF and
   any GPS it held, then uploaded as raw bytes.
3. **Sighting.** `encodeSighting()` from `@deccan-birders/format` validates the record and
   produces the exact bytes, `format` and `formatVersion` first. Uploaded as raw bytes.
4. **Journal.** The latest journal is read from your feed, the new sighting (and anything
   queued from an earlier failed attempt) is added, and the next edition is uploaded.
5. **Pointer.** Your feed gets a new update pointing at that edition. Its index comes from the
   read in step 4, and Swarm ID's app key signs it.

If step 4 or 5 fails after the sighting is stored, you are told exactly that. The sighting is
queued, a "Retry journal update" button appears, and it is linked so you can open it on its own.

## Where uploads go

| Route | Who pays | Pin and tag |
|---|---|---|
| Swarm ID, with a drive | your drive (postage batch) | never sent |
| Swarm ID, no drive (every new account) | the public subsidised gateway | never sent; the gateway's CORS rules refuse them |
| Your own Bee node | a batch on your node | sent (`pin: true`, a fresh tag), only in `uploader.ownNode.ts` |

## Files

| File | Job |
|---|---|
| `src/swarm/client.ts` | the single `SwarmIdClient`, with `subsidisedGatewayUrl` and a hidden, always-mounted frame |
| `src/swarm/capability.ts` | whether an upload may happen now, and if not, why |
| `src/swarm/uploader.ts` | the only way to write; every method is gated |
| `src/swarm/uploader.swarmId.ts` | Swarm ID branch: bytes upload and the feed pointer |
| `src/swarm/uploader.ownNode.ts` | own-node branch, via bee-js 11 |
| `src/swarm/journal.ts` | read the latest journal; build the next edition |
| `src/fileSighting.ts` | the five steps above, with progress events |
| `src/errors.ts` | 20 failure codes, each with its own title, message and next step |
| `src/photo.ts` | shrink, re-encode, strip metadata |

## Settings

`.env.example` lists them. All are public URLs:
`VITE_SWARM_ID_ORIGIN`, `VITE_SUBSIDISED_GATEWAY_URL` (set it empty to see what a
first-time user gets without it), `VITE_LOCAL_BEE_URL` and `VITE_READER_URL`.
