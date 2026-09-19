# read-sightings

A command-line reader for Deccan Birders journals. It was written from
[`FORMAT.md`](../../FORMAT.md) alone and imports nothing from this repository, only
`@noble/hashes` (keccak256) and `@noble/curves` (to check who signed the journal
pointer). It is the proof that a fourth app, one nobody on the project wrote, can
read the records.

```sh
node read-sightings.mjs --owner 0x<journal address>
node read-sightings.mjs --owner 0x<journal address> --photos ./photos --json
node read-sightings.mjs --journal <journal reference>
node read-sightings.mjs --record <sighting reference> --gateway http://localhost:1633
```

The default endpoint is the public gateway, `https://api.gateway.ethswarm.org`.
Any Bee API endpoint works.

What it checks, from FORMAT.md: each feed update's identifier and 40-byte span, who signed it
(it warns unless that is the address you asked for), that the journal's `owner` and `sequence`
agree with the feed, each document's `format`, MAJOR version and required fields, and each
photo's length against the record's `byteLength` before saving it. A record that fails is
listed with its reason; the others still print.
