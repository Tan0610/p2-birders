#!/usr/bin/env node
// Static self-audit. Re-checks, from the source, the guarantees this repo makes
// (see README "How each requirement is met"). Fails with exit code 1 if any breaks.
//
//   node scripts/audit-checks.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rel = (p) => relative(root, p).split(sep).join('/');
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(root, dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(rel(full), exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel(full));
  }
  return out;
}

const importsOf = (src) => [...src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);

const results = [];
const check = (name, problems) => results.push({ name, problems });

// 1. Every write path is gated on a capability check.
{
  const problems = [];
  const writerFiles = walk('apps/writer/src', ['.ts', '.tsx']);
  const uploadCall = /\.(uploadData|uploadFile|uploadChunk|uploadRawPayload|uploadPayload|uploadReference|gsocSend|actUploadData)\s*\(/;
  const allowed = new Set(['apps/writer/src/swarm/uploader.swarmId.ts', 'apps/writer/src/swarm/uploader.ownNode.ts']);
  // Factories and helpers that exist only to write: a feed/SOC writer, or a Bee upload tag.
  const writeFactory = /\.(makeSequentialFeedWriter|makeFeedWriter|makeEpochFeedWriter|makeSOCWriter|createTag)\s*\(/;
  for (const f of writerFiles) {
    if (uploadCall.test(read(f)) && !allowed.has(f)) problems.push(`${f} calls an upload method directly instead of going through uploader.ts`);
    if (writeFactory.test(read(f)) && !allowed.has(f)) problems.push(`${f} creates a feed writer or upload tag outside the gated uploader files`);
  }
  // Nothing else in the repository may write: the readers, the CLI and the mock gateway only GET.
  const nonWriter = [...walk('apps/reader/src', ['.ts', '.tsx']), ...walk('tools', ['.mjs', '.js', '.ts']), 'scripts/mock-gateway.mjs'];
  for (const f of nonWriter) {
    const src = read(f);
    if (uploadCall.test(src) || writeFactory.test(src)) problems.push(`${f} calls a Swarm write method`);
    if (/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(src)) problems.push(`${f} sends a non-GET request`);
  }
  const uploader = read('apps/writer/src/swarm/uploader.ts');
  const methods = (uploader.match(/^\s{4}async \w+\(/gm) ?? []).length;
  const gated = (uploader.match(/^\s{6}await gate\(\);/gm) ?? []).length;
  if (methods === 0 || gated !== methods) problems.push(`uploader.ts has ${methods} upload methods but ${gated} capability gates`);
  if (!/checkUploadCapability\(client, route\)/.test(uploader)) problems.push('uploader.ts does not call checkUploadCapability');
  for (const f of ['apps/writer/src/swarm/uploader.swarmId.ts', 'apps/writer/src/swarm/uploader.ownNode.ts']) {
    const importers = writerFiles.filter((w) => w !== f && importsOf(read(w)).some((i) => i.startsWith('.') && `${posix.join(posix.dirname(w), i)}.ts` === f));
    const outsiders = importers.filter((w) => !w.endsWith('/uploader.ts') && !w.endsWith('/capability.ts') && !w.endsWith('/RouteSettings.tsx'));
    if (outsiders.length) problems.push(`${f} is imported by ${outsiders.join(', ')}; uploads must go through uploader.ts`);
  }
  check('Every write path is gated on a capability check', problems);
}

// 2. A route exists for users with no stamp.
{
  const problems = [];
  const client = read('apps/writer/src/swarm/client.ts');
  const config = read('apps/writer/src/config.ts');
  if (!/subsidisedGatewayUrl/.test(client)) problems.push('SwarmIdClient is not given a subsidisedGatewayUrl');
  if (!/https:\/\/api\.gateway\.ethswarm\.org\//.test(config)) problems.push('no default subsidised gateway in config.ts');
  check('An upload route is configured for users with no stamp', problems);
}

// 3. Records carry their own format identifier and version in the uploaded bytes.
{
  const problems = [];
  const codec = read('packages/format/src/codec.ts');
  if (!/format: SIGHTING_FORMAT,\s*formatVersion: SIGHTING_FORMAT_VERSION,/.test(codec)) problems.push('encodeSighting does not put format + formatVersion first');
  if (!/encoder\.encode\(JSON\.stringify\(record\)\)/.test(codec)) problems.push('encodeSighting does not return the serialised record bytes');
  if (!/encodeSighting\(draft\)/.test(read('apps/writer/src/fileSighting.ts'))) problems.push('the writer does not upload encodeSighting() output');
  check('Each stored record carries its format identifier and version', problems);
}

// 4. The reader does not import the writing app.
{
  const problems = [];
  const readerAllowed = (i) =>
    i.startsWith('.') || ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deccan-birders/format'].includes(i) || i.startsWith('@noble/hashes/') || i.startsWith('@noble/curves/') || i.startsWith('@fontsource/');
  for (const f of walk('apps/reader/src', ['.ts', '.tsx'])) {
    for (const i of importsOf(read(f))) {
      if (!readerAllowed(i)) problems.push(`${f} imports ${i}`);
      if (i.includes('writer')) problems.push(`${f} imports the writer (${i})`);
    }
  }
  const readerPkg = JSON.parse(read('apps/reader/package.json'));
  for (const dep of Object.keys({ ...readerPkg.dependencies, ...readerPkg.devDependencies })) {
    if (dep.includes('writer') || dep === '@snaha/swarm-id' || dep === '@ethersphere/bee-js') problems.push(`reader depends on ${dep}`);
  }
  for (const i of importsOf(read('tools/read-sightings/read-sightings.mjs'))) {
    if (!i.startsWith('node:') && !i.startsWith('@noble/hashes/') && !i.startsWith('@noble/curves/')) problems.push(`read-sightings CLI imports ${i}`);
  }
  const formatPkg = JSON.parse(read('packages/format/package.json'));
  if (Object.keys(formatPkg.dependencies ?? {}).length) problems.push('the format package has runtime dependencies');
  for (const f of walk('packages/format/src', ['.ts'])) {
    for (const i of importsOf(read(f))) if (!i.startsWith('.')) problems.push(`format package file ${f} imports ${i}`);
  }
  check('The reader imports nothing from the writing app', problems);
}

// 5. Reads use the endpoint family they were written with.
{
  const problems = [];
  const sources = [...walk('apps/reader/src', ['.ts', '.tsx']), 'tools/read-sightings/read-sightings.mjs'];
  for (const f of sources) {
    if (/\/bzz\//.test(read(f))) problems.push(`${f} reads through /bzz, but everything is stored with the bytes upload`);
  }
  const bytesReader = read('apps/reader/src/swarm/bytes.ts');
  if (!/\$\{base\}\/bytes\/\$\{ref\}/.test(bytesReader)) problems.push('reader bytes.ts does not GET /bytes/<ref>');
  if (!/\$\{base\}\/chunks\/\$\{address\}/.test(read('apps/reader/src/swarm/feed.ts'))) problems.push('reader feed.ts does not GET /chunks/<soc>');
  if (/uploadFile\(/.test(read('apps/writer/src/swarm/uploader.swarmId.ts'))) problems.push('the writer uses uploadFile (a /bzz manifest)');
  check('Records are read back through the endpoint family they were written to', problems);
}

// 6. No pin or tag on a path that can reach the gateway.
{
  const problems = [];
  for (const f of walk('apps/writer/src', ['.ts', '.tsx'])) {
    if (f.endsWith('uploader.ownNode.ts')) continue;
    const src = read(f);
    if (/\bpin\s*:\s*true\b/.test(src)) problems.push(`${f} passes pin`);
    if (/\btag\s*:\s*[\w.]+/.test(src.replace(/tag\?: never/g, ''))) problems.push(`${f} passes tag`);
  }
  if (!/pin\?: never; tag\?: never/.test(read('apps/writer/src/swarm/uploader.swarmId.ts'))) problems.push('the gateway upload options type no longer forbids pin/tag');
  check('Pin and tag are only used against your own node', problems);
}

// 7. Failures carry a specific reason to the screen.
{
  const problems = [];
  const errors = read('apps/writer/src/errors.ts');
  const codes = [...errors.matchAll(/^\s{2}([A-Z_]+): \{\n\s{4}title: '([^']+)'/gm)];
  const titles = new Set(codes.map((m) => m[2]));
  if (codes.length < 10) problems.push(`only ${codes.length} distinct failure messages`);
  if (titles.size !== codes.length) problems.push('two failure codes share the same title');
  const panel = read('apps/writer/src/components/ErrorPanel.tsx');
  if (!/copy\.title/.test(panel) || !/copy\.message/.test(panel) || !/failure\.code/.test(panel)) problems.push('ErrorPanel does not render the specific title, message and code');
  check('A failed upload shows a specific reason', problems);
}

// 8. No secrets in tracked files.
{
  const problems = [];
  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    problems.push('git ls-files failed; is this a git checkout?');
  }
  const patterns = [
    [/\b(private[_-]?key|priv[_-]?key|secret[_-]?key|signer[_-]?key|FEED_PRIVATE_KEY)\b\s*[:=]\s*['"]?(0x)?[0-9a-fA-F]{64}\b/i, 'a private key'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a PEM private key'],
    [/^\s*['"]?(?:[a-z]{3,8} ){11}(?:(?:[a-z]{3,8} ){3}){0,4}[a-z]{3,8}['"]?\s*$/m, 'what looks like a 12 to 24 word mnemonic'],
    [/https?:\/\/[^\s/:@]+:[^\s/@]+@/, 'a URL with embedded credentials'],
    [/\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|authorization)\b\s*[:=]\s*['"][A-Za-z0-9_\-.]{16,}['"]/i, 'an API key or token'],
    [/\bgift[_ -]?code\b\s*[:=]\s*['"]?[A-Za-z0-9]{8,}/i, 'a gift code'],
  ];
  const tracksEnv = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'));
  if (tracksEnv.length) problems.push(`env files are tracked: ${tracksEnv.join(', ')}`);
  for (const f of tracked) {
    if (f === 'package-lock.json' || /\.(png|jpe?g|webp|woff2?|ico)$/.test(f)) continue;
    let src;
    try {
      src = read(f);
    } catch {
      continue;
    }
    for (const [re, what] of patterns) if (re.test(src)) problems.push(`${f} contains ${what}`);
  }
  check('No credential, private key, mnemonic or gift code in tracked files', problems);
}

let failed = 0;
for (const { name, problems } of results) {
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  for (const p of problems) console.log(`      - ${p}`);
}
console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
