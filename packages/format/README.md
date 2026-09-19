# @deccan-birders/format

The Deccan Birders record format as code: constants, TypeScript types,
validators and an encoder/decoder. It has no runtime dependencies and knows
nothing about either app, which is why the independent reader is allowed to use
it. The contract itself is [`FORMAT.md`](../../FORMAT.md); this package follows it.

## Use it from TypeScript

```ts
import { decodeSighting, describeDecodeProblem, encodeSighting } from '@deccan-birders/format';

const bytes = encodeSighting({
  id: crypto.randomUUID(),
  species: { commonName: 'Indian Robin' },
  observedOn: '2026-09-14',
  place: { name: 'Hussain Sagar', precision: 'none' },
  observer: { name: 'Meera' },
  createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
});
// bytes start with {"format":"org.deccanbirders.sighting","formatVersion":"1.0.0",…

const result = decodeSighting(bytes);
if (result.kind === 'ok') console.log(result.value.species.commonName);
else console.error(describeDecodeProblem(result));
```

`decodeSighting` and `decodeJournal` never throw. They return one of `ok`,
`not-json`, `wrong-format`, `unsupported-version` or `invalid` (with a list of
field-level issues), so a reader can say exactly why a document was refused.

## Use it from anything else

The JSON Schemas describe the same rules for any language:

- [`schema/sighting.v1.schema.json`](schema/sighting.v1.schema.json)
- [`schema/journal.v1.schema.json`](schema/journal.v1.schema.json)

A few rules are easier to state than to put in a schema, so check them yourself.
The observation date must be a real date and not in the future, required text
must not be only whitespace, and a journal's entry ids must be unique. See FORMAT.md §2 and §3.

## Fixtures

[`fixtures/`](fixtures) holds valid, minimal, invalid, later-minor and next-major
examples. `test/format.test.ts` shows what a reader should do with each.
`feed-update.vector.json` is a complete signed journal feed update (FORMAT.md §3.4), with every
intermediate value, for testing a feed parser and signature check.
