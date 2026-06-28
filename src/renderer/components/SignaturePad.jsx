import { useRef, useEffect, useState } from 'react';

export default function SignaturePad({ onSave, disabled }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const initPad = async () => {
      const SignaturePadLib = (await import('signature_pad')).default;
      if (canvasRef.current) {
        padRef.current = new SignaturePadLib(canvasRef.current, {
          backgroundColor: 'rgb(255, 255, 255)',
          penColor: 'rgb(0, 0, 0)',
        });
        padRef.current.addEventListener('endStroke', () => {
          setIsEmpty(padRef.current.isEmpty());
        });
      }
    };

    // Ajustar tamaño del canvas
    const resize = () => {
      if (!canvasRef.current) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvasRef.current.parentElement.getBoundingClientRect();
      canvasRef.current.width = rect.width * ratio;
      canvasRef.current.height = rect.height * ratio;
      canvasRef.current.style.width = rect.width + 'px';
      canvasRef.current.style.height = rect.height + 'px';
      const ctx = canvasRef.current.getContext('2d');
      ctx.scale(ratio, ratio);
      if (padRef.current) padRef.current.clear();
    };

    resize();
    initPad();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const limpiar = () => {
    if (padRef.current) {
      padRef.current.clear();
      setIsEmpty(true);
    }
  };

  const guardar = () => {
    if (padRef.current && !padRef.current.isEmpty()) {
      const dataUrl = padRef.current.toDataURL();
      onSave(dataUrl);
    }
  };

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: '#fff', height: 120 }}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={limpiar}
          disabled={disabled}
          className="flex-1 h-8 rounded-lg text-xs font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
          style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
        >Limpiar</button>
        <button
          onClick={guardar}
          disabled={disabled || isEmpty}
          className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
          style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
        >Guardar firma</button>
      </div>
    </div>
  );
}
