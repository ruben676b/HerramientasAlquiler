import { useState, useMemo } from 'react';
import { Lock, X, Banknote, Smartphone, CreditCard, TrendingUp, ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react';

const fmtMoneda = (v) => {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + 'S/ ' + Math.abs(n).toFixed(2);
};

export default function CierreCajaModal({ open, cajaInicial, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Load today's summary when modal opens
  useState(() => {
    if (open && window.api) {
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      window.api.getResumenCaja(fecha)
        .then(data => {
          setResumen(data);
          setCargando(false);
        })
        .catch(() => setCargando(false));
    }
  });

  const handleConfirm = () => {
    setLoading(true);
    setTimeout(() => onConfirm(), 300);
  };

  if (!open) return null;

  const efectivoIngresos = resumen?.totalesPorMetodo?.efectivo || 0;
  const totalEfectivoCaja = cajaInicial + efectivoIngresos;
  const totalMovimientos = resumen?.totalMovimientos || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          animation: 'slideUp 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 24px 16px',
          textAlign: 'center',
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            margin: '0 auto 12px',
            backgroundColor: 'oklch(0.52 0.20 25 / 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Lock size={22} style={{ color: 'oklch(0.52 0.20 25)' }} />
          </div>
          <h3 style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 4,
          }}>
            Cerrar caja del día
          </h3>
          <p style={{
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}>
            ¿Estás seguro de que deseas cerrar la caja y salir de la aplicación?
          </p>
        </div>

        {/* Summary */}
        {!cargando && resumen && (
          <div style={{ padding: '0 24px 16px' }}>
            <div style={{
              borderRadius: 12,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              backgroundColor: 'var(--surface)',
            }}>
              {/* Caja inicial */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Banknote size={13} />
                  Caja inicial
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--ink)' }}>
                  {fmtMoneda(cajaInicial)}
                </span>
              </div>

              {/* Ingresos efectivo */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowUpRight size={13} style={{ color: 'oklch(0.55 0.15 160)' }} />
                  Efectivo del día
                </span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: efectivoIngresos >= 0 ? 'oklch(0.55 0.15 160)' : 'oklch(0.52 0.20 25)',
                }}>
                  {efectivoIngresos >= 0 ? '+' : ''}{fmtMoneda(efectivoIngresos)}
                </span>
              </div>

              {/* Total */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                backgroundColor: 'oklch(0.53 0.135 55 / 0.06)',
              }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'oklch(0.53 0.135 55)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <TrendingUp size={13} />
                  Total en caja (efectivo)
                </span>
                <span style={{
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: 'oklch(0.53 0.135 55)',
                }}>
                  {fmtMoneda(totalEfectivoCaja)}
                </span>
              </div>
            </div>

            <p style={{
              fontSize: 11,
              color: 'var(--faint)',
              marginTop: 6,
              textAlign: 'center',
            }}>
              {totalMovimientos} movimiento{totalMovimientos !== 1 ? 's' : ''} registrado{totalMovimientos !== 1 ? 's' : ''} hoy
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 10,
          padding: '16px 24px 24px',
        }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            Seguir trabajando
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              border: 'none',
              backgroundColor: 'oklch(0.52 0.20 25)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: loading ? 0.8 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 0.75s linear infinite' }} />
                Cerrando...
              </>
            ) : (
              <>
                <Lock size={14} />
                Cerrar caja y salir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
