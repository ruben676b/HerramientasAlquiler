import { useState, useRef, useEffect } from 'react';
import { ShoppingCart, X, Banknote, Smartphone, CreditCard, User, Tag, Hash, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

const METODOS = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: 'oklch(0.55 0.15 160)' },
  { id: 'yape', label: 'Yape', icon: Smartphone, color: 'oklch(0.50 0.18 300)' },
  { id: 'plin', label: 'Plin', icon: CreditCard, color: 'oklch(0.55 0.12 200)' },
];

export default function VentaModal({ open, onClose, onSuccess, item }) {
  const toast = useToast();
  
  // States
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [cliente, setCliente] = useState('');
  const [loading, setLoading] = useState(false);
  
  const isGranel = item && item.hasOwnProperty('cantidad_disponible');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && item) {
      setCantidad(1);
      setPrecio(item.precio_venta > 0 ? item.precio_venta.toString() : '');
      setMetodo('efectivo');
      setCliente('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, item]);

  if (!open || !item) return null;

  const handlePrecioChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+\.?\d{0,2}$/.test(val)) {
      setPrecio(val);
    }
  };

  const handleCantidadChange = (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) val = '';
    
    if (val !== '' && isGranel) {
       if (val > item.cantidad_disponible) val = item.cantidad_disponible;
       if (val < 1) val = 1;
    }
    setCantidad(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const valPrecio = parseFloat(precio);
    if (isNaN(valPrecio) || valPrecio < 0) {
      toast('Ingresa un precio unitario válido.', 'error');
      return;
    }

    const valCantidad = parseInt(cantidad, 10);
    if (isNaN(valCantidad) || valCantidad < 1) {
      toast('Ingresa una cantidad válida mayor a 0.', 'error');
      return;
    }

    if (isGranel && valCantidad > item.cantidad_disponible) {
      toast('No hay stock suficiente para esta venta.', 'error');
      return;
    }

    setLoading(true);
    try {
      const datosVenta = {
        tipo_item: isGranel ? 'granel' : 'individual',
        id_herramienta: isGranel ? null : item.id,
        id_item_granel: isGranel ? item.id : null,
        nombre_item: item.nombre,
        cantidad: valCantidad,
        precio_unitario: valPrecio,
        total: valPrecio * valCantidad,
        metodo,
        cliente_nombre: cliente.trim() || null
      };

      const res = await window.api.registrarVentaInventario(datosVenta);

      if (res && res.id_venta) {
        toast('Venta registrada correctamente', 'success');
        onSuccess?.();
        onClose();
      } else {
        toast('No se pudo registrar la venta', 'error');
      }
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const total = (parseFloat(precio || 0) * (parseInt(cantidad || 0, 10))).toFixed(2);

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
              style={{ backgroundColor: 'oklch(0.55 0.15 160 / 0.12)', color: 'oklch(0.55 0.15 160)' }}
            >
              <ShoppingCart size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                Registrar Venta
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {item.nombre}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Item Info Summary */}
          <div 
             className="p-3 rounded-xl flex justify-between items-center text-sm"
             style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
             <div>
                <div className="font-medium" style={{ color: 'var(--ink)' }}>{item.nombre}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                   {isGranel ? `Stock disp: ${item.cantidad_disponible}` : `ID: ${item.id}`}
                </div>
             </div>
             {isGranel && (
                <div className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}>
                   Granel
                </div>
             )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cantidad */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Cantidad
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  <Hash size={16} />
                </div>
                <input
                  type="number"
                  value={cantidad}
                  onChange={handleCantidadChange}
                  readOnly={!isGranel}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                  style={{
                    backgroundColor: isGranel ? 'var(--bg)' : 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: isGranel ? 'var(--ink)' : 'var(--text-muted)',
                    opacity: !isGranel ? 0.7 : 1
                  }}
                  required
                />
              </div>
            </div>

            {/* Precio Unitario */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Precio Unit. (S/)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  <Tag size={16} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={precio}
                  onChange={handlePrecioChange}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                  required
                />
              </div>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => {
                const isSelected = metodo === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodo(m.id)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border transition-all"
                    style={{
                      borderColor: isSelected ? m.color : 'var(--border)',
                      backgroundColor: isSelected ? `color-mix(in srgb, ${m.color} 8%, transparent)` : 'var(--surface)',
                    }}
                  >
                    <Icon size={20} style={{ color: isSelected ? m.color : 'var(--text-muted)' }} className="mb-1.5" />
                    <span
                      className="text-xs font-medium"
                      style={{ color: isSelected ? 'var(--ink)' : 'var(--text-muted)' }}
                    >
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cliente (Opcional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Cliente (Opcional)
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                <User size={16} />
              </div>
              <input
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Venta al público general"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                style={{
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full" style={{ backgroundColor: 'var(--border)' }}></div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total a cobrar</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>S/ {total}</p>
            </div>
            
            <button
              type="submit"
              disabled={loading || parseFloat(precio || 0) <= 0 || parseInt(cantidad || 0, 10) < 1}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              style={{
                backgroundColor: 'oklch(0.55 0.15 160)',
                color: 'white',
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Venta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
