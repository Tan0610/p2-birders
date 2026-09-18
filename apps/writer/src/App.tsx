import { useCallback, useEffect, useMemo, useState } from 'react';
import { CapabilityNote, readiness } from './components/CapabilityNote';
import { ErrorPanel } from './components/ErrorPanel';
import { FiledStamp } from './components/FiledStamp';
import { IdentityBar } from './components/IdentityBar';
import { type FiledNote, JournalCard } from './components/JournalCard';
import { ProgressSteps, type StepsState, initialSteps } from './components/ProgressSteps';
import { RouteSettings } from './components/RouteSettings';
import { SightingForm } from './components/SightingForm';
import { MESSAGES, UploadFailure, classifyError } from './errors';
import { type Filed, type StepListener, fileSighting, pendingEntries, retryJournal } from './fileSighting';
import { FIELD_FOR_PATH, type FormState, emptyForm, toDraft } from './formModel';
import { type PreparedPhoto, preparePhoto } from './photo';
import { KEYS, load, remove, save } from './state/storage';
import { useOnline, useSwarmId } from './state/useSwarmId';
import { DEFAULT_ROUTE, type UploadRoute } from './swarm/routes';

export function App() {
  const swarm = useSwarmId();
  const online = useOnline();
  const info = swarm.status === 'ready' ? swarm.info : null;
  const client = swarm.status === 'ready' ? swarm.client : null;

  const [form, setForm] = useState<FormState>(() => load<FormState | null>(KEYS.draft, null) ?? emptyForm());
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [route, setRoute] = useState<UploadRoute>(() => load<UploadRoute>(KEYS.route, DEFAULT_ROUTE));
  const [routeOpen, setRouteOpen] = useState(false);
  const [steps, setSteps] = useState<StepsState>(initialSteps);
  const [phase, setPhase] = useState<'editing' | 'filing' | 'filed'>('editing');
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [filedNotes, setFiledNotes] = useState<FiledNote[]>(() => load<FiledNote[]>(KEYS.filed, []));
  const [pending, setPending] = useState(pendingEntries);
  const [retrying, setRetrying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  // Keep the draft on this device so a dropped connection never loses a sighting.
  useEffect(() => save(KEYS.draft, form), [form]);

  // Fill "Seen by" from the Swarm ID name the first time we learn it.
  // (Adjusting state while rendering, React's pattern for reacting to a changed value.)
  const identityName = info?.identity?.name;
  const [seenIdentity, setSeenIdentity] = useState<string | undefined>(undefined);
  if (identityName !== seenIdentity) {
    setSeenIdentity(identityName);
    if (identityName && !form.observer) setForm({ ...form, observer: identityName });
  }

  const state = readiness({ swarmId: swarm.status, info, route, online });
  const blockedReason = state.tone === 'blocked' ? MESSAGES[state.code].title : state.tone === 'wait' ? state.text : null;

  const onStep: StepListener = useCallback((step, s, note, progress) => {
    setSteps((prev) => ({ ...prev, [step]: { state: s, note, progress } }));
  }, []);

  const signIn = async () => {
    if (!client) return;
    setSigningIn(true);
    try {
      await client.connect();
    } catch (err) {
      const f = classifyError(err, 'check');
      setFailure(f.code === 'UNKNOWN' ? new UploadFailure('POPUP_BLOCKED', { detail: f.detail, step: 'check' }) : f);
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    if (!client) return;
    try {
      await client.disconnect();
    } catch (err) {
      setFailure(classifyError(err));
    }
  };

  const pickPhoto = async (file: File | null) => {
    setFailure(null);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await preparePhoto(file));
    } catch (err) {
      setFailure(classifyError(err, 'photo'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async () => {
    if (!client) return;
    setFailure(null);
    setSteps(initialSteps());
    setPhase('filing');
    try {
      const result = await fileSighting({ client, route, draft: toDraft(form), photo, onStep });
      const note: FiledNote = {
        recordRef: result.recordRef,
        commonName: result.record.species.commonName,
        observedOn: result.record.observedOn,
        filedAt: new Date().toISOString(),
      };
      const notes = [note, ...filedNotes.filter((n) => n.recordRef !== note.recordRef)].slice(0, 40);
      setFiledNotes(notes);
      save(KEYS.filed, notes);
      setFiled(result);
      setPhase('filed');
    } catch (err) {
      const f = classifyError(err);
      setFailure(f);
      setPhase('editing');
      if (f.recordRef) {
        const note: FiledNote = { recordRef: f.recordRef, commonName: form.commonName, observedOn: form.observedOn, filedAt: new Date().toISOString() };
        const notes = [note, ...filedNotes.filter((n) => n.recordRef !== note.recordRef)];
        setFiledNotes(notes);
        save(KEYS.filed, notes);
        // The record is safely stored; start a fresh form so a retry of the journal does not re-file it.
        setForm(emptyForm(form.observer));
        setPhoto(null);
      }
      if (f.code === 'VALIDATION') focusFirstInvalid(f);
    } finally {
      setPending(pendingEntries());
    }
  };

  const retryJournalUpdate = async () => {
    if (!client) return;
    setRetrying(true);
    setFailure(null);
    setSteps({ ...initialSteps(), check: { state: 'done' }, photo: { state: 'skipped' }, record: { state: 'skipped' } });
    try {
      await retryJournal(client, route, onStep);
    } catch (err) {
      setFailure(classifyError(err, 'journal'));
    } finally {
      setRetrying(false);
      setPending(pendingEntries());
    }
  };

  const fileAnother = () => {
    setFiled(null);
    setPhase('editing');
    setSteps(initialSteps());
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    remove(KEYS.draft);
    setForm(emptyForm(form.observer || identityName || ''));
  };

  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (failure?.code !== 'VALIDATION') return out;
    for (const issue of failure.fieldIssues) {
      const id = FIELD_FOR_PATH[issue.path];
      if (id && !out[id]) out[id] = sentence(issue.message);
    }
    return out;
  }, [failure]);

  const owner = info?.appKey?.address ?? null;
  const showSteps = phase === 'filing' || (failure !== null && Object.values(steps).some((s) => s.state !== 'waiting'));

  return (
    <div className="desk">
      <a className="skip" href="#f-species">
        Skip to the form
      </a>
      <IdentityBar info={info} loading={swarm.status === 'loading'} busy={signingIn} onSignIn={signIn} onSignOut={signOut} />

      <main className="spread">
        <div className="page">
          {phase !== 'filed' && (
            <CapabilityNote state={state} onSignIn={signIn} onOpenRoute={() => setRouteOpen(true)} onReload={() => location.reload()} />
          )}

          {phase === 'filed' && filed ? (
            <FiledStamp filed={filed} onAnother={fileAnother} />
          ) : (
            <SightingForm
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              photo={photo}
              photoBusy={photoBusy}
              onPickPhoto={pickPhoto}
              fieldErrors={fieldErrors}
              disabled={state.tone !== 'ready'}
              blockedReason={blockedReason}
              submitting={phase === 'filing'}
              onSubmit={submit}
            />
          )}

          {showSteps && <ProgressSteps steps={steps} />}

          {failure && (
            <ErrorPanel
              failure={failure}
              fieldIds={Object.keys(fieldErrors)}
              onRetry={failure.recordRef ? retryJournalUpdate : submit}
              onRetryJournal={retryJournalUpdate}
              onSignIn={signIn}
              onOpenRoute={() => setRouteOpen(true)}
              onChoosePhoto={() => {
                void pickPhoto(null).then(() => document.getElementById('f-photo')?.focus());
              }}
              onDismiss={() => setFailure(null)}
            />
          )}
        </div>

        <JournalCard owner={owner} filed={filedNotes} pending={pending} retrying={retrying} onRetryJournal={retryJournalUpdate} />
      </main>

      <footer className="colophon">
        <p>
          Records are written in the published format org.deccanbirders.sighting 1.0.0 (FORMAT.md in the project repository) and are public on Swarm. Nothing
          on Swarm can be deleted; you can only leave a sighting out of your next journal edition.
        </p>
      </footer>

      <RouteSettings
        key={routeOpen ? 'open' : 'closed'}
        open={routeOpen}
        route={route}
        onClose={() => setRouteOpen(false)}
        onSave={(r) => {
          setRoute(r);
          save(KEYS.route, r);
          setRouteOpen(false);
        }}
      />
    </div>
  );
}

function sentence(message: string) {
  return message.charAt(0).toUpperCase() + message.slice(1) + '.';
}

function focusFirstInvalid(f: UploadFailure) {
  const id = f.fieldIssues.map((i) => FIELD_FOR_PATH[i.path]).find(Boolean);
  if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
}
