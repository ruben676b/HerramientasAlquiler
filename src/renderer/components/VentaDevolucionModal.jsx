import { useState } from 'react';
import { ShoppingCart, X, Banknote, Smartphone, CreditCard, ShieldCheck, Plus, CheckCircle } from 'lucide-react';
import { useToast } from './Toast';

const METODOS = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: 'oklch(0.55 0.15 160)' },
  { id: 'yape', label: 'Yape', icon: Smartphone, color: 'oklch(0.50 0.18 300)' },
  { id: 'plin', label: 'Plin', icon: CreditCard, color: 'oklch(0.55 0.12 200)' },
];

export default function VentaDevolucionModal({ ventas, contrato, garantia, onClose, onConfirm }) {
  const toast = useToast();
  const totalVenta = ventas.reduce((sum, v) => sum + (v.monto || 0), 0);

  const [pagos, setPagos] = useState([]);
  const [metodoSel, setMetodoSel] = useState('efectivo');
  const [montoInput, setMontoInput] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const totalPagado = pagos.reduce((sum, p) => sum + p.monto, 0);
  const saldoPendiente = Math.max(0, totalVenta - totalPagado);
  const metodosDisponibles = garantia > 0
    ? [...METODOS, { id: 'garantia', label: 'Garantía', icon: ShieldCheck, color: 'oklch(0.53 0.135 55)' }]
    : METODOS;

  const agregarPago = () => {
    const m = parseFloat(montoInput);
    if (!m || m <= 0) { toast('Ingrese un monto válido', 'error'); return; }
    if (m > saldoPendiente + 0.01) { toast('El monto excede el saldo pendiente', 'error'); return; }
    if (metodoSel === 'garantia' && m > garantia) { toast('El monto excede la garantía disponible', 'error'); return; }
    setPagos(prev => [...prev, { metodo: metodoSel, monto: m, id: Date.now() }]);
    setMontoInput('');
  };

  const eliminarPago = (id) => {
    setPagos(prev => prev.filter(p => p.id !== id));
  };

  const seleccionarMetodo = (id) => {
    setMetodoSel(id);
    if (id === 'garantia' && garantia > 0) {
      const restante = Math.min(garantia, saldoPendiente);
      setMontoInput(restante > 0 ? String(restante) : '');
    }
  };

  const handleSubmit = async () => {
    if (saldoPendiente > 0.01) {
      setError('Falta por distribuir S/ ' + saldoPendiente.toFixed(2));
      return;
    }
    if (totalPagado <= 0) {
      setError('Debe agregar al menos un pago.');
      return;
    }

    setGuardando(true);
    setError('');
    try {
      await onConfirm(pagos);
    } catch (e) {
      setError(e.message || 'Error al procesar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.45)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: 'oklch(0.45 0.15 250)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Cobrar venta</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">

          {/* Items a vender */}
          <div className="rounded-xl p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--surface)' }}>
            {ventas.map((v, i) => (
              <div key={i} className="flex justify-between items-center">
                <span style={{ color: 'var(--ink)' }}>{v.item?.item_codigo} {v.item?.item_nombre || v.item?.nombre}</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>S/ {(v.monto || 0).toFixed(2)}</span>
              </div>
            ))}
            <hr style={{ borderColor: 'var(--border)', margin: '4px 0' }} />
            <div className="flex justify-between font-bold">
              <span style={{ color: 'var(--ink)' }}>Total a cobrar</span>
              <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {totalVenta.toFixed(2)}</span>
            </div>
            {garantia > 0 && (
              <div className="text-[10px] mt-1" style={{ color: 'var(--success)' }}>
                Garantía disponible: S/ {garantia.toFixed(2)}
              </div>
            )}
          </div>

          {/* Métodos como chips */}
          <div>
            <div className="flex gap-1 mb-1.5">
              {metodosDisponibles.map(m => {
                const sel = metodoSel === m.id;
                const Icon = m.icon;
                return (
                  <button key={m.id} onClick={() => seleccionarMetodo(m.id)}
                    className="flex-1 h-8 rounded-lg text-[10px] font-medium transition-all duration-150 flex items-center justify-center gap-1"
                    style={{
                      backgroundColor: sel ? m.color : 'var(--surface)',
                      color: sel ? '#fff' : 'var(--muted)',
                      border: sel ? 'none' : '0.5px solid var(--border)',
                    }}>
                    <Icon size={13} />
                    {m.label}
                  </button>
                );
              })}
            </div>
            {/* Input + botón agregar */}
            <div className="flex gap-1">
              <div className="flex-1 flex items-center gap-1 px-2 h-8 rounded-lg border"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>S/</span>
                <input type="number" step="0.01" min="0"
                  value={montoInput}
                  onChange={e => setMontoInput(e.target.value)}
                  placeholder={String(saldoPendiente > 0 ? saldoPendiente.toFixed(2) : '0.00')}
                  onKeyDown={e => { if (e.key === 'Enter') agregarPago(); }}
                  className="flex-1 h-full bg-transparent text-xs font-mono text-right outline-none"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              <button onClick={agregarPago} disabled={!montoInput || parseFloat(montoInput) <= 0}
                className="px-3 h-8 rounded-lg text-[10px] font-semibold transition-all duration-150 disabled:opacity-30 flex items-center gap-0.5"
                style={{ backgroundColor: 'var(--info)', color: '#fff', border: 'none' }}>
                <Plus size={12} /> Agregar
              </button>
            </div>
          </div>

          {/* Historial compacto */}
          {pagos.length > 0 && (
            <div className="rounded-xl p-2 text-xs space-y-0.5" style={{ backgroundColor: 'var(--surface)' }}>
              {pagos.map(p => {
                const m = metodosDisponibles.find(mm => mm.id === p.metodo);
                return (
                  <div key={p.id} className="flex items-center justify-between h-6 px-1 rounded hover:bg-black/5 group">
                    <div className="flex items-center gap-1.5">
                      {m && <m.icon size={11} style={{ color: m.color }} />}
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>{m?.label || p.metodo}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {p.monto.toFixed(2)}</span>
                      <button onClick={() => eliminarPago(p.id)}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--danger)' }}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <hr style={{ borderColor: 'var(--border)', margin: '2px 0' }} />
              <div className="flex justify-between items-center h-6 px-1">
                <span style={{ color: saldoPendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {saldoPendiente > 0 ? 'Pendiente' : 'Cubierto'}
                </span>
                <div className="flex items-center gap-1">
                  {saldoPendiente <= 0 && <CheckCircle size={12} style={{ color: 'var(--success)' }} />}
                  <span className="font-mono" style={{ color: saldoPendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {saldoPendiente > 0 ? 'S/ ' + saldoPendiente.toFixed(2) : 'S/ ' + totalPagado.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {/* Botón */}
          <button onClick={handleSubmit} disabled={guardando || saldoPendiente > 0.01}
            className="w-full h-9 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: 'oklch(0.45 0.15 250)', color: '#fff', border: 'none' }}>
            {guardando ? 'Procesando...' : 'Confirmar venta — S/ ' + totalVenta.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}