import { useState, useRef, useEffect } from 'react';
import { Banknote, ArrowRight, Loader2 } from 'lucide-react';

export default function CajaInicialModal({ onConfirm }) {
  const [monto, setMonto] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus the input on mount
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    // Allow empty, digits, and one decimal point with up to 2 decimals
    if (val === '' || /^\d+\.?\d{0,2}$/.test(val)) {
      setMonto(val);
    }
  };

  const handleConfirm = () => {
    const valor = parseFloat(monto) || 0;
    setLoading(true);
    // Small delay for visual feedback
    setTimeout(() => {
      onConfirm(valor);
    }, 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleConfirm();
    }
  };

  const montoNumerico = parseFloat(monto) || 0;

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '40px 36px',
        maxWidth: 420,
        width: '100%',
        animation: 'slideUp 0.35s ease-out',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            margin: '0 auto 14px',
            backgroundColor: 'oklch(0.55 0.15 160)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Banknote size={28} color="#fff" />
          </div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 4,
          }}>
            Apertura de Caja
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Ingresa el monto de efectivo con el que inicias el día
          </p>
        </div>

        {/* Input de monto */}
        <div style={{ marginBottom: 24 }}>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            marginBottom: 8,
            letterSpacing: '0.05em',
          }}>
            Monto inicial (efectivo)
          </p>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <span style={{
              position: 'absolute',
              left: 16,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--muted)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              S/
            </span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              style={{
                width: '100%',
                backgroundColor: 'var(--bg)',
                border: '1.5px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px 14px 48px',
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink)',
                outline: 'none',
                textTransform: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'oklch(0.55 0.15 160)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
              }}
            />
          </div>
          <p style={{
            fontSize: 11,
            color: 'var(--faint)',
            marginTop: 6,
            textAlign: 'center',
          }}>
            Puedes ingresar S/ 0.00 si no hay efectivo inicial
          </p>
        </div>

        {/* Preview */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderRadius: 10,
          backgroundColor: 'oklch(0.55 0.15 160 / 0.06)',
          border: '1px solid oklch(0.55 0.15 160 / 0.15)',
          marginBottom: 20,
        }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'oklch(0.55 0.15 160)',
          }}>
            Caja inicial del día
          </span>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: 'oklch(0.55 0.15 160)',
          }}>
            S/ {montoNumerico.toFixed(2)}
          </span>
        </div>

        {/* Botón confirmar */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 12,
            border: 'none',
            backgroundColor: 'oklch(0.55 0.15 160)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: loading ? 0.8 : 1,
            transition: 'opacity 0.15s ease, transform 0.1s ease',
          }}
          onMouseDown={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {loading ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 0.75s linear infinite' }} />
              Abriendo caja...
            </>
          ) : (
            <>
              <ArrowRight size={18} />
              Abrir caja
            </>
          )}
        </button>
      </div>
    </div>
  );
}
