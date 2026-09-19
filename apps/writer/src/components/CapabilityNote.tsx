import type { ConnectionInfo } from '@snaha/swarm-id';
import { config } from '../config';
import { type ErrorCode, MESSAGES } from '../errors';
import { reasonToCode } from '../swarm/capability';
import { type UploadRoute, describeRoute } from '../swarm/routes';

export type Readiness =
  | { tone: 'wait'; text: string }
  | { tone: 'ready'; text: string; subsidised: boolean }
  | { tone: 'blocked'; code: ErrorCode };

/** What the sticky note says before anyone presses File. The real check runs again at upload time. */
export function readiness(opts: {
  swarmId: 'loading' | 'failed' | 'ready';
  info: ConnectionInfo | null;
  route: UploadRoute;
  online: boolean;
}): Readiness {
  if (!opts.online) return { tone: 'blocked', code: 'OFFLINE' };
  if (opts.swarmId === 'loading') return { tone: 'wait', text: 'Opening Swarm ID…' };
  if (opts.swarmId === 'failed') return { tone: 'blocked', code: 'SWARM_ID_UNAVAILABLE' };
  const info = opts.info;
  if (!info?.identity) return { tone: 'blocked', code: 'NOT_SIGNED_IN' };
  if (!info.canUpload || info.uploadMode === 'unavailable') {
    return { tone: 'blocked', code: reasonToCode(info.uploadUnavailableReason) };
  }
  return {
    tone: 'ready',
    text: describeRoute(opts.route, info.uploadMode),
    subsidised: opts.route.kind === 'swarm-id' && info.uploadMode === 'subsidised',
  };
}

export function CapabilityNote(props: {
  state: Readiness;
  onSignIn: () => void;
  onOpenRoute: () => void;
  onReload: () => void;
}) {
  const { state } = props;

  if (state.tone === 'wait') {
    return (
      <aside className="sticky sticky-wait" aria-live="polite">
        <p className="sticky-line">{state.text}</p>
      </aside>
    );
  }

  if (state.tone === 'ready') {
    return (
      <aside className="sticky sticky-ready" aria-live="polite">
        <p className="sticky-hand">Ready to file.</p>
        <p className="sticky-line">
          Uploads go to {state.text}.{' '}
          <button type="button" className="link-button" onClick={props.onOpenRoute}>
            Change
          </button>
        </p>
        {state.subsidised && (
          <p className="sticky-line sticky-next">
            Your Swarm ID has no drive yet, which is normal for a new account, so the gateway covers the cost. It decides how long it keeps what
            it stamps; add a drive in Swarm ID when you want to pay for your own records.
          </p>
        )}
      </aside>
    );
  }

  const copy = MESSAGES[state.code];
  return (
    <aside className="sticky sticky-blocked" role="status" aria-live="polite">
      <p className="sticky-hand">{copy.title}</p>
      <p className="sticky-line">{copy.message}</p>
      <p className="sticky-line sticky-next">{copy.next}</p>
      <div className="sticky-actions">
        {copy.action === 'sign-in' && (
          <button type="button" className="btn btn-small" onClick={props.onSignIn}>
            Sign in
          </button>
        )}
        {copy.action === 'open-swarm-id' && (
          <a className="btn btn-small" href={config.swarmIdStorageUrl} target="_blank" rel="noreferrer">
            Open Swarm ID
          </a>
        )}
        {copy.action === 'open-route-settings' && (
          <button type="button" className="link-button" onClick={props.onOpenRoute}>
            Where uploads go
          </button>
        )}
        {(state.code === 'SWARM_ID_UNAVAILABLE' || copy.action === 'open-swarm-id') && (
          <button type="button" className="btn btn-small" onClick={props.onReload}>
            Reload
          </button>
        )}
      </div>
    </aside>
  );
}
