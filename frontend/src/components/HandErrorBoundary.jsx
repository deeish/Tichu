import { Component } from 'react';

/**
 * Catches render errors in the hand/dock only so a hand bug doesn't replace the whole game view.
 * Shows a minimal fallback; parent GameErrorBoundary still catches anything that escapes.
 */
class HandErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HandErrorBoundary]', error?.message ?? error, errorInfo?.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="hand-error-fallback" style={{
          padding: '1rem',
          textAlign: 'center',
          color: '#ccc',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: '8px',
          margin: '0.5rem',
        }}>
          <span>Hand unavailable</span>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{ marginLeft: '0.75rem', padding: '4px 12px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default HandErrorBoundary;
