import { useState, useEffect } from 'react';
import { X, Tag, Check } from 'lucide-react';
import { useToast } from './Toast';
import { tagStyle } from './TagChip';

/**
 * EtiquetasClienteModal — asigna una o varias etiquetas a un cliente.
 * recibe el cliente (con su arreglo de etiquetas ya adjunto) y un onChanged
 * para refrescar los datos del padre tras guardar.
 */
export default function EtiquetasClienteModal({ open, onClose, cliente, onChanged }) {
  const toast = useToast();
  const [etiquetas, setEtiquetas] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open || !cliente) return;
    (async () => {
      setCargando(true);
      try {
        const todas = await window.api.getEtiquetas();
        setEtiquetas(todas);
        setSeleccion((cliente.etiquetas || []).map((t) => t.id));
      } catch (e) {
        toast(e.message || 'Error al cargar etiquetas', 'error');
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente]);

  const toggle = (id) => {
    setSeleccion((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await window.api.asignarEtiquetasCliente(cliente.id, seleccion);
      toast('Etiquetas actualizadas');
      onChanged?.();
      onClose();
    } catch (e) {
      toast(e.message || 'No se pudieron guardar las etiquetas', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!open || !cliente) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.12)' }}>
              <Tag size={14} style={{ color: 'oklch(0.55 0.08 240)' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>{cliente.nombre}</h2>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Etiquetas del cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 shrink-0" style={{ color: 'var(--muted)' }}><X size={15} /></button>
        </div>

        {cargando ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
        ) : etiquetas.length === 0 ? (
          <div className="py-8 text-center">
            <Tag size={24} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No hay etiquetas creadas.</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--faint)' }}>Cree etiquetas desde el botón "Etiquetas" de la sección Clientes.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {etiquetas.map((e) => {
              const s = tagStyle(e.color);
              const activa = seleccion.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 border"
                  style={{
                    backgroundColor: activa ? s.bg : 'var(--surface)',
                    borderColor: activa ? s.dot : 'var(--border)',
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activa ? s.dot : 'var(--faint)' }} />
                  <span className="flex-1 text-sm font-medium" style={{ color: activa ? s.color : 'var(--ink)' }}>{e.nombre}</span>
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{
                      backgroundColor: activa ? s.color : 'transparent',
                      border: activa ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {activa && <Check size={12} style={{ color: '#fff' }} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {etiquetas.length > 0 && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-9 rounded-lg text-sm font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)', opacity: guardando ? 0.6 : 1 }}
            >
              <Check size={14} /> Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
