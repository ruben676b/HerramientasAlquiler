import { useState, useRef, useEffect } from 'react';
import { Undo2, X, Banknote, Smartphone, CreditCard, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

const METODO_LABEL = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin' };
const METODO_ICON = { efectivo: Banknote, yape: Smartphone, plin: CreditCard };
const METODO_COLOR = {
  efectivo: 'oklch(0.55 0.15 160)',
  yape: 'oklch(0.50 0.18 300)',
  plin: 'oklch(0.55 0.12 200)',
};

const fmtMoneda = (v) => {
  const n = Number(v) || 0;
  return 'S/ ' + n.toFixed(2);
};

/**
 * Modal para devolver (anular) una venta de inventario.
 * Individual → devolución completa (cantidad fija 1).
 * Granel → devolución parcial con selector de unidades.
 * El reembolso sale del mismo método de pago con que se cobró.
 * @param {object} venta - { id_venta, tipo_item, cantidad, cantidad_devolvable, precio_unitario, notas, metodo, monto, nombre_item? }
 */
export default function DevolverVentaModal({ venta, open, onClose, onSuccess }) {
  const toast = useToast();
  const [cantidad, setCantidad] = useState('1');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && venta) {
      setCantidad('1');
      setLoading(false);
      setTimeout(() => inputRef.current?.select?.(), 120);
    }
  }, [open, venta]);

  if (!open || !venta) return null;

  const esGranel = venta.tipo_item === 'granel';
  const maxDevolver = Math.max(1, Number(venta.cantidad_devolvable) || 1);
  const cant = Math.min(Math.max(parseInt(cantidad, 10) || 0, 1), maxDevolver);
  const montoReembolso = cant * (Number(venta.precio_unitario) || 0);
  const MetodoIcon = METODO_ICON[venta.metodo] || Banknote;
  const metodoColor = METODO_COLOR[venta.metodo] || 'var(--muted)';

  const idVenta = venta.id_venta || venta.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await window.api.anularVentaInventario(idVenta, cant);
      if (res && res.id_venta) {
        toast('Venta devuelta y reembolso registrado', 'success');
        onSuccess?.();
        onClose();
      } else {
        toast('No se pudo devolver la venta', 'error');
      }
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          animation: 'slideUp 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'oklch(0.52 0.20 25 / 0.12)', color: 'oklch(0.52 0.20 25)' }}
            >
              <Undo2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                Devolver Venta
              </h3>
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                Reembolso por el mismo método de pago
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Resumen de la venta */}
          <div
            className="rounded-xl p-3.5 space-y-1.5"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
              {venta.notas || venta.nombre_item || 'Venta #' + venta.id_venta}
            </p>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
              <MetodoIcon size={13} style={{ color: metodoColor }} />
              <span>Se cobró por {METODO_LABEL[venta.metodo] || venta.metodo}</span>
              <span>·</span>
              <span className="font-mono">venta #{venta.id_venta}</span>
            </div>
            {esGranel && (
              <p className="text-[12px]" style={{ color: 'var(--faint)' }}>
                Por devolver: {maxDevolver} de {venta.cantidad} unidad{venta.cantidad !== 1 ? 'es' : ''}
              </p>
            )}
          </div>

          {/* Cantidad (solo granel) */}
          {esGranel && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
                Cantidad a devolver <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                ref={inputRef}
                type="number"
                min={1}
                max={maxDevolver}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full px-4 py-2.5 text-lg font-bold font-mono rounded-xl outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  color: 'var(--ink)',
                }}
              />
              <p className="text-[12px] mt-1.5" style={{ color: 'var(--faint)' }}>
                Máximo devolvable: {maxDevolver}
              </p>
            </div>
          )}

          {/* Monto del reembolso */}
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ backgroundColor: 'oklch(0.52 0.20 25 / 0.06)' }}
          >
            <span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>
              Monto a reembolsar
            </span>
            <span className="text-[17px] font-extrabold font-mono" style={{ color: 'oklch(0.52 0.20 25)' }}>
              {fmtMoneda(montoReembolso)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity"
              style={{
                backgroundColor: 'oklch(0.52 0.20 25)',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Devolviendo...
                </>
              ) : (
                'Confirmar Devolución'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
