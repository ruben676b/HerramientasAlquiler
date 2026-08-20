import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

/**
 * Ícono pequeño con tooltip (hover) y popover al hacer clic.
 * Siempre se renderiza. Si no hay texto, muestra "Sin descripción".
 * El popover usa posición fija para no recortarse en contenedores con scroll.
 */
export default function DescripcionPopover({ text, size = 13, className = '', width = 280 }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const onDocMouseDown = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setAbierto(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const displayText = (text && text.trim()) || null;

  const abrir = (e) => {
    e.stopPropagation();
    const r = btnRef.current.getBoundingClientRect();
    let left = r.left;
    if (left + width > window.innerWidth) left = Math.max(8, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 6, left });
    setAbierto((a) => !a);
  };

  return (
    <span className={'relative inline-flex shrink-0 ' + className}>
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        title={displayText || 'Sin descripción'}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); abrir(e); } }}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 transition-colors duration-150"
        style={{ color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
      >
        <Info size={size} />
      </span>
      {abierto && pos && (
        <span
          ref={popRef}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width,
            zIndex: 9999,
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            color: displayText ? 'var(--ink)' : 'var(--muted)',
            boxShadow: '0 4px 16px oklch(0 0 0 / 0.18)',
            fontStyle: displayText ? 'normal' : 'italic',
          }}
        >
          {displayText || 'Sin descripción'}
        </span>
      )}
    </span>
  );
}
