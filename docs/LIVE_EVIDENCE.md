# Live evidence: the first real sighting

A real birder filed one sighting through the live Field Journal, and three readers that share no
code with it read it back from Swarm. Everything below can be re-checked by anyone, with no keys
and no account.

## The filing

| | |
|---|---|
| Filed | 19 September 2026, 12:27:22 UTC (17:57 IST), in the live writer https://deccan-field-journal.vercel.app |
| Route | Swarm ID sign-in, uploads through the subsidised public gateway (`https://api.gateway.ethswarm.org`). No Swarm Desktop, no own node, no postage stamp bought |
| Observer | signed in as `Tan0610` |
| Sighting | Indian Robin (*Copsychus fulicatus*) ×12, 19 September 2026 16:57 (Asia/Calcutta), "Kas plateau, north end by the pond", no coordinates shared |
| Photo | none (`hasPhoto: false`) |
| Verified | 19 September 2026, around 12:31 UTC, all three reads below |

## The addresses

| | |
|---|---|
| Journal address (feed owner) | `0xee8925d7799c604e8f8501774e619fbe674cf2f7` |
| Feed topic string | `org.deccanbirders.sighting/journal/v1` |
| Feed topic | `623426d9d655190ab52962b5970114111d41b9cf0dc9ad52a02e841e6bfb2391` |
| Feed index 0 identifier | `8cdb678c9ecd87da36fee3e677870c94dbe10dad4eee2917e7744dad8797e988` |
| Feed index 0 SOC address | `5f56b01ea3999e789acc4b750b88f5d83c789e0aebf385bf5c843f0c38642d7a` |
| Feed update timestamp | `1789820850` (2026-09-19T12:27:30Z) |
| Journal ref (edition 0) | `52b78c9b08f022c5f252dec63d272a422d576db000b3407e15943e572bab26ff` |
| Sighting record ref | `3b267cc53d561088745bde93fd575112aa52af789b167839630b2ba19caf7ae3` |
| Record id | `afb89a9e-842f-4348-ae26-4f8b9f1d88a0` |

The SOC address was computed twice, from [FORMAT.md §3.2](../FORMAT.md) with `@noble/hashes`
(`identifier = keccak256(topic ‖ uint64_be(0))`, `soc = keccak256(identifier ‖ owner)`) and by the
`read-sightings` CLI; both give the value above, and `GET /chunks/5f56b01e…` returns 200 on the
public gateway. Index 1 (`4b76485e…`) returns 404, so edition 0 is the latest.

Fetch any of it yourself:

```sh
curl https://api.gateway.ethswarm.org/chunks/5f56b01ea3999e789acc4b750b88f5d83c789e0aebf385bf5c843f0c38642d7a  # signed feed update
curl https://api.gateway.ethswarm.org/bytes/52b78c9b08f022c5f252dec63d272a422d576db000b3407e15943e572bab26ff   # journal
curl https://api.gateway.ethswarm.org/bytes/3b267cc53d561088745bde93fd575112aa52af789b167839630b2ba19caf7ae3   # sighting
```

The sighting record, exactly as stored:

```json
{"format":"org.deccanbirders.sighting","formatVersion":"1.0.0","id":"afb89a9e-842f-4348-ae26-4f8b9f1d88a0","species":{"commonName":"Indian Robin","scientificName":"Copsychus fulicatus"},"count":12,"observedOn":"2026-09-19","observedTime":"16:57","timeZone":"Asia/Calcutta","place":{"name":"Kas plateau, north end by the pond","precision":"none"},"observer":{"name":"Tan0610"},"createdAt":"2026-09-19T12:27:22Z","generator":{"name":"deccan-birders-field-journal","version":"1.0.0"}}
```

## Three independent reads

### 1. Almanac, on a different origin

https://deccan-almanac.vercel.app/?owner=0xee8925d7799c604e8f8501774e619fbe674cf2f7

Opened in headless Chromium. It shows "Tan0610's journal, Edition 0, updated 19 September 2026"
and the card "Indian Robin ×12, *Copsychus fulicatus*, Kas plateau, north end by the pond,
19 September 2026, 16:57, Seen by Tan0610". The browser made only `GET` requests, to
`deccan-almanac.vercel.app` and `api.gateway.ethswarm.org`. The two 404s in its console are the
expected probe of feed index 1, which does not exist yet.

![Almanac reading the live journal](screenshots/almanac-live.png)

### 2. `read-sightings` CLI, with the signature checked

```text
$ npm run read -- --owner 0xee8925d7799c604e8f8501774e619fbe674cf2f7

Journal of ee8925d7799c604e8f8501774e619fbe674cf2f7, edition 0, updated 2026-09-19T12:27:30Z
found at feed index 0 (chunk 5f56b01ea3999e789acc4b750b88f5d83c789e0aebf385bf5c843f0c38642d7a)
pointer signature checks out: signed by the journal address

  2026-09-19 16:57  Indian Robin (Copsychus fulicatus) ×12
      at Kas plateau, north end by the pond
      seen by Tan0610

1 of 1 sightings read from https://api.gateway.ethswarm.org
```

With `--json`: `feed.index` is `0`, `feed.signer` is `ee8925d7799c604e8f8501774e619fbe674cf2f7`
(equal to the owner), `feed.journalRef` is `52b78c9b…26ff`, the journal is
`org.deccanbirders.journal` 1.0.0 with `owner` equal to the address looked up and `sequence` 0, the
record validates as `org.deccanbirders.sighting` 1.0.0, and `warnings` is empty.

### 3. Darwin Core export

```text
$ npm run read -- --owner 0xee8925d7799c604e8f8501774e619fbe674cf2f7 --dwc
```

| Darwin Core term | Value |
|---|---|
| `occurrenceID` | `urn:uuid:afb89a9e-842f-4348-ae26-4f8b9f1d88a0` |
| `basisOfRecord` | `HumanObservation` |
| `occurrenceStatus` | `present` |
| `datasetName` | `Deccan Birders journal 0xee8925d7799c604e8f8501774e619fbe674cf2f7` |
| `scientificName` | `Copsychus fulicatus` |
| `vernacularName` | `Indian Robin` |
| `individualCount` | `12` |
| `eventDate` | `2026-09-19T16:57+05:30` |
| `locality` | `Kas plateau, north end by the pond` |
| `informationWithheld` | `Coordinates not shared by the observer; only the place name is given.` |
| `recordedBy` | `Tan0610` |
| `references` | `https://api.gateway.ethswarm.org/bytes/3b267cc53d561088745bde93fd575112aa52af789b167839630b2ba19caf7ae3` |

Coordinate columns are empty because the observer shared none; `dynamicProperties` carries the
Swarm record ref, the journal owner, the format name and version, and the time zone.

## Honest notes

- **Retention is the gateway's call.** This filing went through the subsidised public gateway, so
  the gateway's operators chose the postage batch and decide how long these chunks are kept. The
  writer sent no pin or tag. If the references above stop resolving some day, that is why; a birder
  who wants a guarantee files with their own stamp or node.
- **The journal address is per origin.** Swarm ID derives the signing key for the site you sign in
  on, so `0xee89…f2f7` is Tan0610's journal address for `deccan-field-journal.vercel.app`. The same
  person signing in on another origin (a preview deployment, localhost) gets a different address
  and a different, empty journal.
- **Anyone can read it.** The journal is public by design: the address, the place name and the
  observer name above are all readable by anyone who has the address.
