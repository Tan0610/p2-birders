import {
  FormatError,
  JOURNAL_TOPIC_HEX,
  type JournalEntry,
  type SightingDraft,
  type SightingRecord,
  encodeJournal,
  encodeSighting,
} from '@deccan-birders/format';
import type { SwarmIdClient } from '@snaha/swarm-id';
import { type Step, UploadFailure, classifyError } from './errors';
import type { PreparedPhoto } from './photo';
import { KEYS, load, save } from './state/storage';
import { checkUploadCapability } from './swarm/capability';
import { buildNextJournal, readLatestJournal } from './swarm/journal';
import { type UploadRoute, describeRoute } from './swarm/routes';
import { type Uploader, createUploader } from './swarm/uploader';

export type StepState = 'waiting' | 'active' | 'done' | 'skipped' | 'failed';
export type StepListener = (step: Step, state: StepState, note?: string, progress?: number) => void;

export interface Filed {
  record: SightingRecord;
  recordRef: string;
  journalRef: string;
  feedIndex: string;
  owner: string;
  socAddress: string;
  route: string;
}

/**
 * Files one sighting, in order:
 *   check capability → upload photo bytes → upload record bytes
 *   → read the journal from the feed → upload the next journal → publish the feed pointer.
 * Nothing is uploaded if the capability check fails. If the record lands but
 * the journal update fails, the record is queued and the failure says so.
 */
export async function fileSighting(opts: {
  client: SwarmIdClient;
  route: UploadRoute;
  draft: SightingDraft;
  photo: PreparedPhoto | null;
  onStep: StepListener;
}): Promise<Filed> {
  const { client, route, onStep } = opts;

  onStep('check', 'active');
  const capability = await checkUploadCapability(client, route);
  if (!capability.ok) {
    onStep('check', 'failed');
    throw capability.failure;
  }
  const routeLabel = describeRoute(route, capability.uploadMode === 'own-node' ? undefined : capability.uploadMode);
  onStep('check', 'done', routeLabel);

  // Validate before spending anything on uploads.
  asValidation(() => encodeSighting(opts.draft));
  const uploader = createUploader(client, route);
  const draft: SightingDraft = { ...opts.draft };

  if (opts.photo) {
    const photo = opts.photo;
    onStep('photo', 'active');
    const ref = await failStep(onStep, 'photo', () =>
      uploader.uploadBytes('photo', photo.bytes, (p) => onStep('photo', 'active', undefined, p)),
    );
    draft.photo = {
      ref,
      retrieval: 'bytes',
      contentType: photo.contentType,
      byteLength: photo.bytes.byteLength,
      width: photo.width,
      height: photo.height,
    };
    onStep('photo', 'done', ref);
  } else {
    onStep('photo', 'skipped');
  }

  onStep('record', 'active');
  const bytes = asValidation(() => encodeSighting(draft));
  const recordRef = await failStep(onStep, 'record', () => uploader.uploadBytes('record', bytes));
  onStep('record', 'done', recordRef);

  const record = JSON.parse(new TextDecoder().decode(bytes)) as SightingRecord;
  const entry: JournalEntry = {
    ref: recordRef,
    id: record.id,
    commonName: record.species.commonName,
    observedOn: record.observedOn,
    hasPhoto: Boolean(record.photo),
    addedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  queuePending(entry);

  try {
    const published = await publishJournal(client, uploader, onStep);
    return { record, recordRef, route: routeLabel, ...published };
  } catch (err) {
    const inner = classifyError(err);
    throw new UploadFailure('JOURNAL_PUBLISH_FAILED', {
      step: inner.step ?? 'journal',
      recordRef,
      detail: `${inner.copy.title}. ${inner.detail ?? inner.copy.message}`,
      cause: err,
    });
  }
}

/**
 * Lists every queued sighting in a new journal edition and points the feed at it.
 * Also used on its own by "Retry journal update".
 */
export async function publishJournal(
  client: SwarmIdClient,
  uploader: Uploader,
  onStep: StepListener,
): Promise<{ journalRef: string; feedIndex: string; owner: string; socAddress: string }> {
  onStep('journal', 'active');
  // The owner is resolved through a feed *reader* (read-only, no upload). The only
  // feed writer in this app lives in uploader.swarmId.ts, behind the capability gate.
  const owner = await failStep(onStep, 'journal', () => client.makeSequentialFeedReader({ topic: JOURNAL_TOPIC_HEX }).getOwner());
  let latest = await failStep(onStep, 'journal', () => readLatestJournal(client, owner));

  // What this device last published is only used to notice a stale read,
  // never to choose the index: the index always comes from the network.
  const lastSeen = load<Record<string, string>>(KEYS.lastIndex, {})[owner];
  if (lastSeen !== undefined && (latest === null || latest.index < BigInt(lastSeen))) {
    await new Promise((r) => setTimeout(r, 4000));
    latest = await failStep(onStep, 'journal', () => readLatestJournal(client, owner));
    if (latest === null || latest.index < BigInt(lastSeen)) {
      onStep('journal', 'failed');
      throw new UploadFailure('TIMEOUT', {
        step: 'journal',
        detail: `The network still shows an older journal than edition ${lastSeen}, which this device published. Waiting avoids overwriting it.`,
      });
    }
  }

  const next = buildNextJournal(latest, owner, pendingEntries());
  const journalRef = await failStep(onStep, 'journal', () => uploader.uploadBytes('journal', encodeJournal(next)));
  onStep('journal', 'done', journalRef);

  onStep('pointer', 'active');
  const pointer = await failStep(onStep, 'pointer', () => uploader.publishJournalPointer(journalRef, BigInt(next.sequence)));
  onStep('pointer', 'done', `edition ${pointer.index}`);

  save(KEYS.lastIndex, { ...load<Record<string, string>>(KEYS.lastIndex, {}), [owner]: pointer.index });
  save(KEYS.pending, []);
  return { journalRef, feedIndex: pointer.index, owner: pointer.owner || owner, socAddress: pointer.socAddress };
}

export async function retryJournal(client: SwarmIdClient, route: UploadRoute, onStep: StepListener) {
  // Same rule as a fresh filing: check first, and stop before reading or writing if the answer is no.
  // (Every uploader method checks again right before its own upload.)
  const capability = await checkUploadCapability(client, route);
  if (!capability.ok) {
    onStep('journal', 'failed');
    throw capability.failure;
  }
  return publishJournal(client, createUploader(client, route), onStep);
}

export function pendingEntries(): JournalEntry[] {
  return load<JournalEntry[]>(KEYS.pending, []);
}

function queuePending(entry: JournalEntry) {
  const rest = pendingEntries().filter((e) => e.id !== entry.id);
  save(KEYS.pending, [entry, ...rest]);
}

async function failStep<T>(onStep: StepListener, step: Step, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    onStep(step, 'failed');
    throw classifyError(err, step);
  }
}

function asValidation<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (err instanceof FormatError) {
      throw new UploadFailure('VALIDATION', { step: 'check', detail: err.message, fieldIssues: err.issues });
    }
    throw err;
  }
}
