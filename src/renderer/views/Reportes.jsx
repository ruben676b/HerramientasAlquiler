import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, FileText, TrendingUp, Calendar, Eye, Loader2,
  Banknote, Smartphone, CreditCard, ArrowUpRight, ArrowDownLeft,
  Wallet, Clock, ChevronRight, X, Hash, RefreshCw
} from 'lucide-react';
import { localDate } from '../lib/date';
import DetalleReporteModal from '../components/DetalleReporteModal';
import { useToast } from '../components/Toast';

const METODO_CONFIG = {
  efectivo: { label: 'Efectivo', icon: Banknote, color: 'oklch(0.55 0.15 160)', soft: 'oklch(0.93 0.05 160)' },
  yape: { label: 'Yape', icon: Smartphone, color: 'oklch(0.50 0.18 300)', soft: 'oklch(0.93 0.06 300)' },
  plin: { label: 'Plin', icon: CreditCard, color: 'oklch(0.55 0.12 200)', soft: 'oklch(0.93 0.05 200)' },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const fmtMoneda = (v) => {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + 'S/ ' + Math.abs(n).toFixed(2);
};

const fmtFechaLarga = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtFecha = (iso) => {
  if (!iso) return '-';
  const s = iso.includes(' ') ? iso.replace(' ', 'T') : iso;
  if (s.includes('T')) {
    const d = new Date(s);
    if (isNaN(d)) return iso;
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const TABS = [
  { id: 'reportes', label: 'Reportes', icon: FileText },
  { id: 'historial', label: 'Historial de Caja', icon: Clock },
];

export default function Reportes() {
  const toast = useToast();
  const [tab, setTab] = useState('reportes');
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);

  const [reportes, setReportes] = useState([]);
  const [historialCaja, setHistorialCaja] = useState([]);

  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [cajaDetalle, setCajaDetalle] = useState(null);
  const [cargandoCajaDetalle, setCargandoCajaDetalle] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!window.api) return;
    setCargando(true);
    try {
      const [r, h] = await Promise.all([
        window.api.listarReportes(),
        window.api.getHistorialCaja(),
      ]);
      setReportes(r || []);
      setHistorialCaja(h || []);
    } catch (e) {
      console.error('Error cargando datos:', e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const handleGenerarReporte = async () => {
    if (!window.api) return;
    setGenerando(true);
    try {
      const reporte = await window.api.generarReporte();
      setReporteSeleccionado(reporte);
      await cargarDatos();
      toast('Reporte generado exitosamente');
    } catch (e) {
      toast(e.message || 'Error al generar reporte', 'error');
      console.error('Error generando reporte:', e);
    } finally {
      setGenerando(false);
    }
  };

  const handleVerReporte = async (id) => {
    if (!window.api) return;
    try {
      const reporte = await window.api.obtenerReporte(id);
      setReporteSeleccionado(reporte);
    } catch (e) {
      toast('Error al cargar reporte', 'error');
    }
  };

  const handleVerCajaDetalle = async (fecha) => {
    setCargandoCajaDetalle(true);
    try {
      const cajaGuardada = await window.api.getCajaDiaria(fecha);
      if (cajaGuardada && cajaGuardada.resumen_json) {
        setCajaDetalle({ ...cajaGuardada.resumen_json, fecha, monto_inicial: cajaGuardada.monto_inicial });
      } else {
        const data = await window.api.getResumenCaja(fecha);
        setCajaDetalle(data);
      }
    } catch (e) {
      toast('Error al cargar detalle de caja', 'error');
    } finally {
      setCargandoCajaDetalle(false);
    }
  };

  if (cargando) {
    return (
      <div className="p-5 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} style={{ color: 'var(--muted)', animation: 'spin 0.75s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[1200px] mx-auto" style={{ color: 'var(--ink)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.1)' }}>
          <BarChart3 size={18} style={{ color: 'oklch(0.53 0.135 55)' }} />
        </div>
        <div>
          <h1 className="text-lg font-bold">Reportes</h1>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Genera reportes de ingresos y egresos, consulta el historial de caja</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 mb-5 p-0.5 rounded-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-[12px] font-semibold transition-all duration-150"
            style={{
              backgroundColor: tab === t.id ? 'var(--bg)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--muted)',
              boxShadow: tab === t.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido por tab */}
      {tab === 'reportes' && (
        <TabReportes
          reportes={reportes}
          generando={generando}
          onGenerar={handleGenerarReporte}
          onVerReporte={handleVerReporte}
        />
      )}

      {tab === 'historial' && (
        <TabHistorialCaja
          historial={historialCaja}
          onVerDetalle={handleVerCajaDetalle}
        />
      )}

      {/* Modal detalle reporte */}
      {reporteSeleccionado && (
        <DetalleReporteModal
          reporte={reporteSeleccionado}
          onClose={() => setReporteSeleccionado(null)}
        />
      )}

      {/* Modal detalle caja */}
      {cajaDetalle && (
        <CajaDetalleModal
          resumen={cajaDetalle}
          cargando={cargandoCajaDetalle}
          onClose={() => setCajaDetalle(null)}
        />
      )}
    </div>
  );
}

/* ================================================================
   TAB REPORTES
   ================================================================ */
function TabReportes({ reportes, generando, onGenerar, onVerReporte }) {
  return (
    <div className="space-y-5">
      {/* Botón generar */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>Generar Nuevo Reporte</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
              {reportes.length === 0
                ? 'Incluirá todos los alquileres completados desde el inicio hasta hoy.'
                : `Incluirá transacciones desde ${fmtFecha(reportes[0]?.fecha_fin)} hasta ahora.`
              }
            </p>
          </div>
          <button
            onClick={onGenerar}
            disabled={generando}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-150"
            style={{
              backgroundColor: 'oklch(0.53 0.135 55)',
              color: '#fff',
              opacity: generando ? 0.7 : 1,
              cursor: generando ? 'default' : 'pointer',
            }}
          >
            {generando ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 0.75s linear infinite' }} />
                Generando...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Generar Reporte
              </>
            )}
          </button>
        </div>
      </div>

      {/* Lista de reportes */}
      <div>
        <h3 className="text-[13px] font-bold mb-3" style={{ color: 'var(--muted)' }}>
          Reportes Generados ({reportes.length})
        </h3>

        {reportes.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
            <p className="text-[13px]" style={{ color: 'var(--muted)' }}>No hay reportes generados.</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--faint)' }}>
              Genera tu primer reporte para empezar a hacer seguimiento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reportes.map(r => {
              const tt = r.totales_metodo || {};
              return (
                <div
                  key={r.id}
                  onClick={() => onVerReporte(r.id)}
                  className="rounded-xl p-4 cursor-pointer transition-all duration-150 hover:shadow-sm"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>
                        Reporte #{r.id}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                        backgroundColor: 'var(--bg)',
                        color: 'var(--muted)',
                      }}>
                        {fmtFecha(r.fecha_inicio)} — {fmtFecha(r.fecha_fin)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      {['efectivo', 'yape', 'plin'].map(m => {
                        const val = tt[m] || 0;
                        const config = METODO_CONFIG[m];
                        const Icon = config?.icon || Banknote;
                        return (
                          <div key={m} className="flex items-center gap-1">
                            <Icon size={10} style={{ color: config?.color }} />
                            <span className="font-mono font-semibold" style={{ color: val >= 0 ? 'var(--ink)' : 'var(--danger)' }}>
                              {fmtMoneda(val)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={13} style={{ color: 'var(--primary)' }} />
                      <span className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>
                        Neto: {fmtMoneda(r.total_neto)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                      <Eye size={12} />
                      Ver detalles
                      <ChevronRight size={12} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   TAB HISTORIAL DE CAJA
   ================================================================ */
function TabHistorialCaja({ historial, onVerDetalle }) {
  if (historial.length === 0) {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <Wallet size={32} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>No hay registros de caja.</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--faint)' }}>
          Los registros se guardan al cerrar caja desde la aplicación.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {historial.map(c => {
        const tt = c.totales_metodo || {};
        return (
          <div
            key={c.id}
            onClick={() => onVerDetalle(c.fecha)}
            className="rounded-xl p-4 cursor-pointer transition-all duration-150 hover:shadow-sm"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={13} style={{ color: 'var(--muted)' }} />
                  <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>
                    {fmtFechaLarga(c.fecha)}
                  </span>
                </div>
                {c.monto_inicial > 0 && (
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    Caja inicial: {fmtMoneda(c.monto_inicial)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                {['efectivo', 'yape', 'plin'].map(m => {
                  const val = tt[m] || 0;
                  const config = METODO_CONFIG[m];
                  const Icon = config?.icon || Banknote;
                  return (
                    <div key={m} className="flex items-center gap-1">
                      <Icon size={10} style={{ color: config?.color }} />
                      <span className="font-mono font-semibold" style={{ color: val >= 0 ? 'var(--ink)' : 'var(--danger)' }}>
                        {fmtMoneda(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1" style={{ color: 'oklch(0.55 0.15 160)' }}>
                  <ArrowUpRight size={11} />
                  Ing: {fmtMoneda(c.total_ingresos)}
                </span>
                <span className="flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                  <ArrowDownLeft size={11} />
                  Egr: {fmtMoneda(c.total_egresos)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                <Eye size={12} />
                Ver detalles
                <ChevronRight size={12} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   MODAL DETALLE CAJA (Inspirado en Caja.jsx)
   ================================================================ */
function CajaDetalleModal({ resumen, cargando, onClose }) {
  if (cargando) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}>
        <Loader2 size={28} style={{ color: '#fff', animation: 'spin 0.75s linear infinite' }} />
      </div>
    );
  }

  if (!resumen) return null;

  const totalesPorMetodo = resumen.totalesPorMetodo || {};
  const movimientos = resumen.movimientos || [];
  const resumenConcepto = resumen.resumenConcepto || [];
  const montoInicial = resumen.monto_inicial || 0;

  const netoEfectivo = (totalesPorMetodo.efectivo || 0) + montoInicial;

  const KPI_ITEMS = [
    {
      label: montoInicial > 0 ? 'Total en Caja' : 'Neto',
      value: montoInicial > 0 ? netoEfectivo : (totalesPorMetodo.efectivo || 0),
      color: 'oklch(0.53 0.135 55)',
      bg: 'oklch(0.53 0.135 55 / 0.07)',
      icon: Wallet,
      metodo: 'efectivo',
    },
    ...['efectivo', 'yape', 'plin'].map(m => ({
      label: METODO_CONFIG[m]?.label || m,
      value: totalesPorMetodo[m] || 0,
      color: METODO_CONFIG[m]?.color,
      bg: METODO_CONFIG[m]?.soft,
      icon: METODO_CONFIG[m]?.icon || Banknote,
      metodo: m,
    })),
  ];

  const TIPO_GRUPO = {
    adelanto: 'Pago Alquiler',
    saldo: 'Pago Alquiler',
    mora: 'Mora',
    deposito: 'Garantía',
    devolucion_deposito: 'Dev. Garantía',
    egreso_caja: 'Egreso de Caja',
    venta_inventario: 'Venta de Inventario',
  };

  const TIPO_LABELS = {
    adelanto: 'Adelanto',
    saldo: 'Saldo alquiler',
    mora: 'Mora',
    deposito: 'Garantía recibida',
    devolucion_deposito: 'Devolución garantía',
    egreso_caja: 'Egreso de caja',
    venta_inventario: 'Venta de Inventario',
  };

  const fmtHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden mb-8"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          animation: 'slideUp 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
              Detalle de Caja
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {resumen.fecha ? fmtFechaLarga(resumen.fecha) : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface)]" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
            {KPI_ITEMS.map(kpi => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: kpi.bg,
                    border: `1px solid ${kpi.color}20`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={13} style={{ color: kpi.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: kpi.color }}>
                      {kpi.label}
                    </span>
                  </div>
                  <span className="text-[15px] font-extrabold font-mono tabular-nums" style={{ color: kpi.color }}>
                    {fmtMoneda(kpi.value)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Resumen por concepto */}
          {resumenConcepto.length > 0 && (
            <div className="mb-5">
              <h4 className="text-[12px] font-bold mb-2" style={{ color: 'var(--muted)' }}>Resumen por Concepto</h4>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left py-1.5 px-3 font-semibold" style={{ color: 'var(--muted)' }}>Concepto</th>
                      <th className="text-right py-1.5 px-3 font-semibold" style={{ color: 'var(--muted)' }}>Efectivo</th>
                      <th className="text-right py-1.5 px-3 font-semibold" style={{ color: 'var(--muted)' }}>Yape</th>
                      <th className="text-right py-1.5 px-3 font-semibold" style={{ color: 'var(--muted)' }}>Plin</th>
                      <th className="text-right py-1.5 px-3 font-semibold" style={{ color: 'var(--muted)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenConcepto.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-1.5 px-3 font-medium" style={{ color: 'var(--ink)' }}>
                          {TIPO_GRUPO[c.tipo] || c.tipo}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono" style={{ color: c.efectivo > 0 ? 'oklch(0.55 0.15 160)' : 'var(--muted)' }}>
                          {c.efectivo ? fmtMoneda(c.efectivo) : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono" style={{ color: c.yape > 0 ? 'oklch(0.50 0.18 300)' : 'var(--muted)' }}>
                          {c.yape ? fmtMoneda(c.yape) : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono" style={{ color: c.plin > 0 ? 'oklch(0.55 0.12 200)' : 'var(--muted)' }}>
                          {c.plin ? fmtMoneda(c.plin) : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold" style={{ color: c.total >= 0 ? 'var(--ink)' : 'var(--danger)' }}>
                          {fmtMoneda(c.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lista de movimientos */}
          {movimientos.length > 0 && (
            <div>
              <h4 className="text-[12px] font-bold mb-2" style={{ color: 'var(--muted)' }}>
                Movimientos ({movimientos.length})
              </h4>
              <div className="space-y-1">
                {movimientos.map((m, i) => {
                  const esIngreso = !m.esEgresoDirecto && !m.esVentaDirecta
                    ? (m.tipo !== 'devolucion_deposito')
                    : m.esVentaDirecta;
                  const esEgreso = m.esEgresoDirecto || (!m.esVentaDirecta && m.tipo === 'devolucion_deposito');
                  const monto = m.monto || 0;
                  const metodoConfig = METODO_CONFIG[m.metodo] || {};

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: esEgreso ? 'oklch(0.52 0.20 25 / 0.08)' : 'oklch(0.55 0.15 160 / 0.08)',
                        }}
                      >
                        {esEgreso
                          ? <ArrowDownLeft size={13} style={{ color: 'var(--danger)' }} />
                          : <ArrowUpRight size={13} style={{ color: 'oklch(0.55 0.15 160)' }} />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                          {m.esEgresoDirecto
                            ? m.notas || 'Egreso de caja'
                            : m.esVentaDirecta
                              ? m.notas || 'Venta'
                              : `${TIPO_LABELS[m.tipo] || m.tipo} — ${m.cliente_nombre || '#' + m.contrato_num}`}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--faint)' }}>
                          {fmtHora(m.fecha_pago)}
                          {!m.esEgresoDirecto && !m.esVentaDirecta && m.contrato_num && (
                            <span> | Contrato #{m.contrato_num}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {metodoConfig.icon && (
                          <metodoConfig.icon size={12} style={{ color: metodoConfig.color }} />
                        )}
                        <span
                          className="text-[13px] font-mono font-bold tabular-nums"
                          style={{ color: esEgreso ? 'var(--danger)' : 'oklch(0.55 0.15 160)' }}
                        >
                          {esEgreso ? '-' : '+'}{fmtMoneda(monto)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {movimientos.length === 0 && (
            <p className="text-center text-[12px] py-6" style={{ color: 'var(--faint)' }}>
              Sin movimientos registrados este día.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
