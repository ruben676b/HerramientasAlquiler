import { useRef, useEffect, useState } from 'react';
import { PenLine, Check, Eraser, X } from 'lucide-react';

function recortarFirma(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (a > 0 && (r < 240 || g < 240 || b < 240)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pad = 8;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w, maxX + 1 + pad) - sx;
  const sh = Math.min(h, maxY + 1 + pad) - sy;
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

export default function SignaturePad({ value, onSave, onClear, disabled }) {
  const [open, setOpen] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const canvasRef = useRef(null);
  const padRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const SignaturePadLib = (await import('signature_pad')).default;
      if (cancelled || !canvasRef.current) return;
      const rect = canvasRef.current.parentElement.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvasRef.current.width = rect.width * ratio;
      canvasRef.current.height = rect.height * ratio;
      canvasRef.current.style.width = rect.width + 'px';
      canvasRef.current.style.height = rect.height + 'px';
      canvasRef.current.getContext('2d').scale(ratio, ratio);
      const pad = new SignaturePadLib(canvasRef.current, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });
      pad.addEventListener('endStroke', () => setIsEmpty(pad.isEmpty()));
      padRef.current = pad;
    })();
    return () => { cancelled = true; padRef.current = null; setIsEmpty(true); };
  }, [open]);

  const limpiar = () => {
    if (padRef.current) {
      padRef.current.clear();
      setIsEmpty(true);
    }
  };

  const confirmar = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const cropped = recortarFirma(canvasRef.current);
    if (!cropped) return;
    onSave(cropped);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div
        className="border rounded-lg bg-white flex items-center justify-center overflow-hidden"
        style={{ borderColor: 'var(--border)', height: 80 }}
      >
        {value ? (
          <img src={value} alt="Firma" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs" style={{ color: 'var(--faint)' }}>Sin firma</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          <PenLine size={14} /> Firmar
        </button>
        {value && onClear && (
          <button
            onClick={onClear}
            disabled={disabled}
            className="flex-1 h-8 rounded-lg text-xs font-medium border transition-colors duration-150 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
          >
            <Eraser size={13} /> Limpiar firma
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="m-auto w-[98vw] max-w-[1400px] h-[92vh] rounded-2xl p-6 flex flex-col"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Firmar</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 border rounded-xl overflow-hidden min-h-0" style={{ borderColor: 'var(--border)', backgroundColor: '#fff' }}>
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={limpiar}
                className="flex-1 h-12 rounded-xl text-base font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 inline-flex items-center justify-center gap-2"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
              >
                <Eraser size={18} /> Borrar
              </button>
              <button
                onClick={confirmar}
                disabled={isEmpty}
                className="flex-1 h-12 rounded-xl text-base font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                <Check size={18} /> Confirmar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 h-12 rounded-xl text-base font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}