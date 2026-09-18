import { type FormEvent, useState } from 'react';

export const GATEWAYS = [
  { url: 'https://api.gateway.ethswarm.org', label: 'Public gateway (api.gateway.ethswarm.org)' },
  { url: 'http://localhost:1633', label: 'My own Bee node (localhost:1633)' },
];

export type Query = { kind: 'owner'; value: string; hint?: string } | { kind: 'journal'; value: string } | { kind: 'record'; value: string };

/** Accepts a journal address (40 hex), a journal or record reference (64 hex), or a whole share link. */
export function parseInput(raw: string): Query | null {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const q = queryFromParams(url.searchParams);
    if (q) return q;
  } catch {
    // not a link
  }
  const hex = text.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{40}$/.test(hex)) return { kind: 'owner', value: hex.toLowerCase() };
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return { kind: 'journal', value: hex.toLowerCase() };
  return null;
}

export function queryFromParams(params: URLSearchParams): Query | null {
  const owner = params.get('owner');
  if (owner) return { kind: 'owner', value: owner.replace(/^0x/i, ''), ...(params.get('hint') ? { hint: params.get('hint')! } : {}) };
  const journal = params.get('journal');
  if (journal) return { kind: 'journal', value: journal };
  const record = params.get('record');
  if (record) return { kind: 'record', value: record };
  return null;
}

export function AddressForm(props: {
  initial: string;
  gateway: string;
  onGateway: (url: string) => void;
  onOpen: (q: Query, asRecord: boolean) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(props.initial);
  const [asRecord, setAsRecord] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [customGateway, setCustomGateway] = useState(GATEWAYS.some((g) => g.url === props.gateway) ? '' : props.gateway);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = parseInput(text);
    if (!q) {
      setProblem('Paste a journal address (40 characters after 0x), a reference (64 characters), or a share link.');
      return;
    }
    setProblem(null);
    props.onOpen(asRecord && q.kind === 'journal' ? { kind: 'record', value: q.value } : q, asRecord);
  };

  return (
    <form className={`open-form ${props.compact ? 'open-form-compact' : ''}`} onSubmit={submit} noValidate>
      <label htmlFor="q" className="open-label">
        Journal address or reference
      </label>
      <div className="open-row">
        <input
          id="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="0x3f9a… or a share link"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? 'q-problem' : undefined}
        />
        <button type="submit" className="button button-bright">
          Open
        </button>
      </div>
      {problem && (
        <p className="open-problem" id="q-problem">
          {problem}
        </p>
      )}

      {!props.compact && (
        <>
          <label className="open-check">
            <input type="checkbox" checked={asRecord} onChange={(e) => setAsRecord(e.target.checked)} />
            The 64-character reference is a single sighting, not a journal
          </label>

          <fieldset className="gateways">
            <legend>Read through</legend>
            {GATEWAYS.map((g) => (
              <label key={g.url} className="gateway-option">
                <input type="radio" name="gw" checked={props.gateway === g.url} onChange={() => props.onGateway(g.url)} />
                {g.label}
              </label>
            ))}
            <label className="gateway-option gateway-custom">
              <input
                type="radio"
                name="gw"
                checked={!GATEWAYS.some((g) => g.url === props.gateway)}
                onChange={() => customGateway && props.onGateway(customGateway)}
              />
              <span>Another Bee endpoint</span>
              <input
                aria-label="Another Bee endpoint address"
                placeholder="https://…"
                value={customGateway}
                onChange={(e) => {
                  setCustomGateway(e.target.value);
                  if (e.target.value) props.onGateway(e.target.value);
                }}
              />
            </label>
          </fieldset>
        </>
      )}
    </form>
  );
}
