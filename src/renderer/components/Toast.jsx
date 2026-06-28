import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
  }, []);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}

const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle };
const COLORS = {
  success: { bg: 'oklch(0.94 0.05 160)', ink: 'var(--success)' },
  error: { bg: 'oklch(0.94 0.03 25)', ink: 'var(--danger)' },
  warning: { bg: 'oklch(0.94 0.04 75)', ink: 'var(--warning)' },
};

function Toast({ message, type, onClose }) {
  const Icon = ICONS[type] || ICONS.success;
  const c = COLORS[type] || COLORS.success;

  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm animate-[slideUp_0.2s_ease-out]"
      style={{ backgroundColor: c.bg, color: c.ink, maxWidth: 360 }}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="shrink-0 hover:opacity-70"><X size={13} /></button>
    </div>
  );
}
