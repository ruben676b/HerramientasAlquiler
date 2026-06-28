import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, ChevronRight, Calendar, XCircle,
  CheckCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SEMANTIC, ESTADOS_CONTRATO } from '../lib/constants';
import Button from '../components/ui/button';
import { useSessions } from '../contexts/SessionsContext';

const ESTADO_ICON = {
  reservado: Clock,
  alquilado: AlertTriangle,
  devuelto: CheckCircle,
  'devolución incompleta': XCircle,
};

export default function Alquileres() {
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const { openDialog } = useSessions();

  const cargar = async () => {
    if (!window.api) return;
    setCargando(true);
    try {
      const c = await window.api.getContratos({ busqueda, estado: estadoFiltro });
      setContratos(c);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, [busqueda, estadoFiltro]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const conteoEstados = {};
  ESTADOS_CONTRATO.forEach((e) => { conteoEstados[e] = contratos.filter((c) => c.estado === e).length; });

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Alquileres</h1>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" style={{ backgroundColor: 'oklch(0.60 0.13 155)', border: 'none' }}
            onClick={() => openDialog('alquiler')}><Plus size={14} /> Alquilar</Button>
          <Button variant="primary" size="sm" style={{ backgroundColor: 'oklch(0.62 0.10 240)', border: 'none' }}
            onClick={() => openDialog('reserva')}><Clock size={14} /> Reservar</Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><XCircle size={14} /></button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
          <input ref={searchRef} type="text" placeholder="Buscar por cliente, DNI o código..."
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-9 pl-8 pr-8 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5" style={{ color: 'var(--faint)' }}>✕</button>}
        </div>

        <div className="flex gap-1 flex-wrap">
          {[{ id: '', label: 'Todos' }, ...ESTADOS_CONTRATO.map((e) => ({ id: e, label: SEMANTIC[e]?.label || e }))].map((f) => {
            const activo = estadoFiltro === f.id;
            const sem = SEMANTIC[f.id];
            return (
              <button key={f.id} onClick={() => setEstadoFiltro(f.id === estadoFiltro ? '' : f.id)}
                className="px-3 h-8 rounded-lg text-[13px] font-medium transition-colors duration-150 flex items-center gap-1.5"
                style={{
                  backgroundColor: activo
                    ? (f.id === '' ? 'var(--primary)' : sem?.color)
                    : 'var(--surface)',
                  color: activo ? '#fff' : 'var(--muted)',
                }}>
                {f.label}
                {f.id && <span style={{ opacity: activo ? 0.8 : 0.5, fontSize: 11 }}>{conteoEstados[f.id] || 0}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-sm py-12 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
      ) : contratos.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay alquileres</p>
          <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>Use los botones superiores para crear uno</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contratos.map((c) => {
            const sem = SEMANTIC[c.estado];
            const Icon = ESTADO_ICON[c.estado];
            const vencido = c.fecha_devolucion_pactada < hoy && c.estado === 'alquilado';
            const venceHoy = c.fecha_devolucion_pactada === hoy && c.estado === 'alquilado';
            const diasAlquiler = Math.max(1, Math.ceil((new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000));
            const total = (c.subtotal_diario || 0) * diasAlquiler + (c.deposito_monto || 0);
            const esPendiente = c.estado === 'devolución incompleta';

            return (
              <div key={c.id}
                className="flex items-center gap-3 pl-3 pr-4 py-3 rounded-xl cursor-pointer group transition-all duration-150"
                style={{
                  backgroundColor: esPendiente ? 'oklch(0.96 0.012 25)' : 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderLeftWidth: 3,
                  borderLeftColor: sem?.color || 'var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = esPendiente ? 'oklch(0.94 0.018 25)' : 'var(--surface)';
                  e.currentTarget.style.boxShadow = '0 1px 4px oklch(0 0 0 / 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = esPendiente ? 'oklch(0.96 0.012 25)' : 'var(--bg)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Badge estado */}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0"
                  style={{ backgroundColor: sem?.soft, color: sem?.variable }}>
                  <Icon size={11} /> {sem?.label}
                </span>

                {/* Cliente */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</span>
                    {c.cliente_dni && <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>{c.cliente_dni}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <Calendar size={11} style={{ color: 'var(--faint)' }} />
                    <span style={{ color: vencido ? 'var(--danger)' : venceHoy ? 'var(--warning)' : 'var(--muted)' }}>
                      {c.fecha_salida} → {c.fecha_devolucion_pactada}
                      {vencido && <span className="ml-1 font-semibold" style={{ color: 'var(--danger)' }}>Vencido</span>}
                      {venceHoy && <span className="ml-1 font-semibold" style={{ color: 'var(--warning)' }}>Hoy</span>}
                    </span>
                  </div>
                </div>

                {/* Ítems */}
                <span className="text-xs shrink-0 px-2 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                  {c.total_items} ítem{c.total_items !== 1 ? 's' : ''}
                </span>

                {/* Monto */}
                <span className="text-sm font-mono font-semibold w-24 text-right shrink-0" style={{ color: 'var(--ink)' }}>
                  S/ {total.toFixed(2)}
                </span>

                {/* Acción rápida */}
                {(c.estado === 'alquilado' || c.estado === 'devolución incompleta') && (
                  <Button variant="primary" size="sm" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">Devolver</Button>
                )}

                <ChevronRight size={14} style={{ color: 'var(--faint)' }} className="shrink-0" />
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
