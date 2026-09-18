# read-sightings

A command-line reader for Deccan Birders journals. It was written from
[`FORMAT.md`](../../FORMAT.md) alone and imports nothing from this repository, only
`@noble/hashes` for keccak256. It is the proof that a fourth app, one nobody on
the project wrote, can read the records.

```sh
node read-sightings.mjs --owner 0x<journal address>
node read-sightings.mjs --owner 0x<journal address> --photos ./photos --json
node read-sightings.mjs --journal <journal reference>
node read-sightings.mjs --record <sighting reference> --gateway http://localhost:1633
```

The default endpoint is the public gateway, `https://api.gateway.ethswarm.org`.
Any Bee API endpoint works.
