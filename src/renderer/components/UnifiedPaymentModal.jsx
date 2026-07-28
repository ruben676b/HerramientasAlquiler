import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from './Toast';

export default function UnifiedPaymentModal({ tipo, contrato, item, itemPendiente, onClose, onConfirm }) {
  const toast = useToast();
  const isItem = tipo === 'item';
  const garantia = contrato.garantia_retenida || 0;
  const pendiente = isItem ? (itemPendiente || 0) : Math.max(0, (contrato.total_pagado ? 0 : 0));

  // Recalcular pendiente para modo total
  let total, pagado, saldoPendiente;
  if (!isItem) {
    const dias = Math.max(1, Math.ceil(
      (new Date(contrato.fecha_devolucion_pactada + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
    ) + 1);
    const montoBase = contrato.total_contrato ? contrato.total_contrato : ((contrato.subtotal_diario || 0) * dias);
    const montoAtraso = contrato.total_atraso || 0;
    total = montoBase + montoAtraso + (contrato.deposito_monto || 0);
    pagado = contrato.total_pagado || 0;
    saldoPendiente = Math.max(0, total - pagado);
  }

  const montoMaximo = isItem ? pendiente : saldoPendiente;

  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const METODOS = [
    { id: 'efectivo', label: 'Efectivo', color: 'oklch(0.55 0.13 155)' },
    { id: 'yape', label: 'Yape', color: 'oklch(0.48 0.14 330)' },
    { id: 'plin', label: 'Plin', color: 'oklch(0.55 0.12 240)' },
  ];
  if (garantia > 0) {
    METODOS.push({ id: 'garantia', label: 'Garant\u00eda (S/ ' + garantia.toFixed(0) + ')', color: 'oklch(0.53 0.135 55)' });
  }

  const handleSubmit = async () => {
    const m = parseFloat(monto);
    if (!m || m <= 0) return setError('Ingrese un monto válido.');
    if (m > montoMaximo) return setError('El monto excede (' + montoMaximo.toFixed(2) + ').');

    setGuardando(true);
    setError('');
    try {
      const esGarantia = metodo === 'garantia';
      await window.api.registrarPago({
        idContrato: contrato.id,
        monto: m,
        metodo: esGarantia ? 'efectivo' : metodo,
        tipo: esGarantia ? 'devolucion_deposito' : undefined,
      });
      toast('Pago registrado: S/ ' + m.toFixed(2) + (esGarantia ? ' (descontado de garantía)' : ' por ' + metodo));
      onConfirm();
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
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {isItem ? 'Cobrar herramienta' : 'Pagar pendiente'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Resumen dinámico según tipo */}
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--surface)' }}>
            {isItem ? (
              <>
                <p className="font-medium" style={{ color: 'var(--ink)' }}>
                  [{item?.item_codigo || item?.id || '—'}] {item?.item_nombre || item?.nombre}
                </p>
                <p style={{ color: 'var(--muted)' }}>S/ {(item?.precio_dia_aplicado || 0).toFixed(2)}/día</p>
                <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 4 }} />
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Base ({item?.dias_item || 0} d&iacute;a{(item?.dias_item || 0) !== 1 ? 's' : ''})</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>
                    S/ {((item?.precio_dia_aplicado || 0) * (item?.dias_item || 1) * (item?.cantidad || 1)).toFixed(2)}
                  </span>
                </div>
                {(item?.dias_atraso_item || 0) > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--danger)' }}>Mora ({item.dias_atraso_item} d&iacute;a{item.dias_atraso_item !== 1 ? 's' : ''})</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {(item?.monto_atraso_item || 0).toFixed(2)}</span>
                  </div>
                )}
                <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
                <div className="flex justify-between font-semibold">
                  <span style={{ color: 'var(--ink)' }}>Total a cobrar</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {pendiente.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
                <p className="font-medium" style={{ color: 'var(--ink)' }}>{contrato.cliente_nombre}</p>
                <p style={{ color: 'var(--muted)' }}>Contrato #{contrato.id}</p>
                <hr style={{ borderColor: 'var(--border)', marginTop: 6, marginBottom: 4 }} />
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Total a pagar</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Pagado a la fecha</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {pagado.toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
                <div className="flex justify-between font-bold">
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
                  <span className="font-mono tabular-nums text-sm" style={{ color: saldoPendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    S/ {saldoPendiente.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
          )}

          {montoMaximo > 0 && (
            <>
              {/* Garantía info */}
              {garantia > 0 && (
                <div className="flex justify-between text-[11px] px-1">
                  <span style={{ color: 'var(--muted)' }}>Garant&iacute;a disponible</span>
                  <span className="font-mono" style={{ color: 'var(--info)' }}>S/ {garantia.toFixed(2)}</span>
                </div>
              )}
              {/* Método de pago */}
              <div>
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>M&eacute;todo de pago</label>
                <div className="flex gap-1">
                  {METODOS.map((m) => (
                    <button key={m.id} onClick={() => { setMetodo(m.id); if (m.id === 'garantia') setMonto(Math.min(montoMaximo, garantia).toFixed(2)); }}
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
                <input type="number" step="0.01" min="0.01" max={montoMaximo}
                  value={monto}
                  placeholder={montoMaximo.toFixed(2)}
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

              {/* Botón */}
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
                {guardando ? 'Procesando...' : 'Pagar \u2014 S/ ' + (parseFloat(monto) || montoMaximo).toFixed(2)}
              </button>
            </>
          )}

          {montoMaximo <= 0 && (
            <div className="text-center py-2">
              <p className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                {isItem ? 'Esta herramienta no tiene deuda pendiente' : 'Este contrato est\u00e1 completamente cancelado'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
