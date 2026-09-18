import type { SightingRecord } from '@deccan-birders/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AddressForm, GATEWAYS, type Query, queryFromParams } from './components/AddressForm';
import { EggMark } from './components/EggMark';
import { Provenance } from './components/Provenance';
import { SightingDetail } from './components/SightingDetail';
import { SightingSheet } from './components/SightingSheet';
import { StatusNotice } from './components/StatusNotice';
import { type LoadedJournal, type SightingResult, loadJournalByOwner, loadJournalByRef, loadSighting, loadSightings } from './journal';
import { ReaderError, normaliseBase } from './swarm/http';

/** What was last loaded, and for which request; anything older than the current request shows as loading. */
type Loaded =
  | { kind: 'journal'; loaded: LoadedJournal; results: Record<string, SightingResult>; done: boolean }
  | { kind: 'record'; ref: string; record: SightingRecord }
  | { kind: 'error'; error: ReaderError };
type View = Loaded | { kind: 'loading'; stage: string };
type Stamped = Loaded & { request: string };

const DEFAULT_GATEWAY = import.meta.env.VITE_DEFAULT_GATEWAY?.replace(/\/+$/, '') || GATEWAYS[0]!.url;

function initialGateway() {
  return new URLSearchParams(location.search).get('gateway') || DEFAULT_GATEWAY;
}

export function App() {
  const [gateway, setGateway] = useState(initialGateway);
  const [query, setQuery] = useState<Query | null>(() => queryFromParams(new URLSearchParams(location.search)));
  const [loadedView, setLoadedView] = useState<Stamped | null>(null);
  const [open, setOpen] = useState<{ ref: string; record: SightingRecord } | null>(null);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [attempt, setAttempt] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  const base = useMemo(() => {
    try {
      return { ok: true as const, url: normaliseBase(gateway) };
    } catch (err) {
      return { ok: false as const, error: err as ReaderError };
    }
  }, [gateway]);
  const request = query ? `${query.kind}:${query.value}@${gateway}#${attempt}` : '';

  // Fetch whenever the request changes. Results are stamped with the request
  // they answer, so a stale answer can never overwrite a newer one.
  useEffect(() => {
    if (!query || !base.ok) return;
    const ctrl = new AbortController();
    const show = (v: Loaded) => !ctrl.signal.aborted && setLoadedView({ ...v, request });
    void load(query, base.url, ctrl.signal, show);
    return () => ctrl.abort();
  }, [query, base, request]);

  useEffect(() => {
    const onPop = () => {
      setQuery(queryFromParams(new URLSearchParams(location.search)));
      setGateway(initialGateway());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openQuery = (q: Query) => {
    const params = new URLSearchParams();
    params.set(q.kind, q.kind === 'owner' ? `0x${q.value}` : q.value);
    if (q.kind === 'owner' && q.hint) params.set('hint', q.hint);
    if (gateway !== DEFAULT_GATEWAY) params.set('gateway', gateway);
    history.pushState(null, '', `?${params.toString()}`);
    setQuery(q);
    requestAnimationFrame(() => mainRef.current?.focus());
  };

  const goHome = () => {
    history.pushState(null, '', location.pathname);
    setQuery(null);
  };

  const view: View | null = !query
    ? null
    : !base.ok
      ? { kind: 'error', error: base.error }
      : loadedView && loadedView.request === request
        ? loadedView
        : { kind: 'loading', stage: loadingStage(query) };
  const gw = base.ok ? base.url : gateway;

  return (
    <div className="cabinet">
      <header className="top">
        <button type="button" className="wordmark" onClick={goHome}>
          <span className="wordmark-title">Almanac</span>
          <span className="wordmark-sub">reads Deccan Birders journals straight from Swarm</span>
        </button>
        {query && <AddressForm compact initial="" gateway={gateway} onGateway={setGateway} onOpen={openQuery} />}
      </header>

      <main ref={mainRef} tabIndex={-1} className="drawer">
        {!query && <Landing gateway={gateway} onGateway={setGateway} onOpen={openQuery} />}

        {view?.kind === 'loading' && (
          <div className="loading" role="status" aria-live="polite">
            <span className="loading-feather" aria-hidden="true" />
            <p>{view.stage}</p>
          </div>
        )}

        {view?.kind === 'error' && (
          <div className="error-wrap">
            <StatusNotice error={view.error} onRetry={() => setAttempt((a) => a + 1)} />
            <Landing gateway={gateway} onGateway={setGateway} onOpen={openQuery} again />
          </div>
        )}

        {view?.kind === 'record' && (
          <section className="single">
            <p className="single-note">A single sighting, opened by its reference.</p>
            <ul className="sheets sheets-single">
              <SightingSheet gateway={gw} record={view.record} index={1} onOpen={() => setOpen({ ref: view.ref, record: view.record })} />
            </ul>
          </section>
        )}

        {view?.kind === 'journal' && (
          <JournalView
            gateway={gw}
            view={view}
            search={search}
            onSearch={setSearch}
            order={order}
            onOrder={setOrder}
            onOpen={(ref, record) => setOpen({ ref, record })}
          />
        )}
      </main>

      <footer className="imprint">
        <p>
          Almanac was built from the published format description alone (FORMAT.md, org.deccanbirders.sighting 1.x). It shares no code with the
          app that writes the sightings and keeps nothing of its own: close the tab and nothing is lost.
        </p>
      </footer>

      {open && <SightingDetail gateway={gw} record={open.record} recordRef={open.ref} onClose={() => setOpen(null)} />}
    </div>
  );
}

function loadingStage(q: Query) {
  if (q.kind === 'record') return 'Fetching the sighting…';
  return q.kind === 'owner' ? 'Following the journal address to its latest edition…' : 'Reading the journal…';
}

async function load(q: Query, base: string, signal: AbortSignal, show: (v: Loaded) => void) {
  try {
    if (q.kind === 'record') {
      const result = await loadSighting(base, q.value, signal);
      if (!result.ok) throw result.error;
      show({ kind: 'record', ref: q.value, record: result.record });
      return;
    }
    const hint = q.kind === 'owner' && q.hint && /^\d+$/.test(q.hint) ? BigInt(q.hint) : undefined;
    const loaded = q.kind === 'owner' ? await loadJournalByOwner(base, q.value, hint, signal) : await loadJournalByRef(base, q.value, signal);
    const results: Record<string, SightingResult> = {};
    show({ kind: 'journal', loaded, results: {}, done: loaded.journal.entries.length === 0 });
    await loadSightings(
      base,
      loaded.journal.entries.map((e) => e.ref),
      (r) => {
        results[r.ref] = r;
        show({ kind: 'journal', loaded, results: { ...results }, done: false });
      },
      signal,
    );
    show({ kind: 'journal', loaded, results: { ...results }, done: true });
  } catch (err) {
    if (signal.aborted) return;
    show({ kind: 'error', error: err instanceof ReaderError ? err : new ReaderError('GATEWAY_ERROR', String(err)) });
  }
}

function Landing(props: { gateway: string; onGateway: (g: string) => void; onOpen: (q: Query) => void; again?: boolean }) {
  return (
    <section className={`landing ${props.again ? 'landing-again' : ''}`} aria-labelledby="landing-title">
      {!props.again && (
        <div className="landing-copy">
          <h1 id="landing-title">Open someone's bird journal</h1>
          <p>
            Every Deccan Birders member has a journal address. Paste one here and Almanac finds their latest list of sightings on Swarm, then
            fetches each record and photo. No account, no app of theirs needed.
          </p>
        </div>
      )}
      {props.again && <h2 id="landing-title">Try another address</h2>}
      <AddressForm initial="" gateway={props.gateway} onGateway={props.onGateway} onOpen={(q) => props.onOpen(q)} />
    </section>
  );
}

function JournalView(props: {
  gateway: string;
  view: Extract<View, { kind: 'journal' }>;
  search: string;
  onSearch: (s: string) => void;
  order: 'newest' | 'oldest';
  onOrder: (o: 'newest' | 'oldest') => void;
  onOpen: (ref: string, record: SightingRecord) => void;
}) {
  const { loaded, results, done } = props.view;
  const { journal } = loaded;
  const loadedCount = Object.keys(results).length;

  const records = useMemo(() => {
    const needle = props.search.trim().toLowerCase();
    const list = journal.entries
      .map((e) => ({ entry: e, result: results[e.ref] }))
      .filter(({ entry, result }) => {
        if (!needle) return true;
        const r = result?.ok ? result.record : null;
        return [entry.commonName, r?.species.scientificName, r?.place.name, r?.observer.name, r?.notes]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(needle));
      });
    return list.sort((a, b) => {
      const da = a.result?.ok ? a.result.record.observedOn : a.entry.observedOn;
      const db = b.result?.ok ? b.result.record.observedOn : b.entry.observedOn;
      return props.order === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
    });
  }, [journal.entries, results, props.search, props.order]);

  const observers = new Set(Object.values(results).flatMap((r) => (r.ok ? [r.record.observer.name] : [])));

  return (
    <section aria-labelledby="journal-title">
      <div className="title-page">
        <EggMark address={journal.owner} />
        <div>
          <h1 id="journal-title">
            {observers.size === 1 ? `${[...observers][0]}'s journal` : 'A Deccan Birders journal'}
          </h1>
          <p className="title-meta">
            Edition {journal.sequence}, updated {new Date(journal.updatedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}.{' '}
            {journal.entries.length === 1 ? 'One sighting' : `${journal.entries.length} sightings`}.
          </p>
          <p className="title-address">
            <code className="ref">0x{journal.owner}</code>
          </p>
        </div>
      </div>

      {loaded.warnings.map((w) => (
        <p key={w} className="warning" role="note">
          {w}
        </p>
      ))}

      {journal.entries.length === 0 ? (
        <p className="empty">This edition lists no sightings. Nothing is hidden; there is simply nothing here yet.</p>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <span>Search</span>
              <input value={props.search} onChange={(e) => props.onSearch(e.target.value)} placeholder="bulbul, Kas, Meera…" type="search" />
            </label>
            <label className="sort">
              <span>Order</span>
              <select value={props.order} onChange={(e) => props.onOrder(e.target.value as 'newest' | 'oldest')}>
                <option value="newest">Newest sightings first</option>
                <option value="oldest">Oldest sightings first</option>
              </select>
            </label>
            {!done && (
              <p className="fetching" role="status" aria-live="polite">
                Fetched {loadedCount} of {journal.entries.length}
              </p>
            )}
          </div>

          {records.length === 0 && <p className="empty">Nothing matches “{props.search}”.</p>}

          <ul className="sheets">
            {records.map(({ entry, result }, i) =>
              !result ? (
                <li key={entry.ref} className="sheet sheet-ghost" aria-label={`${entry.commonName}, loading`}>
                  <div className="ghost-lines" />
                  <p>{entry.commonName}</p>
                </li>
              ) : result.ok ? (
                <SightingSheet key={entry.ref} gateway={props.gateway} record={result.record} index={i} onOpen={() => props.onOpen(entry.ref, result.record)} />
              ) : (
                <li key={entry.ref} className="sheet sheet-torn">
                  <p className="torn-name">{entry.commonName}</p>
                  <p>{result.error.message}</p>
                  <code className="ref">{entry.ref.slice(0, 16)}…</code>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      <Provenance gateway={props.gateway} loaded={loaded} />
    </section>
  );
}
