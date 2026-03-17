import { Component } from 'react';

/**
 * Catches render errors in the game UI so a single component crash (e.g. Trick, GameBoard)
 * doesn't freeze the whole browser. Shows a fallback; logs to console and optionally
 * reports to server. "Sync game" requests full state from server so the game can recover without refresh.
 */
class GameErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const payload = {
      source: 'GameErrorBoundary',
      message: error?.message ?? String(error),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    };
    console.error('[GameErrorBoundary]', payload);
    this.props.onError?.(payload);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resyncVersion != null && this.props.resyncVersion !== prevProps.resyncVersion) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="game-error-fallback" style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#fff',
          background: 'rgba(0,0,0,0.8)',
          margin: '1rem',
          borderRadius: '8px',
        }}>
          <h2>Something went wrong in the game</h2>
          <p>Error was logged to the server terminal. Sync game to fetch latest state, or refresh the page.</p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {this.props.onResync && (
              <button
                type="button"
                onClick={() => this.props.onResync()}
                style={{ padding: '8px 16px', cursor: 'pointer' }}
              >
                Sync game
              </button>
            )}
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Root-level error boundary. Catches any render error in the app (including outside the game).
 * Shows a full-page fallback with "Refresh page" so the user never needs to kill the tab or restart the machine.
 */
class RootErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const payload = {
      source: 'RootErrorBoundary',
      message: error?.message ?? String(error),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    };
    console.error('[RootErrorBoundary]', payload);
    this.props.onError?.(payload);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          color: '#fff',
          background: 'rgba(0,0,0,0.92)',
          fontFamily: 'system-ui, sans-serif',
          boxSizing: 'border-box',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h2>
          <p style={{ margin: 0, maxWidth: 360, opacity: 0.9 }}>
            Refresh the page to recover — you don&apos;t need to close the tab or restart.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '0.6rem 1.2rem', cursor: 'pointer', fontSize: '1rem', borderRadius: 6, border: 'none', background: '#4a9', color: '#fff' }}
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default GameErrorBoundary;
export { RootErrorBoundary };
