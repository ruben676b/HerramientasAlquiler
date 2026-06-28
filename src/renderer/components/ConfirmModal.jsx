import { AlertTriangle } from 'lucide-react';
import Button from './ui/button';

export default function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-4 text-center"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: danger ? 'oklch(0.94 0.03 25)' : 'oklch(0.94 0.04 75)' }}>
          <AlertTriangle size={22} style={{ color: danger ? 'var(--danger)' : 'var(--warning)' }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Cancelar</button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} size="sm" className="flex-1"
            style={danger ? {} : undefined}>
            {confirmLabel || 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
