import { useState, useRef, useEffect } from 'react';
import { MinusCircle, X, Banknote, Smartphone, CreditCard, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

const METODOS = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: 'oklch(0.55 0.15 160)' },
  { id: 'yape', label: 'Yape', icon: Smartphone, color: 'oklch(0.50 0.18 300)' },
  { id: 'plin', label: 'Plin', icon: CreditCard, color: 'oklch(0.55 0.12 200)' },
];

export default function NuevoEgresoModal({ open, onClose, onSuccess }) {
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMonto('');
      setDescripcion('');
      setMetodo('efectivo');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  if (!open) return null;

  const handleMontoChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+\.?\d{0,2}$/.test(val)) {
      setMonto(val);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valMonto = parseFloat(monto);
    if (!valMonto || valMonto <= 0) {
      toast('Ingresa un monto válido mayor a 0', 'error');
      return;
    }
    if (!descripcion.trim()) {
      toast('Ingresa la descripción del egreso', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await window.api.registrarEgresoCaja({
        monto: valMonto,
        descripcion: descripcion.trim(),
        metodo,
      });

      if (res && res.success) {
        toast('Egreso registrado correctamente', 'success');
        onSuccess?.();
        onClose();
      } else {
        toast('No se pudo registrar el egreso', 'error');
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
              <MinusCircle size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                Registrar Egreso
              </h3>
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                Salida de dinero de caja
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Monto */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
              Monto del egreso <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-base font-bold font-mono" style={{ color: 'var(--muted)' }}>
                S/
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={handleMontoChange}
                placeholder="0.00"
                className="w-full pl-11 pr-4 py-2.5 text-lg font-bold font-mono rounded-xl outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  color: 'oklch(0.52 0.20 25)',
                }}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
              Descripción / Motivo <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Pago de flete, compra de cinta, gastos de limpieza..."
              className="w-full p-3 text-[13px] rounded-xl outline-none transition-colors resize-none"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1.5px solid var(--border)',
                color: 'var(--ink)',
              }}
            />
          </div>

          {/* Método de pago */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
              Método de salida
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => {
                const Icon = m.icon;
                const selected = metodo === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodo(m.id)}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all"
                    style={{
                      backgroundColor: selected ? `${m.color}15` : 'var(--surface)',
                      borderColor: selected ? m.color : 'var(--border)',
                      color: selected ? m.color : 'var(--muted)',
                    }}
                  >
                    <Icon size={18} className="mb-1" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-2">
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
                  Guardando...
                </>
              ) : (
                'Registrar Egreso'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
