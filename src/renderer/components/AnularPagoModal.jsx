import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useToast } from './Toast';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10) || '—';
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
};

export default function AnularPagoModal({ pago, onClose, onConfirm }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const esDevolucionDeposito = pago.tipo === 'devolucion_deposito';
  const esDeposito = pago.tipo === 'deposito';

  const handleConfirm = async () => {
    setGuardando(true);
    setError('');
    try {
      await window.api.anularPago({ idPago: pago.id, motivo: motivo || undefined });
      toast('Pago anulado: S/ ' + pago.monto.toFixed(2));
      onConfirm();
    } catch (e) {
      setError(e.message || 'Error al anular pago.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={16} /> Anular pago
          </h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--ink)' }}>
            Estas seguro de anular este pago?
          </p>

          <div className="rounded-lg p-3 text-xs space-y-1.5" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Monto</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>S/ {pago.monto.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Metodo</span>
              <span className="capitalize" style={{ color: 'var(--ink)' }}>{pago.metodo}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Fecha</span>
              <span style={{ color: 'var(--ink)' }}>{fmtFecha(pago.fecha_pago)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Tipo</span>
              <span className="capitalize" style={{ color: 'var(--ink)' }}>{pago.tipo}</span>
            </div>
            {pago.id_detalle && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Aplicado a</span>
                <span style={{ color: 'var(--ink)' }}>Item #{pago.id_detalle}</span>
              </div>
            )}
          </div>

          {(esDevolucionDeposito || esDeposito) && (
            <div className="px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'oklch(0.94 0.03 45)', color: 'var(--warning)' }}>
              {esDevolucionDeposito
                ? 'Al anular esta devolucion de garantia, la garantia disponible se restablecera automaticamente.'
                : 'Al anular este deposito, la garantia disponible disminuira.'}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
          )}

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
              Motivo <span style={{ color: 'var(--faint)' }}>(opcional)</span>
            </label>
            <input type="text" value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Pago duplicado, error de monto..."
              className="w-full h-8 px-2 rounded-lg text-xs border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--danger)] focus:border-transparent"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-lg text-xs font-medium transition-all duration-150"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}>
              Cancelar
            </button>
            <button onClick={handleConfirm} disabled={guardando}
              className="flex-1 h-9 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
              style={{ backgroundColor: 'var(--danger)', color: '#fff', border: 'none' }}>
              {guardando ? 'Anulando...' : 'Si, anular pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
