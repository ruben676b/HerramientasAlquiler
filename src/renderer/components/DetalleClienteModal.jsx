import { useState, useEffect } from 'react';
import { X, Star, Package, Phone, CreditCard, Calendar, User, AlertTriangle } from 'lucide-react';
import StarRating, { CalificacionBadge } from './StarRating';
import DetalleAlquilerModal from './DetalleAlquilerModal';

const ESTADO_STYLES = {
  'alquilado': { bg: 'oklch(0.93 0.04 240)', color: 'oklch(0.45 0.10 240)' },
  'reservado': { bg: 'oklch(0.93 0.04 280)', color: 'oklch(0.45 0.10 280)' },
  'atrasado': { bg: 'oklch(0.93 0.04 25)', color: 'oklch(0.45 0.18 25)' },
  'devuelto': { bg: 'oklch(0.93 0.06 160)', color: 'oklch(0.40 0.12 160)' },
  'devolución incompleta': { bg: 'oklch(0.93 0.05 80)', color: 'oklch(0.50 0.13 80)' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Icon size={11} style={{ color: 'var(--muted)' }} />
      <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-[11px] font-bold font-mono" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function ContratoItem({ contrato, onClick }) {
  const estadoStyle = ESTADO_STYLES[contrato.estado] || ESTADO_STYLES['alquilado'];

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-xl transition-all duration-150 group border"
      style={{
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px oklch(0 0 0 / 0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar size={12} style={{ color: 'var(--muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
              {formatDate(contrato.fecha_salida)}
            </span>
          </div>

          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color }}
          >
            {contrato.estado}
          </span>

          <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>
            {contrato.total_items} item{contrato.total_items !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {contrato.estrellas ? (
            <div className="flex items-center gap-1">
              <StarRating value={contrato.estrellas} readonly size={11} />
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--faint)' }}>Sin calificar</span>
          )}
        </div>
      </div>

      {contrato.calificacion_comentario && (
        <p className="text-[10px] mt-1.5 truncate italic" style={{ color: 'var(--muted)' }}>
          "{contrato.calificacion_comentario}"
        </p>
      )}
    </button>
  );
}

export default function DetalleClienteModal({ cliente, onClose }) {
  const [contratos, setContratos] = useState([]);
  const [loadingContratos, setLoadingContratos] = useState(true);
  const [detalleContrato, setDetalleContrato] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  useEffect(() => {
    if (!window.api || !cliente?.id) { setLoadingContratos(false); return; }
    (async () => {
      try {
        const data = await window.api.getContratosCliente(cliente.id);
        setContratos(data);
      } catch {
        /* silencioso */
      } finally {
        setLoadingContratos(false);
      }
    })();
  }, [cliente?.id]);

  const abrirDetalle = async (idContrato) => {
    if (!window.api) return;
    setLoadingDetalle(true);
    try {
      const data = await window.api.getDetalleContrato(idContrato);
      setDetalleContrato(data);
    } catch {
      /* silencioso */
    } finally {
      setLoadingDetalle(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[50] flex" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
        <div
          className="m-auto w-[440px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {cliente.nombre?.charAt(0) || '?'}
              </div>
              <div>
                <h2 className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                  {cliente.nombre}
                </h2>
                <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                  {cliente.dni && (
                    <span className="flex items-center gap-1">
                      <CreditCard size={10} /> {cliente.dni}
                    </span>
                  )}
                  {cliente.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone size={10} /> {cliente.telefono}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface)] transition-colors" style={{ color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Cuerpo scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Lista negra */}
            {cliente.en_lista_negra ? (
              <div className="px-5 pt-3">
                <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                  style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)' }}>
                  <AlertTriangle size={13} />
                  <span className="font-bold">LISTA NEGRA</span>
                  {cliente.notas_riesgo && <span>— {cliente.notas_riesgo}</span>}
                </div>
              </div>
            ) : null}

            {/* Badge + Estrellas */}
            <div className="px-5 pt-3 flex items-center justify-between">
              <CalificacionBadge
                promedio={cliente.promedio_estrellas}
                total={cliente.total_calificaciones}
              />
              {cliente.promedio_estrellas && (
                <div>
                  <StarRating value={cliente.promedio_estrellas} readonly size={13} showLabel />
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-3 px-5 pt-3 pb-2">
              <StatPill icon={Package} label="Alquileres" value={cliente.total_alquileres} />
              <StatPill icon={Star} label="Calificaciones" value={cliente.total_calificaciones} />
              <StatPill
                icon={Star}
                label="Promedio"
                value={cliente.promedio_estrellas ? cliente.promedio_estrellas.toFixed(1) + ' ★' : '—'}
              />
            </div>

            {/* Historial de alquileres */}
            <div className="px-5 py-3">
              <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--muted)' }}>
                Historial de alquileres
              </h3>

              {loadingContratos ? (
                <div className="py-8 text-center">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
                    style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                </div>
              ) : contratos.length === 0 ? (
                <div className="py-8 text-center">
                  <Package size={28} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Este cliente no tiene alquileres</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contratos.map(contrato => (
                    <ContratoItem
                      key={contrato.id}
                      contrato={contrato}
                      onClick={() => abrirDetalle(contrato.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {detalleContrato && (
        <DetalleAlquilerModal
          contrato={detalleContrato}
          onClose={() => setDetalleContrato(null)}
        />
      )}

      {loadingDetalle && (
        <div className="fixed inset-0 z-[80] flex" style={{ backgroundColor: 'oklch(0 0 0 / 0.2)' }}>
          <div className="m-auto w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        </div>
      )}
    </>
  );
}
