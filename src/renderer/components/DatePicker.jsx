import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/* ================================================================
   DATEPICKER — Calendario clásico emergente (popup)
   La usuaria ve el día de la semana de un vistazo (vie 17, sáb 18).
   ================================================================ */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');
const aIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

export default function DatePicker({ value, onChange, error, compacto, amplio, min }) {
  const [abierto, setAbierto] = useState(false);
  const refBoton = useRef(null);
  const refPop = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const sel = parseIso(value);
  const hoy = new Date();
  const [vista, setVista] = useState(() => (sel ? { y: sel.y, m: sel.m } : { y: hoy.getFullYear(), m: hoy.getMonth() }));

  // La vista sigue al valor seleccionado cuando el popup está cerrado
  useEffect(() => {
    if (!abierto) {
      const s = parseIso(value);
      if (s) setVista({ y: s.y, m: s.m });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, abierto]);

  // Cerrar con clic fuera, Escape, scroll o resize
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e) => {
      if (refBoton.current?.contains(e.target) || refPop.current?.contains(e.target)) return;
      setAbierto(false);
    };
    const onKey = (e) => e.key === 'Escape' && setAbierto(false);
    const onScroll = () => setAbierto(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [abierto]);

  const abrir = () => {
    const r = refBoton.current.getBoundingClientRect();
    const popW = 272, popH = 344;
    let left = r.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 6);
    setPos({ top, left });
    setAbierto(true);
  };

  const minDate = min ? parseIso(min) : null;
  const deshabilitado = (d) => {
    if (!minDate) return false;
    const fecha = { y: vista.y, m: vista.m, d };
    if (fecha.y < minDate.y) return true;
    if (fecha.y === minDate.y && fecha.m < minDate.m) return true;
    if (fecha.y === minDate.y && fecha.m === minDate.m && fecha.d < minDate.d) return true;
    return false;
  };

  const elegir = (d) => {
    if (deshabilitado(d)) return;
    onChange(aIso(vista.y, vista.m, d));
    setAbierto(false);
  };

  const elegirHoy = () => {
    const hoyIso = aIso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (min && hoyIso < min) {
      onChange(min);
      setAbierto(false);
      return;
    }
    onChange(hoyIso);
    setAbierto(false);
  };

  const diasEnMes = new Date(vista.y, vista.m + 1, 0).getDate();
  const primerDia = (new Date(vista.y, vista.m, 1).getDay() + 6) % 7; // lunes = 0
  const celdas = [...Array(primerDia).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];
  const mesAnterior = () => setVista((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const mesSiguiente = () => setVista((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const wd = sel ? DIAS[new Date(sel.y, sel.m, sel.d).getDay()] : null;
  const etiqueta = sel
    ? compacto
      ? `${wd} ${sel.d} ${MESES[sel.m]}`
      : `${wd} ${sel.d} ${MESES[sel.m]} ${sel.y}`
    : 'Elegir fecha';
  const fechaLarga = sel ? `${DIAS_LARGOS[new Date(sel.y, sel.m, sel.d).getDay()]} ${sel.d} de ${MESES_LARGOS[sel.m]} de ${sel.y}` : '';

  return (
    <div className="relative inline-block">
      <button
        ref={refBoton}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={`inline-flex items-center gap-1.5 border font-mono rounded-lg transition-colors duration-150 ${
          compacto ? 'h-7 px-2 text-[10px]' : 'h-9 px-3 text-xs'
        } ${amplio ? 'w-full justify-between' : ''} ${
          abierto ? 'ring-2 ring-[var(--primary)]' : 'hover:border-[var(--primary)]'
        }`}
        style={{
          backgroundColor: 'var(--bg)',
          color: error ? 'var(--danger)' : 'var(--ink)',
          borderColor: error ? 'var(--danger)' : 'var(--border)',
          width: amplio ? undefined : compacto ? 118 : undefined,
        }}
      >
        <span className="truncate">{etiqueta}</span>
        <svg width={compacto ? 13 : 15} height={compacto ? 13 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }} className="shrink-0">
          <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
          <path d="M8 2.5v4M16 2.5v4M3 10.5h18" />
        </svg>
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            ref={refPop}
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="fixed z-[200] rounded-xl border p-3 select-none"
            style={{
              top: pos.top,
              left: pos.left,
              width: 272,
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            }}
          >
            {/* Cabecera: mes / año + navegación */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={mesAnterior}
                className="h-7 w-7 grid place-items-center rounded-lg border transition-colors hover:border-[var(--primary)]"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-xs font-semibold capitalize" style={{ color: 'var(--ink)' }}>
                {MESES_LARGOS[vista.m]} {vista.y}
              </span>
              <button
                type="button"
                onClick={mesSiguiente}
                className="h-7 w-7 grid place-items-center rounded-lg border transition-colors hover:border-[var(--primary)]"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>

            {/* Cabecera de días */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {SEMANA.map((d) => (
                <div key={d} className="h-6 grid place-items-center text-[10px] uppercase font-semibold" style={{ color: 'var(--faint)' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Rejilla de días */}
            <div className="grid grid-cols-7 gap-0.5">
              {celdas.map((d, i) => {
                if (d === null) return <div key={`b${i}`} className="h-8" />;
                const esSel = sel && sel.y === vista.y && sel.m === vista.m && sel.d === d;
                const esHoy = !esSel && vista.y === hoy.getFullYear() && vista.m === hoy.getMonth() && d === hoy.getDate();
                const esDeshabilitado = deshabilitado(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => elegir(d)}
                    disabled={esDeshabilitado}
                    className="h-8 rounded-lg text-xs grid place-items-center transition-all duration-100 hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    style={
                      esDeshabilitado
                        ? { color: 'var(--faint)', opacity: 0.35 }
                        : esSel
                          ? { backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600 }
                          : esHoy
                            ? { color: 'var(--ink)', border: '1px solid var(--primary)' }
                            : { color: 'var(--ink)' }
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Pie: fecha larga + botón Hoy */}
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] capitalize truncate" style={{ color: 'var(--muted)' }}>
                {fechaLarga || '—'}
              </span>
              <button
                type="button"
                onClick={elegirHoy}
                className="shrink-0 ml-2 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors hover:bg-[var(--bg)]"
                style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
              >
                Hoy
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
