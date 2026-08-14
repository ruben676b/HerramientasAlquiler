import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, Plus, ChevronDown, ChevronRight, Calendar, Clock,
  XCircle, X, CheckCircle, AlertTriangle, FileText, ArrowRight, Star,
  Ban, RefreshCw, Trash2, Edit, RotateCcw,
} from 'lucide-react';
import { SEMANTIC } from '../lib/constants';
import Button from '../components/ui/button';
import { useSessions } from '../contexts/SessionsContext';
import { useToast } from '../components/Toast';
import UnifiedPaymentModal from '../components/UnifiedPaymentModal';
import ConfirmModal from '../components/ConfirmModal';
import AnularPagoModal from '../components/AnularPagoModal';
import { gruparPagos } from '../lib/gruparPagos';
import DevolucionInline from '../components/DevolucionInline';
import CalificarContratoModal from '../components/CalificarContratoModal';
import TagChip from '../components/TagChip';
import { contarHabiles, desglosarMensual } from '../lib/duracion';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fmtFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
};
const fmtFechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()];
};

const baseItem = (item, contrato) => {
  if (item.total_item != null) return item.total_item;
  const fechaDev = item.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada;
  if (item.tarifa_aplicada === 'mes') {
    const desg = desglosarMensual(contrato.fecha_salida, fechaDev);
    const mes = item.precio_dia_aplicado || 0;
    const diaria = mes / 30;
    if (desg.meses > 0) return (mes * desg.meses + diaria * desg.diasExtra) * (item.cantidad || 1);
    return diaria * desg.totalHabiles * (item.cantidad || 1);
  }
  return (item.precio_dia_aplicado || 0) * contarHabiles(contrato.fecha_salida, fechaDev) * (item.cantidad || 1);
};

export default function Alquileres() {
  const [todosContratos, setTodosContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [error, setError] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pagoModalContrato, setPagoModalContrato] = useState(null);
  const [historialAbierto, setHistorialAbierto] = useState(null);
  const [anulandoPago, setAnulandoPago] = useState(null);
  const [devolucionActiva, setDevolucionActiva] = useState(null);
  const [addGarantiaId, setAddGarantiaId] = useState(null);
  const [gruposEq, setGruposEq] = useState({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [garantiaMonto, setGarantiaMonto] = useState('');
  const [garantiaMetodo, setGarantiaMetodo] = useState('efectivo');
  const [devolverGarantiaId, setDevolverGarantiaId] = useState(null);
  const [calificarContrato, setCalificarContrato] = useState(null);
  const [cancelarReservaId, setCancelarReservaId] = useState(null);
  const [convirtiendo, setConvirtiendo] = useState(null);
  const [eliminandoContrato, setEliminandoContrato] = useState(null);
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [restaurandoContrato, setRestaurandoContrato] = useState(null);
  const [devGarantiaMonto, setDevGarantiaMonto] = useState('');
  const [devGarantiaMetodo, setDevGarantiaMetodo] = useState('efectivo');
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const limite = 20;
  const searchRef = useRef(null);
  const { openDialog, openEditDialog } = useSessions();
  const toast = useToast();

  const cargar = async (paginaNueva, acumular) => {
    if (!window.api) return;
    if (!acumular) setCargando(true);
    else setCargandoMas(true);
    try {
      const p = paginaNueva || pagina;
      const filtros = { busqueda, limite, pagina: p };
      if (estadoFiltro === 'papelera') filtros.papelera = 1;
      const res = await window.api.getContratos(filtros);
      if (res && res.contratos) {
        setTodosContratos(prev => acumular ? [...prev, ...res.contratos] : res.contratos);
        setTotalPaginas(Math.ceil(res.total / limite));
      } else {
        setTodosContratos(acumular ? prev => prev : (res || []));
        setTotalPaginas(0);
      }
    } catch (e) { setError(e.message); }
    finally { setCargando(false); setCargandoMas(false); }
  };

  const recargar = async () => {
    setPagina(1);
    setTodosContratos([]);
    await cargar(1, false);
  };

  const cargarMas = async () => {
    const nextPage = pagina + 1;
    setPagina(nextPage);
    await cargar(nextPage, true);
  };

  const handleAddGarantia = async () => {
    if (!window.api || !addGarantiaId) return;
    const m = parseFloat(garantiaMonto);
    if (!m || m <= 0) return;
    try {
      await window.api.registrarPago({
        idContrato: addGarantiaId,
        monto: m,
        metodo: garantiaMetodo,
        tipo: 'deposito',
      });
      setAddGarantiaId(null);
      setGarantiaMonto('');
      toast('Garantía registrada: S/ ' + m.toFixed(2));
      recargar();
    } catch (e) { setError(e.message); }
  };

  const handleDevolverGarantia = async () => {
    if (!window.api || !devolverGarantiaId) return;
    const m = parseFloat(devGarantiaMonto);
    if (!m || m <= 0) return;
    try {
      await window.api.registrarPago({
        idContrato: devolverGarantiaId,
        monto: m,
        metodo: devGarantiaMetodo,
        tipo: 'devolucion_deposito',
      });
      setDevolverGarantiaId(null);
      setDevGarantiaMonto('');
      toast('Garantía devuelta: S/ ' + m.toFixed(2));
      recargar();
    } catch (e) { setError(e.message); }
  };

  const handleConvertirReserva = async (id) => {
    if (!window.api) return;
    setConvirtiendo(id);
    try {
      await window.api.convertirReserva(id);
      toast('Reserva #' + id + ' convertida a alquiler');
      recargar();
    } catch (e) {
      toast(e.message || 'Error al convertir reserva', 'error');
    } finally {
      setConvirtiendo(null);
    }
  };

  const handleCancelarReserva = async () => {
    if (!window.api || !cancelarReservaId) return;
    try {
      await window.api.cancelarReserva(cancelarReservaId, true);
      toast('Reserva #' + cancelarReservaId + ' cancelada y enviada a la papelera. Adelanto devuelto.');
      setCancelarReservaId(null);
      recargar();
    } catch (e) {
      toast(e.message || 'Error al cancelar reserva', 'error');
    }
  };

  const handleEliminarContrato = async () => {
    if (!window.api || !eliminandoContrato) return;
    try {
      await window.api.eliminarContrato(eliminandoContrato.id, deleteMotivo || 'Sin motivo');
      toast('Contrato #' + eliminandoContrato.id + ' enviado a papelera (7 dias para restaurar).');
      setEliminandoContrato(null);
      setDeleteMotivo('');
      recargar();
    } catch (e) {
      toast(e.message || 'Error al eliminar contrato', 'error');
    }
  };

  const handleRestaurarContrato = async () => {
    if (!window.api || !restaurandoContrato) return;
    try {
      await window.api.restaurarContrato(restaurandoContrato.id);
      toast('Contrato #' + restaurandoContrato.id + ' restaurado exitosamente.');
      setRestaurandoContrato(null);
      recargar();
    } catch (e) {
      toast(e.message || 'Error al restaurar contrato', 'error');
    }
  };

  useEffect(() => { setPagina(1); setTodosContratos([]); cargar(1, false); }, [busqueda, estadoFiltro, refreshTrigger]);

  useEffect(() => {
    const onContratoCreado = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('contrato-creado', onContratoCreado);

    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contrato-creado', onContratoCreado);
    };
  }, []);

  const contratosConPendiente = useMemo(() => {
    return todosContratos.map(c => {
      const dias = Math.max(1, Math.ceil(
        (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
      ) + 1);
      const montoBase = c.total_contrato ? c.total_contrato : (c.subtotal_diario || 0) * dias;
      const total = montoBase + (c.total_atraso || 0) + (c.total_danos || 0) + (c.total_perdidas || 0) + (c.total_ventas || 0);
      const pendiente = Math.max(0, total - (c.total_pagado || 0));
      return { ...c, _pendiente: pendiente };
    });
  }, [todosContratos]);

  const conteo = useMemo(() => {
    const c = {};
    c[''] = contratosConPendiente.length;
    c['deudores'] = contratosConPendiente.filter(x => x._pendiente > 0).length;
    c['atrasado'] = contratosConPendiente.filter(x => x.dias_atraso > 0 && !(x.estado === 'devuelto' && x._pendiente <= 0)).length;
    c['alquilado'] = contratosConPendiente.filter(x => x.estado === 'alquilado').length;
    c['devuelto'] = contratosConPendiente.filter(x => x.estado === 'devuelto' && x._pendiente <= 0).length;
    c['devolucion incompleta'] = contratosConPendiente.filter(x => x.estado === 'devolucion incompleta').length;
    c['reservado'] = contratosConPendiente.filter(x => x.estado === 'reservado').length;
    c['cancelado'] = contratosConPendiente.filter(x => x.estado === 'cancelado').length;
    c['papelera'] = contratosConPendiente.filter(x => x.papelera === 1).length;
    return c;
  }, [contratosConPendiente]);

  const contratosFiltrados = useMemo(() => {
    if (!estadoFiltro) return contratosConPendiente;
    if (estadoFiltro === 'deudores') return contratosConPendiente.filter(c => c._pendiente > 0);
    if (estadoFiltro === 'atrasado') return contratosConPendiente.filter(c => c.dias_atraso > 0 && !(c.estado === 'devuelto' && c._pendiente <= 0));
    if (estadoFiltro === 'devuelto') return contratosConPendiente.filter(c => c.estado === 'devuelto' && c._pendiente <= 0);
    if (estadoFiltro === 'papelera') return contratosConPendiente.filter(c => c.papelera === 1);
    return contratosConPendiente.filter(c => c.estado === estadoFiltro);
  }, [contratosConPendiente, estadoFiltro]);

  const toggleExpand = (id) => setExpandido(prev => prev === id ? null : id);

  return (
    <><style>{`
      .dev-nospin::-webkit-inner-spin-button,
      .dev-nospin::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      .dev-nospin { -moz-appearance: textfield !important; }
    `}</style>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>Alquileres</h1>
          <div className="flex gap-2">
            <Button variant="success" size="sm" onClick={() => openDialog('alquiler')}>
              <Plus size={14} /> Alquilar
            </Button>
            <Button variant="info" size="sm" onClick={() => openDialog('reserva')}>
              <Clock size={14} /> Reservar
            </Button>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
            {error} <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
          </div>
        )}

        <div className="relative max-w-[400px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
          <input ref={searchRef} type="text" placeholder="Buscar por nombre, DNI o codigo..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg text-[13px] border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5" style={{ color: 'var(--faint)' }}>x</button>}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: '', label: 'Todos' },
            { id: 'deudores', label: 'Deudores', danger: true },
            { id: 'atrasado', label: 'Atrasado', danger: true },
            ...['alquilado', 'devuelto', 'devolucion incompleta']
              .filter(e => conteo[e] > 0)
              .map(e => ({ id: e, label: e === 'devolucion incompleta' ? 'Dev. incompleta' : e.charAt(0).toUpperCase() + e.slice(1) })),
            { id: 'reservado', label: 'Reservado', info: true },
          ].map(f => {
            const activo = estadoFiltro === f.id;
            let bgColor = 'var(--surface)';
            let txtColor = 'var(--muted)';
            let bdrColor = '0.5px solid var(--border)';
            if (f.danger) {
              bgColor = 'oklch(0.95 0.015 25)';
              txtColor = 'var(--danger)';
              bdrColor = '0.5px solid var(--danger)';
            } else if (f.info) {
              bgColor = 'oklch(0.93 0.04 240)';
              txtColor = 'var(--info)';
              bdrColor = '0.5px solid var(--info)';
            } else if (f.muted) {
              bgColor = 'oklch(0.90 0.003 60)';
              txtColor = 'var(--muted)';
              bdrColor = '0.5px solid var(--border)';
            }
            if (activo) {
              bgColor = 'var(--ink)';
              txtColor = 'var(--bg)';
              bdrColor = 'none';
            }
            return (
              <button key={f.id} onClick={() => setEstadoFiltro(f.id === estadoFiltro ? '' : f.id)}
                className="flex items-center gap-1 px-3 h-8 rounded-full text-xs font-medium transition-all duration-150"
                style={{
                  backgroundColor: bgColor,
                  color: txtColor,
                  border: bdrColor,
                }}>
                {f.danger && <AlertTriangle size={11} />}
                {f.label}
                {f.id && <span style={{ opacity: 0.7 }}>{conteo[f.id] || 0}</span>}
              </button>
            );
          })}
        </div>

        {cargando ? (
          <p className="text-sm py-12 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
        ) : contratosFiltrados.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay alquileres</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contratosFiltrados.map(c => {
              const isOpen = expandido === c.id;
              const dias = Math.max(1, Math.ceil(
                (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
              ) + 1);
              const montoBase = c.total_contrato ? c.total_contrato : (c.subtotal_diario || 0) * dias; // fallback para contratos viejos
              const montoAtraso = c.total_atraso || 0;
              const totalDanos = c.total_danos || 0;
              const totalPerdidas = c.total_perdidas || 0;
              const totalVentas = c.total_ventas || 0;
              const total = montoBase + montoAtraso + totalDanos + totalPerdidas + totalVentas;
              const pagado = c.total_pagado || 0;
              const garantia = c.garantia_retenida || 0;
              const pendiente = c._pendiente;
              const montoCobrar = Math.max(0, pendiente - garantia);
              const montoDevolver = pendiente <= garantia ? Math.abs(pendiente - garantia) : 0;
              const pagos = c.pagos || [];

              let borderColor = 'var(--border)';
              let badges = [];

              const itemsAtrasados = (c.items || []).filter(i => {
                if (i.id_item_granel) return (i.granel_pendiente || 0) > 0 && (i.dias_atraso_item || 0) > 0;
                return i.estado_devolucion === 'pendiente' && (i.dias_atraso_item || 0) > 0;
              }).length;

              if (c.estado === 'reservado') {
                borderColor = 'var(--info)';
                if (c.fecha_reserva) {
                  badges.push({ text: 'Reservado: ' + fmtFecha(c.fecha_reserva), bg: 'oklch(0.93 0.04 240)', color: 'var(--info)', icon: false });
                } else {
                  badges.push({ text: 'Reservado', bg: 'oklch(0.93 0.04 240)', color: 'var(--info)', icon: false });
                }
              } else if (c.papelera === 1) {
                borderColor = 'oklch(0.40 0.12 25)';
                const diasRest = (() => {
                  if (!c.fecha_papelera) return 7;
                  const fp = new Date(c.fecha_papelera + 'T00:00:00');
                  const hoy = new Date();
                  hoy.setHours(0, 0, 0, 0);
                  const diff = Math.floor((hoy - fp) / 86400000);
                  return Math.max(0, 7 - diff);
                })();
                badges.push({ text: `Papelera · ${diasRest} dia${diasRest !== 1 ? 's' : ''} restante${diasRest !== 1 ? 's' : ''}`, bg: 'oklch(0.93 0.02 25)', color: 'var(--danger)', icon: true });
              } else if (c.estado === 'cancelado') {
                borderColor = 'var(--muted)';
                badges.push({ text: 'Reserva cancelada', bg: 'oklch(0.90 0.003 60)', color: 'var(--muted)', icon: false });
              } else if (c.estado === 'devuelto' && pendiente <= 0) {
                borderColor = 'var(--muted)';
              } else if (c.estado === 'devolución incompleta' || (c.estado === 'devuelto' && pendiente > 0)) {
                borderColor = 'var(--danger)';
                if (itemsAtrasados > 0) {
                  badges.push({ text: `Atrasado ${itemsAtrasados} herramienta${itemsAtrasados !== 1 ? 's' : ''}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                }
                if (pendiente > 0) {
                  badges.push({ text: `Debe S/ ${pendiente.toFixed(2)}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                }
              } else if (c.estado === 'atrasado' || c.dias_atraso > 0) {
                borderColor = 'var(--danger)';
                badges.push({ text: `Atrasado ${itemsAtrasados} herramienta${itemsAtrasados !== 1 ? 's' : ''}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                if (pendiente > 0) {
                  badges.push({ text: `Debe S/ ${pendiente.toFixed(2)}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                }
              } else if (pendiente > 0 || itemsAtrasados > 0) {
                borderColor = 'var(--danger)';
                if (itemsAtrasados > 0) {
                  badges.push({ text: `Atrasado ${itemsAtrasados} herramienta${itemsAtrasados !== 1 ? 's' : ''}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                }
                if (pendiente > 0) {
                  badges.push({ text: `Debe S/ ${pendiente.toFixed(2)}`, bg: 'oklch(0.95 0.015 25)', color: 'var(--danger)', icon: true });
                }
              } else {
                borderColor = 'var(--success)';
              }

              return (
                <div key={c.id} className="overflow-hidden"
                  style={{ border: '0.5px solid var(--border)', borderLeft: '3px solid ' + borderColor }}>
                  <button onClick={() => toggleExpand(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ backgroundColor: 'var(--bg)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</p>
                        {c.cliente_telefono && (
                          <span className="text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>{c.cliente_telefono}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
                        {c.etiquetas?.length > 0 && (
                          <>
                            {c.etiquetas.slice(0, 2).map((t) => <TagChip key={t.id} tag={t} />)}
                            {c.etiquetas.length > 2 && (
                              <span className="text-[9px] font-semibold" style={{ color: 'var(--faint)' }}>+{c.etiquetas.length - 2}</span>
                            )}
                          </>
                        )}
                        {c.cliente_dni && (
                          <span className="px-2 py-0.5 rounded-[10px] text-[11px] font-mono font-semibold"
                            style={{ backgroundColor: 'oklch(0.50 0.13 240)', color: '#fff' }}>
                            DNI {c.cliente_dni}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[11px]"
                          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                          {fmtFechaCorta(c.fecha_salida)} &mdash; {fmtFecha(c.fecha_devolucion_pactada)}
                        </span>
                        {badges.length > 0 && (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            {badges.map((b, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] text-[11px] font-medium"
                                style={{ backgroundColor: b.bg, color: b.color }}>
                                {b.icon && <AlertTriangle size={11} />}
                                {b.text}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[15px] font-medium shrink-0" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
                    <ChevronDown size={16} className="shrink-0 transition-transform duration-200"
                      style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                  </button>

                  {/* ACORDEON CON ANIMACION GRID */}
                  <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ borderTop: '0.5px solid var(--border)', backgroundColor: 'var(--surface)' }}>
                        {devolucionActiva === c.id ? (
                          <DevolucionInline contrato={c} onClose={() => setDevolucionActiva(null)} onRecargar={recargar} />
                        ) : (
                          <>
                            {/* ===== FILA: EQUIPOS + CAJA ===== */}
                            <div className="grid grid-cols-[3fr_2fr] min-h-0">

                              {/* ===== COLUMNA IZQUIERDA: EQUIPOS ===== */}
                              <div className="px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wider font-semibold pb-1.5 mb-3"
                                  style={{ color: 'var(--muted)', borderBottom: '1.5px solid oklch(0.50 0.11 240)' }}>
                                  Equipos
                                </p>
                                {c.items?.length === 0 ? (
                                  <p className="text-xs" style={{ color: 'var(--faint)' }}>Sin equipos registrados</p>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                                      Tarifa diaria total: S/ {(c.subtotal_diario || 0).toFixed(2)}
                                    </p>
{(() => {
                                          const baseCache = {};
                                          const getBase = (item) => {
                                            if (!baseCache[item.id]) baseCache[item.id] = baseItem(item, c);
                                            return baseCache[item.id];
                                          };
                                          const renderEquipoFila = (item, idx, filaKey, sub) => {
                                            const esGranel = !!item.item_condicion;
                                            return (
                                          <div key={filaKey} className="space-y-0.5">
                                            {/* Fila 1: Badge + Nombre + Tarifa + Atraso badge */}
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {!esGranel ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                                                  style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                                                  {item.item_codigo}
                                                </span>
                                              ) : (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                                  style={{
                                                    backgroundColor: item.item_condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                                                    color: item.item_condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)',
                                                  }}>x{item.cantidad}</span>
                                              )}
                                              <span className="text-[13px] leading-tight font-semibold" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                                              <span className="text-[10px] shrink-0" style={{ color: 'var(--faint)' }}>
                                                S/ {(item.precio_dia_aplicado || 0).toFixed(2)}{item.tarifa_aplicada === 'mes' ? '/mes' : '/día'}{esGranel ? ' c/u' : ''}
                                              </span>
                                              {(item.dias_atraso_item || 0) > 0 && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                                  style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>
                                                  &#9888; +{item.dias_atraso_item} d&iacute;a{item.dias_atraso_item !== 1 ? 's' : ''}
                                                </span>
                                              )}
                                              {item.estado_devolucion && item.estado_devolucion !== 'pendiente' && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                                  style={{
                                                    backgroundColor: item.estado_devolucion === 'bien' ? 'oklch(0.93 0.05 160)' : item.estado_devolucion === 'no devuelto' || item.estado_devolucion === 'perdido' ? 'oklch(0.95 0.03 25)' : item.estado_devolucion === 'vendido' ? 'oklch(0.93 0.05 250)' : 'oklch(0.93 0.05 75)',
                                                    color: item.estado_devolucion === 'bien' ? 'var(--success)' : item.estado_devolucion === 'no devuelto' || item.estado_devolucion === 'perdido' ? 'var(--danger)' : item.estado_devolucion === 'vendido' ? 'oklch(0.45 0.13 250)' : 'var(--warning)',
                                                  }}>
                                                  {item.estado_devolucion === 'bien' ? '\u2713 Devuelto' : item.estado_devolucion === 'no devuelto' || item.estado_devolucion === 'perdido' ? 'Perdido' : item.estado_devolucion === 'vendido' ? 'Vendido' : 'Da\u00f1ado'}
                                                  {item.danos_devueltos && item.danos_devueltos.length > 0 && (
                                                    <span className="ml-1" style={{ color: 'var(--faint)' }}>
                                                      {item.danos_devueltos.map(d => d.nombre).join(', ')}
                                                    </span>
                                                  )}
                                                </span>
                                              )}
                                            </div>
                                            {/* Fila 2: Fechas */}
                                            <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                              <span />
                                              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                                                Salida: {fmtFechaCorta(c.fecha_salida)} &middot; Pactada: {fmtFechaCorta(item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada)}
                                                &middot; Base: {item.tarifa_aplicada === 'mes' && (item.meses_item || 0) > 0
                                                  ? `${item.meses_item} mes${item.meses_item !== 1 ? 'es' : ''}${(item.dias_extra_item || 0) > 0 ? ` + ${item.dias_extra_item} día${item.dias_extra_item !== 1 ? 's' : ''}` : ''} (${item.dias_habiles_item || item.dias_item || 0} día${(item.dias_habiles_item || item.dias_item || 0) !== 1 ? 's' : ''} sin dom.)`
                                                  : (item.dias_habiles_item || item.dias_item || 0) + ' día' + ((item.dias_habiles_item || item.dias_item || 0) !== 1 ? 's' : '') + ' sin dom.'}
                                              </span>
                                            </div>
                                            {/* Granel: resumen devolución */}
                                            {esGranel && (item.granel_dev_bien || item.granel_dev_danada || item.granel_dev_perdida || 0) > 0 && (
                                              <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                                <span />
                                                <span className="text-[11px] flex items-center gap-2">
                                                  <span style={{ color: 'var(--muted)' }}>Dev:</span>
                                                  {(item.granel_dev_bien || 0) > 0 && <span style={{ color: 'var(--success)' }}>{item.granel_dev_bien} bien</span>}
                                                  {(item.granel_dev_danada || 0) > 0 && <span style={{ color: 'oklch(0.55 0.13 70)' }}>{item.granel_dev_danada} dañ</span>}
                                                  {(item.granel_dev_perdida || 0) > 0 && <span style={{ color: 'var(--danger)' }}>{item.granel_dev_perdida} perd</span>}
                                                  {(item.granel_pendiente || 0) > 0 && <span style={{ color: 'var(--faint)' }}>pend: {item.granel_pendiente}</span>}
                                                  {(item.granel_pendiente === 0) && <span className="font-medium" style={{ color: 'var(--success)' }}>Completo</span>}
                                                </span>
                                                <span />
                                              </div>
                                            )}
                                            {item.estado_devolucion === 'vendido' && item.costo_perdida > 0 && (
  <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
    <span />
    <span className="text-[11px]" style={{ color: 'oklch(0.45 0.13 250)' }}>
      Venta: S/ {(item.costo_perdida || 0).toFixed(0)}
    </span>
    <span className="font-mono tabular-nums text-[12px] font-bold" style={{ color: 'oklch(0.45 0.13 250)' }}>
      S/ {(item.costo_perdida || 0).toFixed(2)}
    </span>
  </div>
)}
{/* Fila 3: Base S/ + Mora + Total */}
<div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                              <span />
                                              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                                                Base S/ {getBase(item).toFixed(0)}
                                                {(item.dias_atraso_item || 0) > 0 && (
                                                  <span style={{ color: 'var(--danger)' }}> + Mora S/ {(item.monto_atraso_item || 0).toFixed(0)}</span>
                                                )}
                                              </span>
                                              <span className="font-mono tabular-nums text-[12px] font-bold" style={{ color: 'var(--ink)' }}>
                                                S/ {sub.toFixed(2)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      };
                                      const filas = [];
                                      const porPrefijo = new Map();
                                      (c.items || []).forEach((item, idx) => {
                                        const esGranelI = !!item.item_condicion;
                                        const esIndividual = !esGranelI && item.item_codigo && /^[A-Za-z]+\-\d+/.test(item.item_codigo);
                                        if (esIndividual) {
                                          const prefix = item.item_codigo.split('-')[0];
                                          let g = porPrefijo.get(prefix);
                                          if (!g) { g = { prefix, nombre: item.item_nombre, items: [] }; porPrefijo.set(prefix, g); filas.push(g); }
                                          g.items.push({ item, idx });
                                        } else {
                                          filas.push({ prefix: null, items: [{ item, idx }] });
                                        }
                                      });
return filas.map((g, gi) => {
        if (g.prefix === null) {
          const { item, idx } = g.items[0];
          const sub = getBase(item) + (item.monto_atraso_item || 0);
          return renderEquipoFila(item, idx, 'u-' + idx, sub);
        }
        const key = c.id + '|' + g.prefix;
        const abierto = !!gruposEq[key];
        const totalGrupo = g.items.reduce((a, { item }) => a + (getBase(item) + (item.monto_atraso_item || 0)), 0);
                                        const pendientes = g.items.filter(({ item }) => !item.estado_devolucion || item.estado_devolucion === 'pendiente').length;
                                        return (
                                          <div key={gi} className="rounded-xl transition-colors duration-150 overflow-hidden"
                                            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                                            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                                              onClick={() => setGruposEq(p => ({ ...p, [key]: !p[key] }))}>
                                              <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--muted)', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                                              <span className="flex-1 min-w-0 text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                                                {g.nombre}
                                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-lg font-bold align-middle"
                                                  style={{ backgroundColor: 'oklch(0.40 0.12 240 / 0.12)', color: 'var(--info)' }}>&times;{g.items.length}</span>
                                              </span>
                                              {pendientes > 0 ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                                  style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>{pendientes} pendiente{pendientes !== 1 ? 's' : ''}</span>
                                              ) : (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                                  style={{ backgroundColor: 'oklch(0.93 0.05 160)', color: 'var(--success)' }}>Completo</span>
                                              )}
                                              <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: 'var(--ink)' }}>S/ {totalGrupo.toFixed(2)}</span>
                                            </div>
                                            {abierto && (
                                              <div className="px-2 pb-2 space-y-1.5">
                                                {g.items.map(({ item, idx }) => {
                    const sub = getBase(item) + (item.monto_atraso_item || 0);
                    return renderEquipoFila(item, idx, g.prefix + '-' + idx, sub);
                  })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* ===== COLUMNA DERECHA: CAJA ===== */}
                              <div className="px-4 py-3" style={{ borderLeft: '0.5px solid var(--border)' }}>
                                <p className="text-[11px] uppercase tracking-wider font-semibold pb-1.5 mb-3"
                                  style={{ color: 'var(--muted)', borderBottom: '1.5px solid oklch(0.53 0.135 55)' }}>
                                  Caja
                                </p>
                                <div className="space-y-1.5 mb-3">
                                  {/* Alquiler base */}
                                  <div className="flex justify-between items-baseline text-xs">
                                    <span style={{ color: 'var(--muted)' }}>Alquiler base ({dias} d&iacute;a{dias !== 1 ? 's' : ''})</span>
                                    <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {(montoBase || 0).toFixed(2)}</span>
                                  </div>
                                  {/* Atraso */}
                                  {montoAtraso > 0 && (
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span style={{ color: 'var(--danger)' }}>Recargos por atraso</span>
                                      <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {montoAtraso.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {/* Daños */}
                                  {totalDanos > 0 && (
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                                      <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>+ S/ {totalDanos.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {/* Ventas */}
                                  {totalVentas > 0 && (
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span style={{ color: 'oklch(0.45 0.15 250)' }}>Cobro por venta de herramienta</span>
                                      <span className="font-mono tabular-nums" style={{ color: 'oklch(0.45 0.15 250)' }}>+ S/ {totalVentas.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {/* Pérdidas */}
                                  {totalPerdidas > 0 && (
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span style={{ color: 'var(--danger)' }}>Cobro por pérdidas</span>
                                      <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {totalPerdidas.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {/* Deposito */}
                                  {(c.deposito_monto || 0) > 0 && (
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span style={{ color: 'var(--muted)' }}>Dep&oacute;sito</span>
                                      <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {(c.deposito_monto || 0).toFixed(2)}</span>
                                    </div>
                                  )}
                                  {/* Divider */}
                                  <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
                                  {/* Total a pagar */}
                                  <div className="flex justify-between items-baseline text-xs font-semibold">
                                    <span style={{ color: 'var(--ink)' }}>Total a pagar</span>
                                    <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
                                  </div>
                                  {/* Pagado */}
                                  <div className="flex justify-between items-baseline text-xs">
                                    <span style={{ color: 'var(--muted)' }}>Pagado a la fecha</span>
                                    <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {pagado.toFixed(2)}</span>
                                  </div>
                                  {/* Thicker divider */}
                                  <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
                                  {/* SALDO PENDIENTE */}
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
                                    <span className="font-mono tabular-nums font-bold text-sm" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                      S/ {pendiente.toFixed(2)}
                                    </span>
                                  </div>
                                  {/* Garantía + botón añadir + botón devolver */}
                                  <div className="flex justify-between items-baseline text-xs">
                                    <span style={{ color: 'var(--muted)' }}>
                                      {garantia > 0 ? 'Garantía disponible' : 'Sin garantía'}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {garantia > 0 && <span className="font-mono" style={{ color: 'var(--info)' }}>S/ {garantia.toFixed(2)}</span>}
                                      {garantia > 0 && (
                                        <button onClick={() => setDevolverGarantiaId(devolverGarantiaId === c.id ? null : c.id)}
                                          className="text-[11px] underline font-medium hover:opacity-70 shrink-0"
                                          style={{ color: 'var(--danger)' }}>
                                          Devolver
                                        </button>
                                      )}
                                      <button onClick={() => setAddGarantiaId(addGarantiaId === c.id ? null : c.id)}
                                        className="text-[11px] underline font-medium hover:opacity-70 shrink-0"
                                        style={{ color: 'var(--success)' }}>
                                        + {garantia > 0 ? 'Añadir' : 'Registrar garantía'}
                                      </button>
                                    </div>
                                  </div>
                                  {/* Formulario añadir garantía */}
                                  {addGarantiaId === c.id && (
                                    <div className="flex items-center gap-1 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                                      {['efectivo', 'yape', 'plin'].map(m => (
                                        <button key={m} onClick={() => setGarantiaMetodo(m)}
                                          className="h-6 px-1.5 rounded text-[9px] font-medium transition-all duration-150"
                                          style={{
                                            backgroundColor: garantiaMetodo === m ? 'oklch(0.55 0.13 155)' : 'var(--surface)',
                                            color: garantiaMetodo === m ? '#fff' : 'var(--muted)',
                                            border: '0.5px solid var(--border)',
                                          }}>{m}</button>
                                      ))}
                                      <input type="number" step="1" min="1" value={garantiaMonto}
                                        placeholder="S/"
                                        onChange={e => setGarantiaMonto(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddGarantia(); }}
                                        className="w-16 h-6 px-1 rounded text-[10px] border font-mono text-center dev-nospin"
                                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                                      <button onClick={handleAddGarantia}
                                        className="h-6 px-2 rounded text-[10px] font-semibold transition-all duration-150 active:scale-[0.97]"
                                        style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}>+</button>
                                    </div>
                                  )}
                                  {/* Panel devolver garantía */}
                                  {devolverGarantiaId === c.id && (
                                    <div className="flex items-center gap-1 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                                      <span className="text-[10px]" style={{ color: 'var(--danger)' }}>Devolver S/</span>
                                      <input type="number" step="1" min="1" max={garantia} value={devGarantiaMonto}
                                        placeholder={garantia.toFixed(0)}
                                        onChange={e => setDevGarantiaMonto(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleDevolverGarantia(); }}
                                        className="w-16 h-6 px-1 rounded text-[10px] border font-mono text-center dev-nospin"
                                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--danger)' }} />
                                      {['efectivo', 'yape', 'plin'].map(m => (
                                        <button key={m} onClick={() => setDevGarantiaMetodo(m)}
                                          className="h-6 px-1.5 rounded text-[9px] font-medium transition-all duration-150"
                                          style={{
                                            backgroundColor: devGarantiaMetodo === m ? 'oklch(0.55 0.13 155)' : 'var(--surface)',
                                            color: devGarantiaMetodo === m ? '#fff' : 'var(--muted)',
                                            border: '0.5px solid var(--border)',
                                          }}>{m}</button>
                                      ))}
                                      <button onClick={handleDevolverGarantia}
                                        className="h-6 px-2 rounded text-[10px] font-semibold transition-all duration-150 active:scale-[0.97]"
                                        style={{ backgroundColor: 'var(--danger)', color: '#fff', border: 'none' }}>&#10003;</button>
                                    </div>
                                  )}
                                </div>
                                {pendiente > 0 && (
                                  <div className="mb-3">
                                    <button
                                      onClick={() => setPagoModalContrato(c)}
                                      className="w-full h-8 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-1.5"
                                      style={{
                                        backgroundColor: 'var(--success)',
                                        color: '#fff',
                                        border: 'none',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}
                                    >
                                      Pagar pendiente
                                    </button>
                                  </div>
                                )}
                                {/* Historial de pagos */}
                                <div className="rounded-lg mt-3" style={{ border: '0.5px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                                  <button
                                    onClick={() => setHistorialAbierto(historialAbierto === c.id ? null : c.id)}
                                    className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:opacity-80 rounded-lg"
                                    style={{ color: 'var(--muted)' }}>
                                    <ChevronRight size={11}
                                      style={{ transform: historialAbierto === c.id ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                                    Historial de pagos{pagos.length > 0 ? ` (${pagos.length})` : ''}
                                  </button>
                                  {historialAbierto === c.id && (
                                    <div className="px-2.5 pb-1.5 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
                                      {pagos.length === 0 ? (
                                        <p className="pt-1.5 text-[11px]" style={{ color: 'var(--faint)' }}>Sin pagos registrados</p>
                                      ) : (
                                        (() => {
                                          const pagosAgrupados = gruparPagos(pagos);
                                          return pagosAgrupados.map((p, idx) => {
                                            const esDeposito = p.tipo === 'deposito';
                                            const esDevolucionDeposito = p.tipo === 'devolucion_deposito';
                                            const esGrupo = p.esGrupo;
                                            const colorMetodo = esDeposito ? 'oklch(0.55 0.12 70)' :
                                              esDevolucionDeposito ? 'var(--danger)' :
                                                p.metodo === 'efectivo' ? 'oklch(0.55 0.13 155)' :
                                                  p.metodo === 'yape' ? 'oklch(0.48 0.14 330)' : 'oklch(0.55 0.12 240)';
                                            const labelMetodo = esDeposito ? 'Garantia +' :
                                              esDevolucionDeposito ? 'Garantia -' :
                                                esGrupo ? p.metodo + ' (distribuido)' :
                                                  p.metodo;
                                            return (
                                              <div key={idx} className="flex items-center gap-2 pt-1.5 text-[11px]"
                                                style={{ opacity: p.anulado === 1 ? 0.35 : 1 }}>
                                                <span className="shrink-0" style={{ color: 'var(--muted)' }}>{p.fecha_pago?.slice(5, 10) || '—'}</span>
                                                <span className="font-mono font-medium flex-1" style={{
                                                  color: 'var(--ink)',
                                                  textDecoration: p.anulado === 1 ? 'line-through' : 'none',
                                                }}>
                                                  S/ {p.monto.toFixed(2)}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-[10px] text-[9px] font-medium capitalize"
                                                  style={{ backgroundColor: colorMetodo + '20', color: colorMetodo }}>
                                                  {labelMetodo}
                                                </span>
                                                {p.anulado === 1
                                                  ? <span className="text-[9px] shrink-0" style={{ color: 'var(--muted)' }}>Anulado</span>
                                                  : <button onClick={() => setAnulandoPago(p)}
                                                    className="text-[9px] underline hover:opacity-70 shrink-0"
                                                    style={{ color: 'var(--danger)' }}>Anular</button>
                                                }
                                              </div>
                                            );
                                          });
                                        })()
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                            </div>

                             {/* ===== ACCIONES ===== */}
                             <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                               <button
                                 onClick={async () => {
                                   if (!window.api) return;
                                   try {
                                     const pdfPath = await window.api.generarContratoPdf(c.id);
                                     const b64 = await window.api.leerArchivoBase64(pdfPath);
                                     setPdfPreviewUrl('data:application/pdf;base64,' + b64);
                                   } catch (e) {
                                     toast('Error al abrir contrato', 'error');
                                   }
                                 }}
                                 className="flex-1 h-[34px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                                 style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
                                 onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
                                 onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                               >
                                 <FileText size={12} /> Ver contrato
                               </button>
                               {c.papelera === 1 ? (
                                 <button
                                   onClick={() => setRestaurandoContrato(c)}
                                   className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                   style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
                                   onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                                   onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}
                                 >
                                   <RotateCcw size={12} /> Restaurar
                                 </button>
                               ) : c.estado === 'reservado' ? (
                                 <>
                                   <button
                                      onClick={() => openEditDialog(c)}
                                     className="flex-1 h-[34px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                                     style={{ backgroundColor: 'var(--surface)', color: 'var(--info)', border: '0.5px solid var(--info)' }}
                                     onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.93 0.04 240)'; }}
                                     onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                                   >
                                     <Edit size={12} /> Editar
                                   </button>
                                   <button
                                     onClick={() => handleConvertirReserva(c.id)}
                                     disabled={convirtiendo === c.id}
                                     className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                     style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none', opacity: convirtiendo === c.id ? 0.6 : 1 }}
                                     onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                                     onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}
                                   >
                                     {convirtiendo === c.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                     Alquilar
                                   </button>
                                   <button
                                     onClick={() => setCancelarReservaId(c.id)}
                                     className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                     style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)', border: '0.5px solid var(--danger)' }}
                                     onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.90 0.04 25)'; }}
                                     onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.95 0.02 25)'; }}
                                   >
                                     <Ban size={12} /> Cancelar Reserva
                                   </button>
                                 </>
) : (
                                  <>
                                    <button
                                      onClick={() => openEditDialog(c)}
                                      className="flex-1 h-[34px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                                      style={{ backgroundColor: 'var(--surface)', color: 'var(--info)', border: '0.5px solid var(--info)' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.93 0.04 240)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                                    >
                                      <Edit size={12} /> Editar
                                    </button>
                                    <button
                                      onClick={() => setEliminandoContrato(c)}
                                      className="flex-1 h-[34px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                                      style={{ backgroundColor: 'var(--surface)', color: 'var(--danger)', border: '0.5px solid var(--danger)' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.95 0.02 25)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                                    >
                                      <Trash2 size={12} /> Eliminar
                                    </button>
                                    <button
                                      onClick={() => setCalificarContrato(c)}
                                      className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                      style={{ backgroundColor: 'oklch(0.62 0.17 80 / 0.12)', color: 'oklch(0.52 0.17 80)', border: '0.5px solid oklch(0.62 0.17 80 / 0.3)' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.62 0.17 80 / 0.2)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.62 0.17 80 / 0.12)'; }}
                                    >
                                      <Star size={12} /> Calificar
                                    </button>
                                    <button
                                      onClick={() => setDevolucionActiva(devolucionActiva === c.id ? null : c.id)}
                                      className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                      style={{ backgroundColor: devolucionActiva === c.id ? 'var(--danger)' : 'oklch(0.53 0.135 55)', color: '#fff', border: 'none' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = devolucionActiva === c.id ? 'oklch(0.40 0.14 25)' : 'oklch(0.43 0.14 55)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = devolucionActiva === c.id ? 'var(--danger)' : 'oklch(0.53 0.135 55)'; }}
                                    >
                                      {devolucionActiva === c.id ? <X size={12} /> : (pendiente > 0 && <AlertTriangle size={12} />)}
                                      {devolucionActiva === c.id ? 'Cancelar devolución' : 'Devolución' + (pendiente > 0 ? ' (con deuda)' : '')} <ArrowRight size={12} />
                                    </button>
                                  </>
                                )}
                             </div>
                          </>)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Botón Cargar más */}
        {pagina < totalPaginas && !cargando && (
          <div className="flex justify-center py-4">
            <button
              onClick={cargarMas}
              disabled={cargandoMas}
              className="px-6 py-2 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
              style={{ backgroundColor: 'var(--info)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.45 0.13 240)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--info)'; }}
            >
              {cargandoMas ? 'Cargando...' : 'Cargar más contratos'}
            </button>
          </div>
        )}
        {pagina >= totalPaginas && totalPaginas > 0 && !cargando && (
          <p className="text-center text-xs py-3" style={{ color: 'var(--faint)' }}>Mostrando todos los contratos</p>
        )}

        {pagoModalContrato && (
          <UnifiedPaymentModal
            tipo="total"
            contrato={pagoModalContrato}
            onClose={() => setPagoModalContrato(null)}
            onConfirm={() => { setPagoModalContrato(null); recargar(); }}
          />
        )}

        {anulandoPago && (
          <AnularPagoModal
            pago={anulandoPago}
            onClose={() => setAnulandoPago(null)}
            onConfirm={() => { setAnulandoPago(null); recargar(); }}
          />
        )}

        {pdfPreviewUrl && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ backgroundColor: 'oklch(0 0 0 / 0.6)' }} onClick={() => setPdfPreviewUrl(null)}>
            <div className="w-[95vw] h-[95vh] max-w-[1100px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              style={{ backgroundColor: 'var(--bg)' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Contrato</span>
                <button onClick={() => setPdfPreviewUrl(null)}
                  className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
                  <X size={16} />
                </button>
              </div>
              <embed src={pdfPreviewUrl} type="application/pdf" className="flex-1 w-full border-0" />
            </div>
          </div>
        )}

        {calificarContrato && (
          <CalificarContratoModal
            idContrato={calificarContrato.id}
            idCliente={calificarContrato.id_cliente}
            onClose={() => setCalificarContrato(null)}
            onGuardado={() => { recargar(); toast('Calificacion guardada'); }}
          />
        )}

        {eliminandoContrato && (
          <ConfirmModal
            open={!!eliminandoContrato}
            title="Eliminar contrato"
            message={`Esta seguro de enviar el contrato #${eliminandoContrato.id} a la papelera?`}
            confirmLabel="Enviar a papelera"
            danger
            onConfirm={handleEliminarContrato}
            onCancel={() => { setEliminandoContrato(null); setDeleteMotivo(''); }}
          >
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={deleteMotivo}
                onChange={e => setDeleteMotivo(e.target.value)}
                placeholder="Ej: Error al registrar, duplicado..."
                className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
                style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
              />
            </div>
          </ConfirmModal>
        )}

        {restaurandoContrato && (
          <ConfirmModal
            open={!!restaurandoContrato}
            title="Restaurar contrato"
            message={`Desea restaurar el contrato #${restaurandoContrato.id} desde la papelera? Las herramientas volveran al estado que tenian.`}
            confirmLabel="Restaurar"
            onConfirm={handleRestaurarContrato}
            onCancel={() => setRestaurandoContrato(null)}
          />
        )}

        {cancelarReservaId && (
          <ConfirmModal
            open={!!cancelarReservaId}
            title="Cancelar reserva"
            message={`¿Está segura de cancelar la reserva #${cancelarReservaId}? Se enviará a la papelera y las herramientas volverán a estar disponibles. Los adelantos serán devueltos.`}
            confirmLabel="Cancelar Reserva"
            danger
            onConfirm={handleCancelarReserva}
            onCancel={() => setCancelarReservaId(null)}
          />
        )}
      </div>
    </>
  );
}
