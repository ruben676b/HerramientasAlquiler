import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './components/Toast';
import { SessionsProvider } from './contexts/SessionsContext';
import { DevolucionesProvider } from './contexts/DevolucionesContext';
import ActivationPage from './components/ActivationPage';
import CajaInicialModal from './components/CajaInicialModal';
import CierreCajaModal from './components/CierreCajaModal';
import Layout from './components/Layout';
import './index.css';

// Context for caja inicial value (accessible from any component)
const CajaInicialContext = createContext({ cajaInicial: 0 });
export const useCajaInicial = () => useContext(CajaInicialContext);

function App() {
  // 'checking' → 'not_activated' → 'activated' → 'caja_inicial' → 'ready'
  const [licenseStatus, setLicenseStatus] = useState('checking');
  const [cajaInicial, setCajaInicial] = useState(0);
  const [showCierre, setShowCierre] = useState(false);

  useEffect(() => {
    window.api.license.check()
      .then(r => setLicenseStatus(r.activated ? 'activated' : 'not_activated'))
      .catch(() => setLicenseStatus('not_activated'));
  }, []);

  // When license is activated, move to caja_inicial step
  useEffect(() => {
    if (licenseStatus === 'activated') {
      setLicenseStatus('caja_inicial');
    }
  }, [licenseStatus]);

  // Listen for close request from main process
  useEffect(() => {
    if (window.api && window.api.onCloseRequested) {
      const cleanup = window.api.onCloseRequested(() => {
        // Only show confirmation if caja is open (app is ready)
        if (licenseStatus === 'ready') {
          setShowCierre(true);
        } else {
          // If caja hasn't been opened yet, just close
          window.api.closeApp();
        }
      });
      return cleanup;
    }
  }, [licenseStatus]);

  const handleCajaInicialConfirm = useCallback((monto) => {
    setCajaInicial(monto);
    setLicenseStatus('ready');
  }, []);

  const handleCierreConfirm = useCallback(() => {
    setShowCierre(false);
    window.api.closeApp();
  }, []);

  const handleCierreCancel = useCallback(() => {
    setShowCierre(false);
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

  if (licenseStatus === 'caja_inicial') {
    return <CajaInicialModal onConfirm={handleCajaInicialConfirm} />;
  }

  return (
    <CajaInicialContext.Provider value={{ cajaInicial }}>
      <ToastProvider>
        <SessionsProvider>
          <DevolucionesProvider>
            <Layout />
            <CierreCajaModal
              open={showCierre}
              cajaInicial={cajaInicial}
              onConfirm={handleCierreConfirm}
              onCancel={handleCierreCancel}
            />
          </DevolucionesProvider>
        </SessionsProvider>
      </ToastProvider>
    </CajaInicialContext.Provider>
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
