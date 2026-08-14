import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

type ErrorBoundaryState = {
  error: string | null;
};

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[SONARA_UI_FATAL]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#090d16] p-8 text-slate-100">
          <div className="mx-auto max-w-3xl rounded-2xl border border-red-800 bg-red-950/40 p-6">
            <h1 className="text-xl font-bold text-red-300">SONARA UI ERROR</h1>
            <pre className="mt-4 whitespace-pre-wrap text-sm text-red-200">{this.state.error}</pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-red-700 px-4 py-2 font-medium"
            >
              Reload Sonara
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
