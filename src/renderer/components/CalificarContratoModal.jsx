import { useState, useEffect } from 'react';
import { X, Star } from 'lucide-react';
import StarRating from './StarRating';

export default function CalificarContratoModal({ idContrato, idCliente, onClose, onGuardado }) {
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(true);

  useEffect(() => {
    if (!window.api || !idContrato) { setCargandoDatos(false); return; }
    (async () => {
      try {
        const detalle = await window.api.getDetalleContrato(idContrato);
        if (detalle?.calificacion) {
          setEstrellas(detalle.calificacion.estrellas || 0);
          setComentario(detalle.calificacion.comentario || '');
        }
      } catch { /* silencioso */ }
      finally { setCargandoDatos(false); }
    })();
  }, [idContrato]);

  const guardar = async () => {
    if (estrellas === 0) {
      setError('Seleccione al menos 1 estrella');
      return;
    }
    if (!window.api) return;
    setGuardando(true);
    setError('');
    try {
      await window.api.guardarCalificacion(idContrato, estrellas, comentario.trim());
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Error al guardar calificación');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div
        className="m-auto w-[340px] rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Star size={14} style={{ color: 'oklch(0.62 0.17 80)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Calificar cliente</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface)] transition-colors" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>¿Qué tan satisfecho quedó con este cliente?</p>
            <div className="flex justify-center pt-1">
              <StarRating
                value={estrellas}
                onChange={setEstrellas}
                size={28}
              />
            </div>
            {estrellas > 0 && (
              <p className="text-[11px] font-medium" style={{ color: 'oklch(0.62 0.17 80)' }}>
                {['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'][estrellas]}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--muted)' }}>Comentario (opcional)</label>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Ej: Devolvió todo en buen estado, puntual..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-xs resize-none outline-none transition-colors duration-150 focus:ring-2"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)', focusRing: 'oklch(0.55 0.13 240)' }}
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-9 rounded-lg text-xs font-medium transition-all duration-150"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || cargandoDatos}
              className="flex-1 h-9 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
              style={{ backgroundColor: 'oklch(0.55 0.13 240)', color: '#fff', border: 'none' }}
            >
              {cargandoDatos ? 'Cargando...' : guardando ? 'Guardando...' : (estrellas > 0 ? 'Actualizar calificación' : 'Guardar calificación')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
