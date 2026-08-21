import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trash2, FileText, AlertTriangle, Inbox } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useToast } from './Toast';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fmtFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
};

export default function PapeleraModal({ open, onClose }) {
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [restaurando, setRestaurando] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const toast = useToast();

  const cargar = useCallback(async () => {
    if (!window.api) return;
    setCargando(true);
    setError(null);
    try {
      const res = await window.api.getContratos({ papelera: 1 });
      const lista = Array.isArray(res) ? res : res && res.contratos ? res.contratos : [];
      setContratos(lista);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (open) cargar();
  }, [open, cargar]);

  const handleRestaurar = async () => {
    if (!window.api || !restaurando) return;
    try {
      await window.api.restaurarContrato(restaurando.id);
      toast('Contrato #' + restaurando.id + ' restaurado exitosamente.');
      setRestaurando(null);
      cargar();
      window.dispatchEvent(new Event('contrato-creado'));
    } catch (e) {
      toast(e.message || 'Error al restaurar contrato', 'error');
    }
  };

  const handleEliminarPermanente = async () => {
    if (!window.api || !eliminando) return;
    try {
      await window.api.eliminarContratoPermanente(eliminando.id);
      toast('Contrato #' + eliminando.id + ' eliminado permanentemente.');
      setEliminando(null);
      cargar();
      window.dispatchEvent(new Event('contrato-creado'));
    } catch (e) {
      toast(e.message || 'Error al eliminar contrato', 'error');
    }
  };

  const diasRestantes = (c) => {
    if (!c.fecha_papelera) return 7;
    const fp = new Date(c.fecha_papelera.slice(0, 10) + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diff = Math.floor((hoy - fp) / 86400000);
    return Math.max(0, 7 - diff);
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'oklch(0.94 0.03 25)' }}>
                <Trash2 size={15} style={{ color: 'var(--danger)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>Papelera</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                  Los contratos se eliminan permanentemente despu&eacute;s de 7 d&iacute;as
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 shrink-0"
              style={{ color: 'var(--muted)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Contenido */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cargando ? (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
            ) : error ? (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)' }}>
                {error}
              </div>
            ) : contratos.length === 0 ? (
              <div className="py-16 text-center">
                <Inbox size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>La papelera est&aacute; vac&iacute;a</p>
              </div>
            ) : (
              contratos.map((c) => {
                const diasRest = diasRestantes(c);
                const dias = Math.max(1, Math.ceil(
                  (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
                ) + 1);
                const montoBase = c.total_contrato ? c.total_contrato : (c.subtotal_diario || 0) * dias;
                const total = montoBase + (c.total_atraso || 0) + (c.total_danos || 0) + (c.total_perdidas || 0) + (c.total_ventas || 0);

                return (
                  <div
                    key={c.id}
                    className="rounded-xl p-3.5"
                    style={{ backgroundColor: 'var(--surface)', border: '0.5px solid var(--border)', borderLeft: '3px solid oklch(0.40 0.12 25)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</p>
                          <span className="text-[11px] shrink-0 font-mono font-semibold" style={{ color: 'var(--muted)' }}>
                            #{c.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-[10px] text-[11px] font-mono font-semibold"
                            style={{ backgroundColor: 'oklch(0.50 0.13 240)', color: '#fff' }}>
                            DNI {c.cliente_dni}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)' }}>
                            {fmtFecha(c.fecha_salida)} &mdash; {fmtFecha(c.fecha_devolucion_pactada)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] text-[11px] font-medium"
                            style={{ backgroundColor: 'oklch(0.93 0.02 25)', color: 'var(--danger)' }}>
                            <AlertTriangle size={11} />
                            {diasRest} d&iacute;a{diasRest !== 1 ? 's' : ''} restante{diasRest !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {c.motivo_eliminacion && (
                          <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
                            Motivo: {c.motivo_eliminacion}
                          </p>
                        )}
                      </div>
                      <span className="text-[15px] font-medium shrink-0" style={{ color: 'var(--ink)' }}>
                        S/ {total.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-2.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <button
                        onClick={async () => {
                          if (!window.api) return;
                          try {
                            const pdfPath = await window.api.generarContratoPdf(c.id);
                            const b64 = await window.api.leerArchivoBase64(pdfPath);
                            const url = 'data:application/pdf;base64,' + b64;
                            window.open(url, '_blank');
                          } catch (e) {
                            toast('Error al abrir contrato', 'error');
                          }
                        }}
                        className="flex-1 h-[32px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
                      >
                        <FileText size={12} /> Ver contrato
                      </button>
                      <button
                        onClick={() => setRestaurando(c)}
                        className="flex-1 h-[32px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                        style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}
                      >
                        <RotateCcw size={12} /> Restaurar
                      </button>
                      <button
                        onClick={() => setEliminando(c)}
                        className="h-[32px] px-3 rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                        style={{ backgroundColor: 'oklch(0.97 0.02 25)', color: 'var(--danger)', border: '0.5px solid oklch(0.85 0.08 25)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.94 0.04 25)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.97 0.02 25)'; }}
                        title="Eliminar permanentemente"
                      >
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {restaurando && (
        <ConfirmModal
          open={!!restaurando}
          title="Restaurar contrato"
          message={`Desea restaurar el contrato #${restaurando.id} desde la papelera? Las herramientas volveran al estado que tenian.`}
          confirmLabel="Restaurar"
          onConfirm={handleRestaurar}
          onCancel={() => setRestaurando(null)}
        />
      )}

      {eliminando && (
        <ConfirmModal
          open={!!eliminando}
          title="Eliminar permanentemente"
          message={`¿Eliminar el contrato #${eliminando.id} de forma permanente? Se borrarán también sus pagos, detalles y daños asociados. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar para siempre"
          danger
          onConfirm={handleEliminarPermanente}
          onCancel={() => setEliminando(null)}
        />
      )}
    </>
  );
}