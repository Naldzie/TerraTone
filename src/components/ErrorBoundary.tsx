import { Component } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface State {
  error: Error | null;
}

/**
 * Last-resort crash guard. Any render failure (e.g. WebGL unavailable on a
 * low-end device, corrupt cached data) shows a branded fallback instead of
 * a blank screen, with a one-tap recovery that preserves offline data.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[TerraTone] Uncaught render error:', error, info.componentStack);
  }

  private reload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell">
        <main className="main" id="main" style={{ maxWidth: 560 }}>
          <div className="card" role="alert" style={{ marginTop: 32 }}>
            <h2 style={{ margin: '0 0 8px' }}><Icon name="globe" /> Something glitched in orbit</h2>
            <p style={{ color: 'var(--ink-dim)' }}>
              TerraTone hit an unexpected error and had to stop this view. Your downloaded
              datasets, saved experiences, and settings are untouched.
            </p>
            <div className="row">
              <button className="btn primary" onClick={this.reload}>
                <Icon name="restart" /> Reload TerraTone
              </button>
            </div>
            <details>
              <summary style={{ cursor: 'pointer', color: 'var(--ink-dim)' }}>
                Technical details (for bug reports)
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.75rem', color: 'var(--ink-faint)' }}>
                {String(this.state.error?.message ?? 'Unknown error')}
              </pre>
            </details>
          </div>
        </main>
      </div>
    );
  }
}
