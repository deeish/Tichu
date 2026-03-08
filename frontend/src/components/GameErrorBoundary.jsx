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

export default GameErrorBoundary;
