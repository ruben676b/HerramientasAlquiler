import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './components/Toast';
import { SessionsProvider } from './contexts/SessionsContext';
import { DevolucionesProvider } from './contexts/DevolucionesContext';
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
        <DevolucionesProvider>
          <Layout />
        </DevolucionesProvider>
      </SessionsProvider>
      </ToastProvider>
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
