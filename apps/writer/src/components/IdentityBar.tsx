import type { ConnectionInfo } from '@snaha/swarm-id';
import { RobinDoodle } from './Doodles';

export function IdentityBar(props: {
  info: ConnectionInfo | null;
  loading: boolean;
  busy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const { info, loading, busy } = props;
  const identity = info?.identity;

  return (
    <header className="masthead">
      <a className="brand" href="./" aria-label="Deccan Birders field journal, home">
        <RobinDoodle className="brand-robin" />
        <span className="brand-words">
          <span className="brand-name">Deccan Birders</span>
          <span className="brand-sub">field journal, kept on Swarm</span>
        </span>
      </a>

      <div className="who">
        {loading ? (
          <span className="who-wait">Opening Swarm ID…</span>
        ) : identity ? (
          <>
            <img className="who-avatar" src={identity.avatar.url} alt="" width={36} height={36} />
            <span className="who-name">
              <span className="who-hello">Signed in as</span> {identity.name}
            </span>
            <button type="button" className="link-button" onClick={props.onSignOut} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-tag" onClick={props.onSignIn} disabled={busy}>
            Sign in with Swarm ID
          </button>
        )}
      </div>
    </header>
  );
}
