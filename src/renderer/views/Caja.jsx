import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DollarSign, Banknote, Smartphone, CreditCard,
  Calendar, ChevronLeft, ChevronRight, ArrowUpRight,
  ArrowDownLeft, Receipt, TrendingUp, Hash, Clock,
  RefreshCw, Wallet, MinusCircle, Trash2, Tag, Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { localDate } from '../lib/date';
import { useCajaInicial } from '../main';
import NuevoEgresoModal from '../components/NuevoEgresoModal';
import ConfirmModal from '../components/ConfirmModal';
import CierreCajaModal from '../components/CierreCajaModal';
import { useToast } from '../components/Toast';

/* ================================================================
   CAJA — Resumen financiero diario
   ================================================================ */

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const fmtMoneda = (v) => {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + 'S/ ' + Math.abs(n).toFixed(2);
};

const fmtHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtFechaLarga = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
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

const TIPO_GRUPO = {
  adelanto: 'Pago Alquiler',
  saldo: 'Pago Alquiler',
  mora: 'Mora',
  deposito: 'Garantía',
  devolucion_deposito: 'Dev. Garantía',
  egreso_caja: 'Egreso de Caja',
  venta_inventario: 'Venta de Inventario',
};

const METODO_CONFIG = {
  efectivo: {
    label: 'Efectivo',
    icon: Banknote,
    color: 'oklch(0.55 0.15 160)',
    soft: 'oklch(0.93 0.05 160)',
  },
  yape: {
    label: 'Yape',
    icon: Smartphone,
    color: 'oklch(0.50 0.18 300)',
    soft: 'oklch(0.93 0.06 300)',
  },
  plin: {
    label: 'Plin',
    icon: CreditCard,
    color: 'oklch(0.55 0.12 200)',
    soft: 'oklch(0.93 0.05 200)',
  },
};

/* ================================================================
   COMPONENTE PRINCIPAL
   ================================================================ */

export default function Caja() {
  const toast = useToast();
  const hoy = localDate();
  const [fecha, setFecha] = useState(hoy);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const { cajaInicial } = useCajaInicial();

  // Estados de Modales
  const [modalEgresoOpen, setModalEgresoOpen] = useState(false);
  const [egresoAEliminar, setEgresoAEliminar] = useState(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!window.api) return;
    setCargando(true);
    setError(null);
    try {
      const data = await window.api.getResumenCaja(fecha);
      setResumen(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const esHoy = fecha === hoy;

  const cambiarFecha = (delta) => {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const nueva = localDate(d);
    if (nueva <= hoy) setFecha(nueva);
  };

  const confirmEliminarEgreso = async () => {
    if (!egresoAEliminar) return;
    try {
      const res = await window.api.eliminarEgresoCaja(egresoAEliminar.id_egreso);
      if (res && res.success) {
        toast('Egreso eliminado de la caja', 'success');
        cargarDatos();
      } else {
        toast('No se pudo eliminar el egreso', 'error');
      }
    } catch (err) {
      toast('Error al eliminar: ' + err.message, 'error');
    } finally {
      setEgresoAEliminar(null);
    }
  };

  // Agrupar resumen por concepto agrupado (adelanto+saldo → "Pago Alquiler")
  const resumenAgrupado = useMemo(() => {
    if (!resumen?.resumenConcepto) return [];
    const grupos = {};
    for (const fila of resumen.resumenConcepto) {
      const grupo = TIPO_GRUPO[fila.tipo] || fila.tipo;
      const esEgresoConcepto = fila.tipo === 'devolucion_deposito' || fila.tipo === 'egreso_caja';
      if (!grupos[grupo]) {
        grupos[grupo] = {
          grupo,
          efectivo: 0,
          yape: 0,
          plin: 0,
          total: 0,
          esEgreso: esEgresoConcepto
        };
      }
      grupos[grupo].efectivo += fila.efectivo;
      grupos[grupo].yape += fila.yape;
      grupos[grupo].plin += fila.plin;
      grupos[grupo].total += fila.total;
    }
    return Object.values(grupos);
  }, [resumen]);

  const totalNeto = resumen
    ? resumen.totalesPorMetodo.totalIngresos - resumen.totalesPorMetodo.totalEgresos
    : 0;

  const esHoyFecha = fecha === hoy;
  const totalEfectivoCaja = esHoyFecha
    ? cajaInicial + (resumen?.totalesPorMetodo?.efectivo || 0)
    : (resumen?.totalesPorMetodo?.efectivo || 0);

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="p-5 max-w-[1200px] mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
            Caja del Día
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--muted)' }}>
            Resumen de ingresos, egresos y movimientos
          </p>
        </div>

        {/* Date Picker & Action */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Cerrar Caja */}
          <button
            onClick={() => setCierreAbierto(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold transition-all shadow-sm active:scale-95 hover:opacity-90 cursor-pointer"
            style={{
              backgroundColor: 'oklch(0.93 0.04 25)',
              color: 'oklch(0.52 0.20 25)',
              border: '1px solid oklch(0.85 0.06 25)',
            }}
          >
            <Lock size={16} />
            <span>Cerrar Caja</span>
          </button>

          {/* Botón Registrar Egreso */}
          <button
            onClick={() => setModalEgresoOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold text-white transition-all shadow-sm active:scale-95 hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: 'oklch(0.52 0.20 25)' }}
          >
            <MinusCircle size={16} />
            <span>Registrar Egreso</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => cambiarFecha(-1)}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--surface)]"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              title="Día anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium min-w-[220px] justify-center"
              style={{
                backgroundColor: esHoy ? 'oklch(0.53 0.135 55 / 0.08)' : 'var(--surface)',
                border: esHoy ? '1.5px solid oklch(0.53 0.135 55 / 0.3)' : '1px solid var(--border)',
                color: esHoy ? 'oklch(0.53 0.135 55)' : 'var(--ink)',
              }}
            >
              <Calendar size={14} />
              <span>{fmtFechaLarga(fecha)}</span>
              {esHoy && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ml-1"
                  style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.15)', color: 'oklch(0.53 0.135 55)' }}
                >
                  Hoy
                </span>
              )}
            </div>

            <button
              onClick={() => cambiarFecha(1)}
              disabled={esHoy}
              className={cn(
                'p-2 rounded-lg transition-colors',
                esHoy ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[var(--surface)]'
              )}
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              title="Día siguiente"
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={cargarDatos}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--surface)] ml-1"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              title="Actualizar"
            >
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-4 mb-4 text-[13px]"
          style={{ backgroundColor: 'oklch(0.93 0.04 25)', color: 'oklch(0.52 0.20 25)', border: '1px solid oklch(0.85 0.06 25)' }}
        >
          Error al cargar datos: {error}
        </div>
      )}

      {cargando && !resumen ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
          <span className="ml-2 text-[13px]" style={{ color: 'var(--muted)' }}>Cargando datos de caja...</span>
        </div>
      ) : resumen && (
        <>
          {/* ===== SECCIÓN 0: CAJA INICIAL (solo hoy) ===== */}
          {esHoyFecha && (
            <div
              className="rounded-xl p-3.5 mb-4 flex items-center justify-between"
              style={{
                backgroundColor: 'oklch(0.55 0.15 160 / 0.06)',
                border: '1px solid oklch(0.55 0.15 160 / 0.15)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'oklch(0.55 0.15 160 / 0.12)' }}
                >
                  <Wallet size={16} style={{ color: 'oklch(0.55 0.15 160)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'oklch(0.55 0.15 160)' }}>
                    Caja inicial del día
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    Monto de efectivo al abrir la caja
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-bold font-mono" style={{ color: 'oklch(0.55 0.15 160)' }}>
                  {fmtMoneda(cajaInicial)}
                </p>
                <p className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                  Total efectivo en caja: {fmtMoneda(totalEfectivoCaja)}
                </p>
              </div>
            </div>
          )}

          {/* ===== SECCIÓN 1: KPI CARDS ===== */}
          <div
            className="grid gap-3 mb-5"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
          >
            {/* Total neto */}
            <KpiCard
              icon={TrendingUp}
              label="Total Neto"
              value={fmtMoneda(totalNeto)}
              accent="oklch(0.53 0.135 55)"
              accentSoft="oklch(0.93 0.04 55)"
              sub={`${resumen.totalMovimientos} movimiento${resumen.totalMovimientos !== 1 ? 's' : ''}`}
            />
            {/* Efectivo */}
            <KpiCard
              icon={Banknote}
              label="Efectivo"
              value={fmtMoneda(resumen.totalesPorMetodo.efectivo)}
              accent={METODO_CONFIG.efectivo.color}
              accentSoft={METODO_CONFIG.efectivo.soft}
            />
            {/* Yape */}
            <KpiCard
              icon={Smartphone}
              label="Yape"
              value={fmtMoneda(resumen.totalesPorMetodo.yape)}
              accent={METODO_CONFIG.yape.color}
              accentSoft={METODO_CONFIG.yape.soft}
            />
            {/* Plin */}
            <KpiCard
              icon={CreditCard}
              label="Plin"
              value={fmtMoneda(resumen.totalesPorMetodo.plin)}
              accent={METODO_CONFIG.plin.color}
              accentSoft={METODO_CONFIG.plin.soft}
            />
          </div>

          {/* ===== SECCIÓN 2: TABLA RESUMEN ===== */}
          <div
            className="rounded-xl overflow-hidden mb-5"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Receipt size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                Resumen por Concepto
              </span>
              <span className="text-[11px] ml-auto" style={{ color: 'var(--muted)' }}>
                {resumen.totalContratos} contrato{resumen.totalContratos !== 1 ? 's' : ''}
              </span>
            </div>

            {resumenAgrupado.length === 0 ? (
              <div className="py-10 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
                Sin movimientos para esta fecha
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Concepto</th>
                    {Object.entries(METODO_CONFIG).map(([key, cfg]) => (
                      <th key={key} className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>
                        {cfg.label}
                      </th>
                    ))}
                    <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenAgrupado.map((fila, i) => (
                    <tr
                      key={fila.grupo}
                      style={{
                        borderBottom: i < resumenAgrupado.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--ink)' }}>
                        <span className="flex items-center gap-2">
                          {fila.esEgreso ? (
                            <ArrowDownLeft size={13} style={{ color: 'oklch(0.52 0.20 25)' }} />
                          ) : (
                            <ArrowUpRight size={13} style={{ color: 'oklch(0.55 0.15 160)' }} />
                          )}
                          {fila.grupo}
                        </span>
                      </td>
                      {['efectivo', 'yape', 'plin'].map((m) => (
                        <td key={m} className="text-right px-4 py-2.5 font-mono text-[12px]" style={{ color: fila[m] > 0 ? 'var(--ink)' : 'var(--faint)' }}>
                          {fila[m] > 0 ? (fila.esEgreso ? '-' : '') + 'S/ ' + fila[m].toFixed(2) : '—'}
                        </td>
                      ))}
                      <td
                        className="text-right px-4 py-2.5 font-mono font-semibold text-[12px]"
                        style={{ color: fila.esEgreso ? 'oklch(0.52 0.20 25)' : 'var(--ink)' }}
                      >
                        {fila.esEgreso ? '-' : ''}S/ {fila.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td className="px-4 py-3 font-bold text-[13px]" style={{ color: 'var(--ink)' }}>Total</td>
                    {['efectivo', 'yape', 'plin'].map((m) => {
                      const v = resumen.totalesPorMetodo[m];
                      return (
                        <td key={m} className="text-right px-4 py-3 font-mono font-bold text-[12px]" style={{ color: 'var(--ink)' }}>
                          {fmtMoneda(v)}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-3 font-mono font-bold text-[13px]" style={{ color: 'var(--primary)' }}>
                      {fmtMoneda(totalNeto)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* ===== SECCIÓN 3: LISTADO DE MOVIMIENTOS ===== */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <DollarSign size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                Movimientos del Día
              </span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full ml-auto"
                style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}
              >
                {resumen.movimientos.length}
              </span>
            </div>

            {resumen.movimientos.length === 0 ? (
              <div className="py-10 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
                No hay movimientos registrados para esta fecha
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {resumen.movimientos.map((mov) => {
                  const esEgreso = mov.tipo === 'devolucion_deposito' || mov.tipo === 'egreso_caja' || mov.esEgresoDirecto;
                  const metodoCfg = METODO_CONFIG[mov.metodo] || METODO_CONFIG.efectivo;
                  const MetodoIcon = metodoCfg.icon;

                  return (
                    <div
                      key={mov.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] group"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {/* Icono tipo */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: esEgreso ? 'oklch(0.93 0.04 25)' : 'oklch(0.93 0.05 160)',
                        }}
                      >
                        {esEgreso
                          ? <ArrowDownLeft size={14} style={{ color: 'oklch(0.52 0.20 25)' }} />
                          : <ArrowUpRight size={14} style={{ color: 'oklch(0.55 0.15 160)' }} />
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                            {TIPO_LABELS[mov.tipo] || mov.tipo}
                          </span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
                            style={{ backgroundColor: metodoCfg.soft, color: metodoCfg.color }}
                          >
                            {metodoCfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {mov.esEgresoDirecto ? (
                            <>
                              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                                {mov.notas || 'Sin descripción'}
                              </span>
                              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>·</span>
                              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--faint)' }}>
                                <Clock size={9} />
                                {fmtHora(mov.fecha_pago)}
                              </span>
                            </>
                          ) : mov.esVentaDirecta ? (
                            <>
                              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                                {mov.notas}
                              </span>
                              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>·</span>
                              <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                                {mov.cliente_nombre}
                              </span>
                              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>·</span>
                              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--faint)' }}>
                                <Clock size={9} />
                                {fmtHora(mov.fecha_pago)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                                <Hash size={10} />
                                Contrato {mov.contrato_num}
                              </span>
                              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>·</span>
                              <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                                {mov.cliente_nombre}
                              </span>
                              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>·</span>
                              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--faint)' }}>
                                <Clock size={9} />
                                {fmtHora(mov.fecha_pago)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Botón Eliminar para Egresos Directos */}
                      {mov.esEgresoDirecto && (
                        <button
                          onClick={() => setEgresoAEliminar(mov)}
                          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                          style={{ color: 'var(--danger)' }}
                          title="Eliminar egreso"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      {/* Monto */}
                      <span
                        className="text-[14px] font-bold font-mono shrink-0"
                        style={{ color: esEgreso ? 'oklch(0.52 0.20 25)' : 'oklch(0.55 0.15 160)' }}
                      >
                        {esEgreso ? '-' : '+'}S/ {mov.monto.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Nuevo Egreso */}
      <NuevoEgresoModal
        open={modalEgresoOpen}
        onClose={() => setModalEgresoOpen(false)}
        onSuccess={cargarDatos}
      />

      {/* Modal Confirmar Eliminar Egreso */}
      <ConfirmModal
        open={!!egresoAEliminar}
        title="Eliminar Egreso de Caja"
        message={`¿Deseas eliminar el egreso de S/ ${egresoAEliminar?.monto?.toFixed(2)} ("${egresoAEliminar?.notas}")?`}
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmEliminarEgreso}
        onCancel={() => setEgresoAEliminar(null)}
      />

      {/* Modal Cerrar Caja */}
      <CierreCajaModal
        open={cierreAbierto}
        cajaInicial={cajaInicial}
        onConfirm={() => window.api.closeApp()}
        onCancel={() => setCierreAbierto(false)}
      />
    </div>
  );
}

/* ================================================================
   KPI Card — reutilizable
   ================================================================ */

function KpiCard({ icon: Icon, label, value, accent, accentSoft, sub }) {
  return (
    <div
      className="rounded-xl p-4 transition-all duration-150"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accentSoft }}
        >
          <Icon size={14} style={{ color: accent }} />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      </div>
      <p className="text-[18px] font-bold font-mono" style={{ color: 'var(--ink)' }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--faint)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
