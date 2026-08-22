import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, ImageOff } from 'lucide-react';
import { cn } from '../lib/utils';
import ImagenVisor from './ImagenVisor';

/**
 * Icono de ojo que muestra una vista previa flotante de la imagen
 * de referencia al pasar el cursor (sin necesidad de hacer clic).
 * Al hacer clic se amplía la imagen en el visor grande (ImagenVisor).
 * El panel se renderiza vía portal en document.body con posicionamiento
 * fijo anclado al ícono, para que ningún contenedor con overflow oculto
 * ni contexto de apilamiento lo recorte o lo tape.
 *
 * El botón usa preventDefault en mousedown para no robarle el foco al
 * input del buscador: las sugerencias no se cierran al interactuar.
 *
 * Props:
 *  - ruta:     ruta directa de la imagen (opcional si se usa tipo/id)
 *  - tipo:     'herramienta' | 'granel' para resolver la ruta vía getImagenItem
 *  - id:       identificador del ítem según tipo
 *  - titulo:   texto mostrado bajo la imagen y en el visor ampliado
 *  - activo:   false atenúa el icono y nunca abre el panel ni el visor
 *  - lado:     'izquierda' | 'derecha' | 'abajo' — hacia dónde abre el panel
 *  - variante: 'icono' (ícono simple) | 'boton' (cuadro con borde)
 */
export default function OjoPreview({
  ruta,
  tipo,
  id,
  titulo,
  activo = true,
  lado = 'izquierda',
  variante = 'icono',
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [src, setSrc] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [sinImagen, setSinImagen] = useState(false);
  const [ampliar, setAmpliar] = useState(false);
  const [rutaAmpliar, setRutaAmpliar] = useState(null);
  const timerRef = useRef(null);
  const btnRef = useRef(null);
  const rutaCacheRef = useRef(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Invalida la caché si cambian los datos del ítem
  useEffect(() => {
    rutaCacheRef.current = undefined;
  }, [ruta, tipo, id]);

  // Resuelve la ruta de la imagen una sola vez por ítem
  const resolverRuta = async () => {
    if (rutaCacheRef.current !== undefined) return rutaCacheRef.current;
    let rutaFinal = ruta ?? null;
    if (!rutaFinal && tipo && id != null) {
      try {
        const r = await window.api.getImagenItem(tipo, id);
        rutaFinal = r?.ruta || null;
      } catch { rutaFinal = null; }
    }
    rutaCacheRef.current = rutaFinal;
    return rutaFinal;
  };

  useEffect(() => {
    if (!abierto) { setSrc(null); setCargando(false); setSinImagen(false); return; }
    let vivo = true;

    (async () => {
      setCargando(true);
      const rutaFinal = await resolverRuta();
      if (!vivo) return;
      if (!rutaFinal) { setSinImagen(true); setCargando(false); return; }

      try {
        const dataUrl = await window.api.leerImagen(rutaFinal);
        if (vivo) setSrc(dataUrl);
      } catch {
        if (vivo) setSinImagen(true);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [abierto, ruta, tipo, id]);

  if (!activo) {
    return (
      <span
        className="inline-flex items-center justify-center p-1 rounded-md opacity-30 shrink-0"
        style={{ color: 'var(--faint)' }}
        title="Este ítem no tiene imagen"
      >
        <Eye size={13} />
      </span>
    );
  }

  const entrar = () => {
    clearTimeout(timerRef.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      if (lado === 'derecha') setPos({ top: r.top + r.height / 2, left: r.right });
      else if (lado === 'abajo') setPos({ top: r.bottom, left: r.left + r.width / 2 });
      else setPos({ top: r.top + r.height / 2, left: r.left });
    }
    setAbierto(true);
  };
  const salir = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAbierto(false), 120);
  };

  const abrirVisor = async (e) => {
    e.stopPropagation();
    const rutaFinal = await resolverRuta();
    setRutaAmpliar(rutaFinal);
    setAmpliar(true);
  };

  const transform = lado === 'derecha'
    ? 'translate(0, -50%)'
    : lado === 'abajo'
      ? 'translate(-50%, 0)'
      : 'translate(-100%, -50%)';

  return (
    <>
      <span className="relative inline-flex shrink-0" onMouseEnter={entrar} onMouseLeave={salir}>
        <button
          ref={btnRef}
          type="button"
          tabIndex={-1}
          aria-label="Ver imagen de referencia"
          onClick={(e) => { e.stopPropagation(); abrirVisor(e); }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={cn(
            variante === 'boton'
              ? 'h-10 w-10 flex items-center justify-center rounded-lg border transition-all duration-150 active:scale-95'
              : 'p-1 rounded-md transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 active:scale-90',
          )}
          style={
            variante === 'boton'
              ? { color: 'var(--muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }
              : { color: 'var(--muted)' }
          }
        >
          <Eye size={variante === 'boton' ? 15 : 13} />
        </button>

        {abierto && createPortal(
          <div
            className="fixed z-[95]"
            style={{ top: pos.top, left: pos.left, transform }}
            onMouseEnter={entrar}
            onMouseLeave={salir}
          >
            <div
              className="rounded-lg overflow-hidden shadow-xl"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <div className="w-[240px] h-[180px] flex items-center justify-center" style={{ backgroundColor: 'oklch(0.17 0 0)' }}>
                {cargando && <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />}
                {!cargando && sinImagen && (
                  <div className="flex flex-col items-center gap-1.5" style={{ color: 'oklch(0.60 0 0)' }}>
                    <ImageOff size={20} />
                    <span className="text-[11px]">Sin imagen de referencia</span>
                  </div>
                )}
                {!cargando && !sinImagen && src && (
                  <img src={src} alt="Imagen de referencia" className="max-w-full max-h-full object-contain" />
                )}
              </div>
              {titulo && (
                <div className="px-2.5 py-1.5 text-[11px] font-medium truncate" style={{ color: 'var(--ink)', borderTop: '1px solid var(--border)' }}>
                  {titulo}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </span>

      {ampliar && createPortal(
        <ImagenVisor ruta={rutaAmpliar} titulo={titulo} onClose={() => setAmpliar(false)} />,
        document.body,
      )}
    </>
  );
}
