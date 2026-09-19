# Almanac: the independent reader

Almanac reads Deccan Birders journals from Swarm. It was written against
[`FORMAT.md`](../../FORMAT.md) and the standalone format package
[`@deccan-birders/format`](../../packages/format), and nothing else:

- It does not import any code from `apps/writer`, and `npm run audit:checks` fails if it ever does.
- It runs as its own site on its own origin, not as a tab or route inside the writer.
- It keeps no state of its own. Everything shown comes from the journal address or reference in the URL.

It uses plain `GET` requests with no custom headers, so it works against the public
gateway from any origin: `/chunks/<soc>` for the journal feed and `/bytes/<ref>` for
journals, records and photos.

It also recovers who signed each journal pointer (FORMAT.md §3.2, rule 3) and says so
in "How this page found the journal", with a warning if the signer is not the journal
address you opened.

Under the sheets, "Take these records elsewhere" downloads the journal as a Darwin Core
occurrence CSV (FORMAT.md §7, for GBIF, iNaturalist imports or a spreadsheet) or as the original
JSON documents. The file is built in the browser from `toDwcCsv` in the format package; nothing
is uploaded.

```sh
npm run dev:reader     # http://localhost:5174
```

Share links look like `?owner=0x<journal address>`, `?journal=<ref>` or `?record=<ref>`.
Add `&gateway=http://localhost:1633` to read through your own node.
