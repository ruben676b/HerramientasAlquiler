import { useState, useEffect, useCallback } from 'react';
import { Search, Users, Star, Phone, CreditCard, Calendar, ChevronRight, Package, User } from 'lucide-react';
import StarRating, { CalificacionBadge } from '../components/StarRating';
import DetalleAlquilerModal from '../components/DetalleAlquilerModal';

const ESTADO_STYLES = {
  'alquilado': { bg: 'oklch(0.93 0.04 240)', color: 'oklch(0.45 0.10 240)' },
  'reservado': { bg: 'oklch(0.93 0.04 280)', color: 'oklch(0.45 0.10 280)' },
  'atrasado': { bg: 'oklch(0.93 0.04 25)', color: 'oklch(0.45 0.18 25)' },
  'devuelto': { bg: 'oklch(0.93 0.06 160)', color: 'oklch(0.40 0.12 160)' },
  'devolución incompleta': { bg: 'oklch(0.93 0.05 80)', color: 'oklch(0.50 0.13 80)' },
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [detalleContrato, setDetalleContrato] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Cargar clientes
  const cargarClientes = useCallback(async (termino = '') => {
    if (!window.api) return;
    setLoading(true);
    try {
      const data = termino
        ? await window.api.buscarClientesPanel(termino)
        : await window.api.getClientesPanel();
      setClientes(data);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarClientes(); }, [cargarClientes]);

  // Debounce búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      cargarClientes(busqueda);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda, cargarClientes]);

  // Cargar contratos al seleccionar cliente
  const seleccionarCliente = useCallback(async (cliente) => {
    setSelectedCliente(cliente);
    setLoadingContratos(true);
    try {
      const data = await window.api.getContratosCliente(cliente.id);
      setContratos(data);
    } catch (err) {
      console.error('Error cargando contratos:', err);
    } finally {
      setLoadingContratos(false);
    }
  }, []);

  // Abrir detalle de contrato
  const abrirDetalle = useCallback(async (idContrato) => {
    setLoadingDetalle(true);
    try {
      const data = await window.api.getDetalleContrato(idContrato);
      setDetalleContrato(data);
    } catch (err) {
      console.error('Error cargando detalle:', err);
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  return (
    <div className="flex h-full" style={{ minHeight: 'calc(100vh - 0px)' }}>
      {/* Panel izquierdo — Lista de clientes */}
      <div className="w-[42%] flex flex-col border-r" style={{ borderColor: 'var(--border)' }}>
        {/* Header + Buscador */}
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.12)' }}
            >
              <Users size={16} style={{ color: 'oklch(0.55 0.08 240)' }} />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>Clientes</h1>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--faint)' }}
            />
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-xl text-xs border transition-all duration-150"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px oklch(0.53 0.135 55 / 0.1)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Cargando...</p>
            </div>
          ) : clientes.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={32} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {busqueda ? 'No se encontraron clientes' : 'No hay clientes registrados'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {clientes.map(cliente => (
                <ClienteItem
                  key={cliente.id}
                  cliente={cliente}
                  isSelected={selectedCliente?.id === cliente.id}
                  onClick={() => seleccionarCliente(cliente)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho — Historial del cliente */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--surface)' }}>
        {selectedCliente ? (
          <>
            {/* Info del cliente */}
            <div className="shrink-0 px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold"
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-text)',
                    }}
                  >
                    {selectedCliente.nombre?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                      {selectedCliente.nombre}
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                      {selectedCliente.dni && (
                        <span className="flex items-center gap-1">
                          <CreditCard size={10} /> {selectedCliente.dni}
                        </span>
                      )}
                      {selectedCliente.telefono && (
                        <span className="flex items-center gap-1">
                          <Phone size={10} /> {selectedCliente.telefono}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <CalificacionBadge
                    promedio={selectedCliente.promedio_estrellas}
                    total={selectedCliente.total_calificaciones}
                  />
                  {selectedCliente.promedio_estrellas && (
                    <div className="mt-1">
                      <StarRating value={selectedCliente.promedio_estrellas} readonly size={13} showLabel />
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4 mt-3">
                <StatPill icon={Package} label="Alquileres" value={selectedCliente.total_alquileres} />
                <StatPill icon={Star} label="Calificaciones" value={selectedCliente.total_calificaciones} />
                <StatPill
                  icon={Star}
                  label="Promedio"
                  value={selectedCliente.promedio_estrellas ? selectedCliente.promedio_estrellas.toFixed(1) + ' ★' : '—'}
                />
              </div>
            </div>

            {/* Lista de contratos */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
              style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.08)' }}
            >
              <User size={28} style={{ color: 'oklch(0.55 0.08 240 / 0.4)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              Seleccione un cliente
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--faint)' }}>
              para ver su historial de alquileres y calificación
            </p>
          </div>
        )}
      </div>

      {/* Modal de detalle de contrato */}
      {detalleContrato && (
        <DetalleAlquilerModal
          contrato={detalleContrato}
          onClose={() => setDetalleContrato(null)}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function ClienteItem({ cliente, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 group relative"
      style={{
        backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div className="flex items-center gap-2.5">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
          style={{
            backgroundColor: isSelected ? 'oklch(1 0 0 / 0.2)' : 'var(--primary)',
            color: isSelected ? '#fff' : 'var(--primary-text)',
          }}
        >
          {cliente.nombre?.charAt(0) || '?'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[12px] font-semibold truncate"
              style={{ color: isSelected ? '#fff' : 'var(--ink)' }}
            >
              {cliente.nombre}
            </span>
            {cliente.en_lista_negra === 1 && (
              <span className="text-[9px] px-1 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: 'oklch(0.93 0.04 25)', color: 'oklch(0.45 0.18 25)' }}>
                ⚠
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: isSelected ? 'oklch(1 0 0 / 0.7)' : 'var(--muted)' }}>
            {cliente.dni && <span>DNI: {cliente.dni}</span>}
            {cliente.telefono && <span>· {cliente.telefono}</span>}
            {cliente.total_alquileres > 0 && <span>· {cliente.total_alquileres} alq.</span>}
          </div>
        </div>

        {/* Estrellas */}
        <div className="shrink-0 text-right">
          {cliente.promedio_estrellas ? (
            <div className="flex items-center gap-1">
              <StarRating value={cliente.promedio_estrellas} readonly size={11} />
              <span className="text-[10px] font-mono font-semibold" style={{ color: isSelected ? 'oklch(1 0 0 / 0.8)' : 'oklch(0.62 0.17 80)' }}>
                {cliente.promedio_estrellas.toFixed(1)}
              </span>
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: isSelected ? 'oklch(1 0 0 / 0.5)' : 'var(--faint)' }}>—</span>
          )}
        </div>

        <ChevronRight
          size={14}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: isSelected ? '#fff' : 'var(--faint)' }}
        />
      </div>
    </button>
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
          {/* Calificación */}
          {contrato.estrellas ? (
            <div className="flex items-center gap-1">
              <StarRating value={contrato.estrellas} readonly size={11} />
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--faint)' }}>Sin calificar</span>
          )}

          <ChevronRight
            size={14}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{ color: 'var(--faint)' }}
          />
        </div>
      </div>

      {/* Comentario */}
      {contrato.calificacion_comentario && (
        <p className="text-[10px] mt-1.5 truncate italic" style={{ color: 'var(--muted)' }}>
          "{contrato.calificacion_comentario}"
        </p>
      )}
    </button>
  );
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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
