import { useState, useEffect } from 'react';
import { X, Loader2, ImageOff } from 'lucide-react';

/**
 * Visor de imagen de referencia (herramienta / material).
 * Props:
 *  - ruta: ruta absoluta del archivo (null si no hay imagen)
 *  - titulo: texto del encabezado
 *  - onClose: callback al cerrar
 */
export default function ImagenVisor({ ruta, titulo, onClose }) {
  const [src, setSrc] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(false);
    setSrc(null);

    if (!ruta) {
      setCargando(false);
      setError(true);
      return undefined;
    }

    window.api
      .leerImagen(ruta)
      .then((dataUrl) => {
        if (vivo) {
          setSrc(dataUrl);
          setCargando(false);
        }
      })
      .catch(() => {
        if (vivo) {
          setError(true);
          setCargando(false);
        }
      });

    return () => { vivo = false; };
  }, [ruta]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.78)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div
          className="flex items-center justify-between px-4 h-12 shrink-0"
          style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold truncate pr-2" style={{ color: 'var(--ink)' }}>
            {titulo || 'Imagen de referencia'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 shrink-0"
            style={{ color: 'var(--muted)' }}
            title="Cerrar (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div
          className="flex-1 min-h-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'oklch(0.17 0 0)' }}
        >
          {cargando && (
            <div className="flex flex-col items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={24} className="animate-spin" />
              <span className="text-xs">Cargando imagen...</span>
            </div>
          )}
          {!cargando && error && (
            <div className="flex flex-col items-center gap-2" style={{ color: 'var(--faint)' }}>
              <ImageOff size={26} />
              <span className="text-xs">Este ítem no tiene imagen de referencia.</span>
            </div>
          )}
          {!cargando && !error && src && (
            <img
              src={src}
              alt="Imagen de referencia"
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          )}
        </div>
      </div>
    </div>
  );
}
