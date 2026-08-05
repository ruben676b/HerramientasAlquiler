import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './components/Toast';
import { SessionsProvider } from './contexts/SessionsContext';
import { DevolucionesProvider } from './contexts/DevolucionesContext';
import ActivationPage from './components/ActivationPage';
import Layout from './components/Layout';
import './index.css';

function App() {
  const [licenseStatus, setLicenseStatus] = useState('checking');

  useEffect(() => {
    window.api.license.check()
      .then(r => setLicenseStatus(r.activated ? 'activated' : 'not_activated'))
      .catch(() => setLicenseStatus('not_activated'));
  }, []);

  if (licenseStatus === 'checking') {
    return (
      <div style={{
        height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--bg)',
      }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  if (licenseStatus === 'not_activated') {
    return <ActivationPage onActivated={() => setLicenseStatus('activated')} />;
  }

  return (
    <ToastProvider>
      <SessionsProvider>
        <DevolucionesProvider>
          <Layout />
        </DevolucionesProvider>
      </SessionsProvider>
    </ToastProvider>
  );
}

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
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

let isUppercasing = false;
const forceUppercase = (e) => {
  if (isUppercasing) return;
  const t = e.target;
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  const type = (t.type || 'text').toLowerCase();
  if (!['text', 'search', 'url', 'tel', 'email'].includes(type) && t.tagName !== 'TEXTAREA') return;
  if (t.style.textTransform === 'none') return;
  const upper = t.value.toUpperCase();
  if (t.value !== upper) {
    isUppercasing = true;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    const Prototype = t.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(Prototype, 'value').set;
    nativeSetter.call(t, upper);
    t.dispatchEvent(new Event('input', { bubbles: true }));
    if (start !== null && end !== null) t.setSelectionRange(start, end);
    isUppercasing = false;
  }
};
document.addEventListener('input', forceUppercase, true);
