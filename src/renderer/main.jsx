import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './components/Toast';
import { SessionsProvider } from './contexts/SessionsContext';
import Layout from './components/Layout';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 13, color: 'red', background: '#fff', minHeight: '100vh' }}>
          <h2>Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#666', marginTop: 10 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <SessionsProvider>
          <Layout />
        </SessionsProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
