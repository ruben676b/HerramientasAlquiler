import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from './Toast';

export default function PagoParcialModal({ contrato, onClose, onPagoRegistrado }) {
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const METODOS = [
    { id: 'efectivo', label: 'Efectivo', color: 'oklch(0.55 0.13 155)' },
    { id: 'yape', label: 'Yape', color: 'oklch(0.48 0.14 330)' },
    { id: 'plin', label: 'Plin', color: 'oklch(0.55 0.12 240)' },
  ];

  const dias = Math.max(1, Math.ceil(
    (new Date(contrato.fecha_devolucion_pactada + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);
  const diasEfectivos = dias + (contrato.dias_atraso || 0);
  const montoBase = (contrato.subtotal_diario || 0) * dias;
  const montoAtraso = (contrato.dias_atraso || 0) * (contrato.subtotal_diario || 0);
  const total = montoBase + montoAtraso + (contrato.deposito_monto || 0);
  const pagado = contrato.total_pagado || 0;
  const pendiente = Math.max(0, total - pagado);

  const handleSubmit = async () => {
    const m = parseFloat(monto);
    if (!m || m <= 0) return setError('Ingrese un monto válido.');
    if (m > pendiente) return setError('El monto excede el saldo pendiente (S/ ' + pendiente.toFixed(2) + ').');

    setGuardando(true);
    setError('');
    try {
      await window.api.registrarPago({
        idContrato: contrato.id,
        monto: m,
        metodo,
      });
      toast('Pago registrado: S/ ' + m.toFixed(2) + ' por ' + metodo);
      onPagoRegistrado();
    } catch (e) {
      setError(e.message || 'Error al registrar pago.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Pagar pendiente</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Resumen del contrato */}
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--surface)' }}>
            <p className="font-medium" style={{ color: 'var(--ink)' }}>{contrato.cliente_nombre}</p>
            <p style={{ color: 'var(--muted)' }}>Contrato #{contrato.id} &middot; {dias} d&iacute;a{dias !== 1 ? 's' : ''}</p>
            <hr style={{ borderColor: 'var(--border)', marginTop: 6, marginBottom: 4 }} />
            <div className="flex justify-between text-[12px]">
              <span style={{ color: 'var(--muted)' }}>Alquiler base ({dias} d&iacute;a{dias !== 1 ? 's' : ''})</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
            </div>
            {contrato.dias_atraso > 0 && (
              <div className="flex justify-between text-[12px]">
                <span style={{ color: 'var(--danger)' }}>Recargo atraso ({contrato.dias_atraso} d&iacute;a{contrato.dias_atraso !== 1 ? 's' : ''})</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {montoAtraso.toFixed(2)}</span>
              </div>
            )}
            <hr style={{ borderColor: 'var(--border)', marginTop: 2, marginBottom: 2 }} />
            <div className="flex justify-between text-[12px] font-semibold">
              <span style={{ color: 'var(--ink)' }}>Total a pagar</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: 'var(--muted)' }}>Pagado a la fecha</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {pagado.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
            <div className="flex justify-between font-bold">
              <span className="text-sm" style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
              <span className="font-mono tabular-nums text-sm" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {pendiente > 0 ? 'S/ ' + pendiente.toFixed(2) : 'Cancelado'}
              </span>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {pendiente > 0 && (
            <>
              {/* Metodo de pago */}
              <div>
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>M&eacute;todo de pago</label>
                <div className="flex gap-1">
                  {METODOS.map((m) => (
                    <button key={m.id} onClick={() => setMetodo(m.id)}
                      className="flex-1 h-9 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: metodo === m.id ? m.color : 'var(--surface)',
                        color: metodo === m.id ? '#fff' : 'var(--muted)',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto */}
              <div>
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Monto S/</label>
                <input type="number" step="0.01" min="0.01" max={pendiente}
                  value={monto}
                  placeholder={pendiente.toFixed(2)}
                  onChange={(e) => { setMonto(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--ink)',
                    borderColor: error ? 'var(--danger)' : 'var(--border)',
                  }}
                />
              </div>

              {/* Boton */}
              <button
                onClick={handleSubmit}
                disabled={guardando}
                className="w-full h-10 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'oklch(0.55 0.13 155)',
                  color: '#fff',
                  border: 'none',
                }}
                onMouseEnter={(e) => { if (!guardando) e.currentTarget.style.backgroundColor = 'oklch(0.45 0.13 155)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.55 0.13 155)'; }}
              >
                {guardando ? 'Pagando...' : 'Pagar pendiente \u2014 S/ ' + (parseFloat(monto) || pendiente).toFixed(2)}
              </button>
            </>
          )}

          {pendiente <= 0 && (
            <div className="text-center py-2">
              <p className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                Este contrato est&aacute; completamente cancelado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
