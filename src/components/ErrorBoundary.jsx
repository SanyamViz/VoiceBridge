import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
          <div className="bg-slate-900 border border-red-900 rounded-2xl p-8 max-w-md w-full shadow-xl text-center">
            <h1 className="text-xl font-bold text-red-500 mb-4">Application Error</h1>
            <p className="text-slate-400 text-sm mb-4">
              A critical error occurred.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary w-full">
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
