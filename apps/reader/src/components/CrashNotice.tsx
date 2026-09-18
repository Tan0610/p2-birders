import { Component, type ReactNode } from 'react';

/** Shows a plain explanation instead of an empty drawer if rendering throws. */
export class CrashNotice extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="cabinet">
        <section className="notice" role="alert">
          <h2>Almanac could not draw this page</h2>
          <p>Nothing is stored here, so reloading is always safe.</p>
          <button type="button" className="button" onClick={() => location.reload()}>
            Reload
          </button>
          <details>
            <summary>What went wrong</summary>
            <code className="wrap">{this.state.error.message}</code>
          </details>
        </section>
      </main>
    );
  }
}
