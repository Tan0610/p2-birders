import { Component, type ReactNode } from 'react';

/**
 * If rendering ever throws, say so on the page instead of leaving a blank
 * desk. The form draft is in local storage, so reloading loses nothing.
 */
export class CrashNote extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="desk">
        <section className="error-slip" role="alert">
          <h2>The field journal hit a snag</h2>
          <p>Something on this page broke while drawing it. Your draft is saved on this device, so reloading is safe.</p>
          <p className="error-next">Reload the page. If it happens again, the details below help whoever fixes it.</p>
          <div className="error-actions">
            <button type="button" className="btn btn-small" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
          <details className="error-details">
            <summary>Details for whoever fixes this</summary>
            <code className="wrap">{this.state.error.message}</code>
          </details>
        </section>
      </main>
    );
  }
}
