import { useState, useEffect } from 'react';
import { X, Loader2, Undo2, Banknote, Smartphone, CreditCard, PackageX } from 'lucide-react';
import { useToast } from './Toast';
import DevolverVentaModal from './DevolverVentaModal';

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

const fmtHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

/**
 * Modal que lista las ventas devolvibles de un material a granel.
 * Cada venta permite devolución parcial vía DevolverVentaModal.
 * @param {object} data - variante de granel (id, nombre)
 */
export default function VentasGranelModal({ data, open, onClose, onDevuelto }) {
  const toast = useToast();
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ventaSel, setVentaSel] = useState(null);

  const cargar = async () => {
    if (!open || !data?.id) return;
    setCargando(true);
    try {
      const lista = await window.api.getVentasInventario({ id_item_granel: data.id, soloDevolvibles: true });
      setVentas(lista || []);
    } catch (e) {
      toast('Error al cargar ventas: ' + e.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [open, data?.id]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'oklch(0 0 0 / 0.45)' }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl"
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
                style={{ backgroundColor: 'oklch(0.50 0.18 300 / 0.12)', color: 'oklch(0.50 0.18 300)' }}
              >
                <Undo2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Devolver ventas — {data?.nombre}
                </h3>
                <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                  Elige la venta a devolver (puede ser parcial)
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

          {/* Lista de ventas */}
          <div className="p-4 max-h-[50vh] overflow-y-auto">
            {cargando ? (
              <div className="flex items-center justify-center py-10" style={{ color: 'var(--muted)' }}>
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : ventas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center" style={{ color: 'var(--muted)' }}>
                <PackageX size={28} className="mb-2" style={{ color: 'var(--faint)' }} />
                <p className="text-[13px]">No hay ventas por devolver de este material.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ventas.map((v) => {
                  const MetodoIcon = METODO_ICON[v.metodo] || Banknote;
                  const metodoColor = METODO_COLOR[v.metodo] || 'var(--muted)';
                  const devolvable = v.cantidad_devolvable;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {v.cantidad} × {v.nombre_item}
                        </p>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                          <span>{fmtHora(v.fecha)}</span>
                          <span>·</span>
                          <MetodoIcon size={12} style={{ color: metodoColor }} />
                          <span>{METODO_LABEL[v.metodo] || v.metodo}</span>
                          <span>·</span>
                          <span className="font-mono font-semibold">{fmtMoneda(v.total)}</span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
                          Por devolver: {devolvable} de {v.cantidad}
                        </p>
                      </div>
                      <button
                        onClick={() => setVentaSel(v)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-85"
                        style={{ backgroundColor: 'oklch(0.52 0.20 25 / 0.1)', color: 'oklch(0.52 0.20 25)' }}
                      >
                        <Undo2 size={13} />
                        Devolver
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de devolución de la venta seleccionada */}
      <DevolverVentaModal
        venta={ventaSel}
        open={!!ventaSel}
        onClose={() => setVentaSel(null)}
        onSuccess={() => {
          cargar();
          onDevuelto?.();
        }}
      />
    </>
  );
}
