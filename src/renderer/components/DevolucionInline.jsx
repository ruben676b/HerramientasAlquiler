import { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Minus, Plus, ChevronRight, Clock } from 'lucide-react';
import { useToast } from './Toast';
import UnifiedPaymentModal from './UnifiedPaymentModal';
import AnularPagoModal from './AnularPagoModal';
import { gruparPagos } from '../lib/gruparPagos';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()];
};

const ESTADOS_OPC = [
  { id: 'bien', label: 'Bien', icon: CheckCircle, bg: 'oklch(0.50 0.13 155)', ink: '#fff' },
  { id: 'dañado', label: 'Dañado', icon: AlertTriangle, bg: 'oklch(0.55 0.13 70)', ink: '#fff' },
];

export default function DevolucionInline({ contrato, onClose, onRecargar }) {
  const toast = useToast();
  const [estados, setEstados] = useState({});
  const [notas, setNotas] = useState({});
  const [costosRep, setCostosRep] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [morasEditadas, setMoraEditadas] = useState({});
  const [editandoMora, setEditandoMora] = useState({});
  const [editandoCant, setEditandoCant] = useState({});
  const inputCantRefs = useRef({});
  const [mostrarPago, setMostrarPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [pagoMonto, setPagoMonto] = useState('');
  const [error, setError] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [guardados, setGuardados] = useState({});
  const [pagoItemState, setPagoItemState] = useState(null);
  const [anulandoPago, setAnulandoPago] = useState(null);
  const [historialItemAbierto, setHistorialItemAbierto] = useState({});
  const [historialPagosAbierto, setHistorialPagosAbierto] = useState(false);
  const [devolviendoGarantia, setDevolviendoGarantia] = useState(false);
  const [devGarMonto, setDevGarMonto] = useState('');
  const [devGarMetodo, setDevGarMetodo] = useState('efectivo');
  // Estado para multi-outcome en materiales (granel)
  const [buenas, setBuenas] = useState({});
  const [danadas, setDanadas] = useState({});
  const [perdidas, setPerdidas] = useState({});
  const [costosPerdida, setCostosPerdida] = useState({});
  const [editandoCostoPerd, setEditandoCostoPerd] = useState({});
  const [editandoCantGranel, setEditandoCantGranel] = useState({});
  const [costoPerdManual, setCostoPerdManual] = useState({});
  const savingRef = useRef({});
  const guardadosRef = useRef({});
  const dirtyRef = useRef({});
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // Estado para historial de DEVOLUCION_GRANEL
  const [historialGranelAbierto, setHistorialGranelAbierto] = useState({});
  const [devolucionesGranel, setDevolucionesGranel] = useState({});
  const [cargandoHistorial, setCargandoHistorial] = useState({});

  const cargarHistorialGranel = async (idx, item) => {
    if (!window.api || !item.id_item_granel) return;
    if (devolucionesGranel[idx]) return; // ya cargado
    setCargandoHistorial(p => ({ ...p, [idx]: true }));
    try {
      const rows = await window.api.getDevolucionesGranel(c.id, item.id_item_granel);
      setDevolucionesGranel(p => ({ ...p, [idx]: rows }));
    } catch (e) {
      console.error('Error cargando historial granel:', e);
    } finally {
      setCargandoHistorial(p => ({ ...p, [idx]: false }));
    }
  };

  const handleDeshacerGranel = async (idDevolucionGranel, idx) => {
    if (!window.api) return;
    try {
      await window.api.revertirDevolucionGranel(idDevolucionGranel);
      // Limpiar caché y recargar historial
      setDevolucionesGranel(p => { const n = { ...p }; delete n[idx]; return n; });
      toast('Devolución revertida');
      onRecargar();
      // Recargar historial automáticamente
      const item = items[idx];
      if (item) cargarHistorialGranel(idx, item);
    } catch (e) {
      toast('Error al revertir: ' + (e.message || e), 'error');
    }
  };

  const c = contrato;
  const items = c.items || [];
  useEffect(() => {
    const init = {};
    items.forEach((item, idx) => {
      if (!item.id_item_granel && item.estado_devolucion && item.estado_devolucion !== 'pendiente') {
        init[idx] = true;
        guardadosRef.current[idx] = true;
      }
    });
    if (Object.keys(init).length) setGuardados(init);
  }, []);
  const pagos = c.pagos || [];
  const totalPagado = c.total_pagado || 0;
  const garantia = c.garantia_retenida || 0;

  const dias = Math.max(1, Math.ceil(
    (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);
  const montoBase = c.total_contrato ? c.total_contrato : ((c.subtotal_diario || 0) * dias);
  
  // Sumar mora sugerida de todos los ítems (usando cantidad original, no la devolución)
  const montoAtraso = items.reduce((sum, item, idx) => {
    const sugerida = (item.dias_atraso_item || 0) * (item.precio_dia_aplicado || 0) * item.cantidad;
    return sum + (morasEditadas[idx] != null ? morasEditadas[idx] : sugerida);
  }, 0);

  const costosDanosBackend = items.reduce((s, i) => s + (i.granel_dev_costo_reparacion || 0), 0);
  const costosPerdBackend = items.reduce((s, i) => s + (i.granel_dev_costo_perdida || 0), 0);
  const costosDanosLocal = Object.entries(costosRep).reduce((a, [idx, v]) => {
    if (estados[idx] === 'dañado' && v > 0) return a + parseFloat(v);
    return a;
  }, 0);
  const costosPerdLocal = Object.values(costosPerdida).reduce((a, v) => a + (parseFloat(v) || 0), 0);
  const totalDanos = costosDanosBackend + costosDanosLocal;
  const totalPerdidas = costosPerdBackend + costosPerdLocal;
  const totalCargosExtra = totalDanos + totalPerdidas;

  const total = montoBase + montoAtraso + totalCargosExtra + (c.deposito_monto || 0);
  const pendiente = Math.max(0, total - totalPagado);
  const montoCobrar = Math.max(0, pendiente - garantia);
  const montoDevolver = pendiente <= garantia ? Math.abs(pendiente - garantia) : 0;

  const handleDevolverGarantia = async () => {
    if (!window.api) return;
    const m = parseFloat(devGarMonto);
    if (!m || m <= 0) return;
    setCobrando(true);
    try {
      await window.api.registrarPago({
        idContrato: c.id,
        monto: m,
        metodo: devGarMetodo,
        tipo: 'devolucion_deposito',
      });
      setDevolviendoGarantia(false);
      setDevGarMonto('');
      toast('Garantía devuelta: S/ ' + m.toFixed(2));
      onRecargar();
    } catch (e) { toast(e.message || 'Error', 'error'); }
    finally { setCobrando(false); }
  };

  const handleDeshacer = async (idx) => {
    if (!window.api) return;
    try {
      await window.api.revertirDevolucion({ idDetalle: items[idx].id });
      setGuardados(p => { const n = { ...p }; delete n[idx]; return n; });
      setEstados(p => { const n = { ...p }; delete n[idx]; return n; });
      // Limpiar estado granel asociado
      setBuenas(p => { const n = { ...p }; delete n[idx]; return n; });
      setDanadas(p => { const n = { ...p }; delete n[idx]; return n; });
      setPerdidas(p => { const n = { ...p }; delete n[idx]; return n; });
      setCostosPerdida(p => { const n = { ...p }; delete n[idx]; return n; });
      setCostosRep(p => { const n = { ...p }; delete n[idx]; return n; });
      delete guardadosRef.current[idx];
      toast('Devolución revertida');
      onRecargar();
    } catch (e) {
      toast('Error al revertir: ' + (e.message || e), 'error');
    }
  };

  const setEstado = async (idx, e) => {
    if (!window.api || guardadosRef.current[idx]) return;
    guardadosRef.current[idx] = true;
    setEstados(p => ({ ...p, [idx]: e }));
    if (!e) {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        savingRef.current[idx] = true;
        await window.api.registrarDevolucion({
          idContrato: c.id,
          fechaDevolucionReal: hoy,
          itemsDevueltos: [{ id_detalle: items[idx].id, estado_devolucion: 'bien' }],
        });
      } catch {
        guardadosRef.current[idx] = false;
      }
      delete savingRef.current[idx];
      return;
    }
    const item = items[idx];
    if (item.id_item_granel) {
      const cantDevolver = parseInt(cantidades[idx]) || 0;
      if (cantDevolver <= 0) {
        toast('Indica cuántos devuelves primero.', 'warn');
        setEstados(p => { const n = { ...p }; delete n[idx]; return n; });
        guardadosRef.current[idx] = false;
        return;
      }
    }
    savingRef.current[idx] = true;
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const body = {
        idContrato: c.id,
        fechaDevolucionReal: hoy,
        itemsDevueltos: [{
          id_detalle: item.id,
          estado_devolucion: e,
          cantidad_devuelta: item.id_item_granel
            ? (parseInt(cantidades[idx]) || 0)
            : undefined,
          costo_reparacion: e === 'dañado' ? (parseFloat(costosRep[idx]) || 0) : undefined,
        }],
        observaciones: notas[idx] ? { [item.id]: notas[idx] } : {},
      };
      await window.api.registrarDevolucion(body);
      if (mountedRef.current) {
        setGuardados(p => ({ ...p, [idx]: true }));
        toast(item.item_nombre || item.nombre + ' devuelta');
      }
    } catch (err) {
      if (mountedRef.current) {
        toast('Error al guardar: ' + (err.message || err), 'error');
        setEstados(p => { const n = { ...p }; delete n[idx]; return n; });
        guardadosRef.current[idx] = false;
      }
    } finally {
      if (mountedRef.current) delete savingRef.current[idx];
    }
  };

  const actualizarCostoDanos = async (idx, costo) => {
    if (!window.api || !mountedRef.current) return;
    const item = items[idx];
    if (item.id_item_granel) return;
    savingRef.current[idx] = true;
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await window.api.registrarDevolucion({
        idContrato: c.id,
        fechaDevolucionReal: hoy,
        itemsDevueltos: [{
          id_detalle: item.id,
          estado_devolucion: 'dañado',
          costo_reparacion: parseFloat(costo) || 0,
        }],
        observaciones: notas[idx] ? { [item.id]: notas[idx] } : {},
      });
    } catch (err) {
      if (mountedRef.current) toast('Error al guardar costo: ' + (err.message || err), 'error');
    } finally {
      if (mountedRef.current) delete savingRef.current[idx];
    }
  };

  const setNota = (idx, v) => {
    setNotas(p => ({ ...p, [idx]: v }));
    if (guardadosRef.current[idx]) dirtyRef.current[idx] = true;
  };
  const setCosto = (idx, v) => {
    setCostosRep(p => ({ ...p, [idx]: v }));
    if (guardadosRef.current[idx]) dirtyRef.current[idx] = true;
  };
  const setCantidad = (idx, v) => setCantidades(p => ({ ...p, [idx]: v }));
  const setMora = (idx, v) => setMoraEditadas(p => ({ ...p, [idx]: v }));
  const setBuen = (idx, v) => {
    const item = items[idx];
    const pend = item.granel_pendiente ?? item.cantidad;
    const max = Math.max(0, pend - (danadas[idx] || 0) - (perdidas[idx] || 0));
    setBuenas(p => ({ ...p, [idx]: Math.max(0, Math.min(v, max)) }));
  };
  const setDan = (idx, v) => {
    const item = items[idx];
    const pend = item.granel_pendiente ?? item.cantidad;
    const max = Math.max(0, pend - (buenas[idx] || 0) - (perdidas[idx] || 0));
    setDanadas(p => ({ ...p, [idx]: Math.max(0, Math.min(v, max)) }));
  };
  const setPerd = (idx, v) => {
    const item = items[idx];
    const pend = item.granel_pendiente ?? item.cantidad;
    const max = Math.max(0, pend - (buenas[idx] || 0) - (danadas[idx] || 0));
    const cappedVal = Math.max(0, Math.min(v, max));
    setPerdidas(p => ({ ...p, [idx]: cappedVal }));
    if (cappedVal === 0) {
      setCostoPerdManual(p => ({ ...p, [idx]: false }));
    }
    if (!costoPerdManual[idx]) {
      const unitPrice = item?.item_precio_venta || 0;
      setCostoPerd(idx, cappedVal * unitPrice);
    }
  };
  const setCostoPerd = (idx, v) => setCostosPerdida(p => ({ ...p, [idx]: v }));

  /** Registra devolución parcial con múltiples outcomes para materiales */
  const registrarDevParcialGranel = async (idx) => {
    if (!window.api) return;
    const item = items[idx];
    const pend = item.granel_pendiente ?? item.cantidad;
    const b = Math.min(buenas[idx] || 0, pend);
    const d = Math.min(danadas[idx] || 0, pend - b);
    const p_ = Math.min(perdidas[idx] || 0, pend - b - d);
    const total = b + d + p_;
    if (total <= 0) {
      toast('Indica cuántos devuelves primero.', 'warn');
      return;
    }
    if (total > pend) {
      toast('El total devuelto (' + total + ') supera lo pendiente (' + pend + ').', 'error');
      return;
    }
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const outcomes = [];
      if (b > 0) outcomes.push({ id_detalle: item.id, estado_devolucion: 'bien', cantidad_devuelta: b });
      if (d > 0) outcomes.push({ id_detalle: item.id, estado_devolucion: 'dañado', cantidad_devuelta: d, costo_reparacion: parseFloat(costosRep[idx]) || 0 });
      if (p_ > 0) outcomes.push({ id_detalle: item.id, estado_devolucion: 'perdido', cantidad_devuelta: p_, costo_perdida: parseFloat(costosPerdida[idx]) || null });
      window.api.log('[DEBUG registrarDevParcialGranel] outcomes: ' + JSON.stringify(outcomes) + ' contratoId: ' + c.id);
      const devResp = await window.api.registrarDevolucion({
        idContrato: c.id,
        fechaDevolucionReal: hoy,
        itemsDevueltos: outcomes,
        observaciones: notas[idx] ? { [item.id]: notas[idx] } : {},
      });
      window.api.log('[DEBUG registrarDevParcialGranel] respuesta: ' + JSON.stringify(devResp));
      // Resetear contadores locales para permitir más devoluciones parciales
      setBuenas(p => { const n = { ...p }; delete n[idx]; return n; });
      setDanadas(p => { const n = { ...p }; delete n[idx]; return n; });
      setPerdidas(p => { const n = { ...p }; delete n[idx]; return n; });
      setCostosPerdida(p => { const n = { ...p }; delete n[idx]; return n; });
      setCostosRep(p => { const n = { ...p }; delete n[idx]; return n; });
      // Invalidar caché del historial para recargar
      setDevolucionesGranel(p => { const n = { ...p }; delete n[idx]; return n; });
      toast((item.item_nombre || item.nombre) + ' — devuelto parcialmente');
      onRecargar();
    } catch (err) {
      toast('Error al guardar: ' + (err.message || err), 'error');
    }
  };

  /** Guarda costo/nota pendientes antes de cerrar */
  const flushDirty = async () => {
    const saves = [];
    for (let idx = 0; idx < items.length; idx++) {
      if (dirtyRef.current[idx]) {
        dirtyRef.current[idx] = false;
        saves.push(actualizarCostoDanos(idx, costosRep[idx]));
      }
    }
    if (saves.length > 0) {
      toast('Guardando cambios...', 'warn');
      await Promise.all(saves);
    }
  };

  /** Espera a que terminen saves que aún están en vuelo (de setEstado) */
  const esperarSaves = () => new Promise(resolve => {
    const check = () => {
      if (Object.keys(savingRef.current).length === 0) return resolve();
      setTimeout(check, 100);
    };
    check();
  });

  const closeDevMode = async () => {
    setError('');
    // 1. Flush costo/nota sucios
    await flushDirty();
    // 2. Esperar saves de setEstado aún en vuelo
    if (Object.keys(savingRef.current).length > 0) {
      toast('Esperando confirmación...', 'warn');
      await esperarSaves();
    }
    // 3. Cerrar y recargar
    const pendientes = items.some((item) => {
      if (item.id_item_granel) {
        return (item.granel_pendiente ?? item.cantidad) > 0;
      }
      return item.estado_devolucion === 'pendiente';
    });
    if (pendientes) {
      toast('Quedan ítems sin devolver. El contrato continúa activo.', 'warning');
    }
    onClose();
    onRecargar();
  };

  return (
    <><style>{`
      .dev-nospin::-webkit-inner-spin-button,
      .dev-nospin::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      .dev-nospin { -moz-appearance: textfield !important; }
    `}</style>
    <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      {/* Encabezado con botón cancelar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--danger)' }}>Modo devolución</p>
        <button onClick={closeDevMode}
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium transition-all duration-150"
          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}>
          <X size={12} /> Salir
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
      )}
      
      <div className="grid grid-cols-[3fr_2fr] gap-0 min-h-0">
        {/* COLUMNA IZQUIERDA: Items en devolución */}
        <div className="px-4 py-2 space-y-3">
          {items.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>Sin ítems registrados</p>
          ) : (
            items.map((item, idx) => {
              const est = estados[idx] || null;
              const esGranel = !!item.id_item_granel;
              const yaGuardado = guardados[idx];
              const fechaPactadaItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
              const diasItem = item.dias_item || 0;
              const baseItem = (item.precio_dia_aplicado || 0) * diasItem * (item.cantidad || 1);
              const moraCalc = (item.dias_atraso_item || 0) * (item.precio_dia_aplicado || 0) * (item.cantidad || 1);
              const moraActual = morasEditadas[idx] != null ? morasEditadas[idx] : moraCalc;
              return (
                <div key={idx}
                  className="rounded-lg border px-3 py-2 text-xs transition-all duration-150"
                  style={{
                    borderColor: yaGuardado
                      ? (item.saldo_item <= 0 ? 'oklch(0.50 0.13 155)' : 'oklch(0.55 0.13 70)')
                      : (est ? ESTADOS_OPC.find(o => o.id === est)?.bg + '60' : 'var(--border)'),
                    backgroundColor: yaGuardado
                      ? (item.saldo_item <= 0 ? 'oklch(0.95 0.05 155)' : 'oklch(0.97 0.04 70)')
                      : 'var(--surface)',
                  }}>
                  {/* Fila 1: Badge + nombre + atraso badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                      style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                      {esGranel ? 'x' + (item.cantidad || 1) : item.item_codigo || item.id}
                    </span>
                    <span className="font-medium text-[13px] truncate flex-1" style={{ color: 'var(--ink)' }}>{item.item_nombre || item.nombre}</span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--faint)' }}>
                      S/ {item.precio_dia_aplicado?.toFixed(2)}/día{esGranel ? ' c/u' : ''}
                    </span>
                    {(item.dias_atraso_item || 0) > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>
                        &#9888; +{item.dias_atraso_item} día{item.dias_atraso_item !== 1 ? 's' : ''}
                      </span>
                    )}
                    {yaGuardado && (item.saldo_item <= 0 ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ backgroundColor: 'oklch(0.50 0.13 155)', color: '#fff' }}>
                        Devuelto
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ backgroundColor: 'oklch(0.55 0.13 70)', color: '#fff' }}>
                        Pendiente pago
                      </span>
                    ))}
                  </div>
                  {/* Fila 2: Fechas del ítem */}
                  <div className="text-[10px] mb-1" style={{ color: 'var(--muted)' }}>
                    Salida: {fmtFecha(c.fecha_salida)} &middot; Pactada: {fmtFecha(fechaPactadaItem)}
                    <span style={{ color: 'var(--muted)' }}> &middot; Base: {diasItem} día{diasItem !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Granel: resumen + historial */}
                  {esGranel && (() => {
                    window.api.log('[DEBUG DevolucionInline render] item: ' + item.id + ' id_item_granel: ' + item.id_item_granel + ' granel_pendiente: ' + item.granel_pendiente + ' granel_dev_bien: ' + item.granel_dev_bien + ' granel_dev_danada: ' + item.granel_dev_danada + ' granel_dev_perdida: ' + item.granel_dev_perdida + ' cantidad: ' + item.cantidad);
                    const pend = item.granel_pendiente ?? item.cantidad;
                    const bien = item.granel_dev_bien || 0;
                    const dan = item.granel_dev_danada || 0;
                    const perd = item.granel_dev_perdida || 0;
                    const devTotal = bien + dan + perd;
                    const completo = pend === 0;
                    return (
                      <div className="mt-1 mb-1.5 space-y-1.5">
                        {/* Línea de resumen */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                            Pendiente: {pend}
                          </span>
                          {bien > 0 && <span style={{ color: 'var(--success)' }}>Bien: {bien}</span>}
                          {dan > 0 && <span style={{ color: 'oklch(0.55 0.13 70)' }}>Dañ: {dan}</span>}
                          {perd > 0 && <span style={{ color: 'var(--danger)' }}>Perd: {perd}</span>}
                          {completo && (
                            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--success)' }}>
                              <CheckCircle size={12} /> Completo
                            </span>
                          )}
                        </div>

                        {/* Costos registrados */}
                        {(item.granel_dev_costo_reparacion || item.granel_dev_costo_perdida) ? (
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--faint)' }}>
                            <span className="font-medium">Costos:</span>
                            {item.granel_dev_costo_reparacion > 0 && (
                              <span style={{ color: 'var(--warning)' }}>Daños S/ {item.granel_dev_costo_reparacion.toFixed(2)}</span>
                            )}
                            {item.granel_dev_costo_perdida > 0 && (
                              <span style={{ color: 'var(--danger)' }}>Pérdidas S/ {item.granel_dev_costo_perdida.toFixed(2)}</span>
                            )}
                          </div>
                        ) : null}

                        {/* Controles de devolución si aún hay pendiente */}
                        {pend > 0 && (
                          <div className="rounded-md p-2 space-y-1.5"
                            style={{ backgroundColor: 'oklch(0.98 0.005 240)', border: '0.5px solid var(--border)' }}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-medium" style={{ color: 'var(--success)' }}>Buen estado:</span>
                              <button onClick={() => setBuen(idx, Math.max(0, (buenas[idx] || 0) - 1))}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Minus size={10} /></button>
                              {editandoCantGranel[idx] === 'buenas' ? (
                                <input autoFocus
                                  type="number" min="0"
                                  defaultValue={buenas[idx] || 0}
                                  onBlur={e => { setBuen(idx, parseInt(e.target.value) || 0); setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  ref={el => el && el.select()}
                                  className="w-12 h-5 text-center font-mono text-xs border rounded"
                                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                              ) : (
                                <span onClick={() => setEditandoCantGranel(p => ({ ...p, [idx]: 'buenas' }))}
                                  className="w-7 text-center font-mono text-xs font-semibold cursor-pointer"
                                  style={{ color: 'var(--ink)' }}>
                                  {buenas[idx] || 0}
                                </span>
                              )}
                              <button onClick={() => setBuen(idx, (buenas[idx] || 0) + 1)}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Plus size={10} /></button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-medium" style={{ color: 'oklch(0.55 0.13 70)' }}>Dañadas:</span>
                              <button onClick={() => setDan(idx, Math.max(0, (danadas[idx] || 0) - 1))}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Minus size={10} /></button>
                              {editandoCantGranel[idx] === 'danadas' ? (
                                <input autoFocus
                                  type="number" min="0"
                                  defaultValue={danadas[idx] || 0}
                                  onBlur={e => { setDan(idx, parseInt(e.target.value) || 0); setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  ref={el => el && el.select()}
                                  className="w-12 h-5 text-center font-mono text-xs border rounded"
                                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                              ) : (
                                <span onClick={() => setEditandoCantGranel(p => ({ ...p, [idx]: 'danadas' }))}
                                  className="w-7 text-center font-mono text-xs font-semibold cursor-pointer"
                                  style={{ color: 'var(--ink)' }}>
                                  {danadas[idx] || 0}
                                </span>
                              )}
                              <button onClick={() => setDan(idx, (danadas[idx] || 0) + 1)}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Plus size={10} /></button>
                              {(danadas[idx] || 0) > 0 && (
                                <span className="flex items-center gap-0.5 ml-1">
                                  <span className="text-[9px]" style={{ color: 'var(--muted)' }}>Costo S/</span>
                                  <input type="number" step="0.01" min="0" value={costosRep[idx] ?? ''}
                                    placeholder="0" onChange={e => setCosto(idx, e.target.value)}
                                    className="w-14 h-5 px-0.5 rounded text-[9px] border text-center font-mono dev-nospin"
                                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-medium" style={{ color: 'var(--danger)' }}>Perdidas:</span>
                              <button onClick={() => setPerd(idx, Math.max(0, (perdidas[idx] || 0) - 1))}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Minus size={10} /></button>
                              {editandoCantGranel[idx] === 'perdidas' ? (
                                <input autoFocus
                                  type="number" min="0"
                                  defaultValue={perdidas[idx] || 0}
                                  onBlur={e => { setPerd(idx, parseInt(e.target.value) || 0); setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditandoCantGranel(p => ({ ...p, [idx]: undefined })); }}
                                  ref={el => el && el.select()}
                                  className="w-12 h-5 text-center font-mono text-xs border rounded"
                                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                              ) : (
                                <span onClick={() => setEditandoCantGranel(p => ({ ...p, [idx]: 'perdidas' }))}
                                  className="w-7 text-center font-mono text-xs font-semibold cursor-pointer"
                                  style={{ color: 'var(--ink)' }}>
                                  {perdidas[idx] || 0}
                                </span>
                              )}
                              <button onClick={() => setPerd(idx, (perdidas[idx] || 0) + 1)}
                                className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Plus size={10} /></button>
                              {(perdidas[idx] || 0) > 0 && (
                                <span className="flex items-center gap-0.5 ml-1">
                                  <span className="text-[9px]" style={{ color: 'var(--muted)' }}>Reponer S/</span>
                                  <input type="number" step="0.01" min="0"
                                    value={costosPerdida[idx] ?? (perdidas[idx] * (item.item_precio_venta || 0))}
                                    onChange={e => { setCostoPerd(idx, parseFloat(e.target.value) || 0); setCostoPerdManual(p => ({ ...p, [idx]: true })); }}
                                    onBlur={e => { if (parseFloat(e.target.value) === 0) setCostoPerdManual(p => ({ ...p, [idx]: false })); }}
                                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                    className="w-14 h-5 px-0.5 rounded text-[9px] border text-center font-mono dev-nospin"
                                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between pt-1" style={{ borderTop: '0.5px solid var(--border)' }}>
                              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                                Total: {(buenas[idx] || 0) + (danadas[idx] || 0) + (perdidas[idx] || 0)} de {pend}
                              </span>
                              <button onClick={() => registrarDevParcialGranel(idx)}
                                className="px-2.5 h-6 rounded text-[10px] font-semibold transition-all duration-150 active:scale-[0.97]"
                                style={{ backgroundColor: 'oklch(0.50 0.13 155)', color: '#fff', border: 'none' }}>
                                Registrar devolución
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Historial de devoluciones (acordeón) */}
                        {devTotal > 0 && (
                          <div style={{ borderTop: '0.5px solid var(--border)' }}>
                            <button onClick={() => {
                              const nuevo = !historialGranelAbierto[idx];
                              setHistorialGranelAbierto(p => ({ ...p, [idx]: nuevo }));
                              if (nuevo) cargarHistorialGranel(idx, item);
                            }}
                              className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold w-full text-left pt-1.5 pb-0.5"
                              style={{ color: 'var(--muted)' }}>
                              <ChevronRight size={10}
                                style={{ transform: historialGranelAbierto[idx] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                              Historial de devoluciones
                            </button>
                            {historialGranelAbierto[idx] && (
                              <div className="space-y-1 pb-1">
                                {cargandoHistorial[idx] ? (
                                  <p className="text-[10px]" style={{ color: 'var(--faint)' }}>Cargando...</p>
                                ) : (devolucionesGranel[idx] || []).length === 0 ? (
                                  <p className="text-[10px]" style={{ color: 'var(--faint)' }}>Sin entradas</p>
                                ) : (
                                  (devolucionesGranel[idx] || []).map(dg => (
                                    <div key={dg.id} className="flex items-center gap-1.5 text-[10px]"
                                      style={{ opacity: dg.revertido ? 0.4 : 1 }}>
                                      <span className="shrink-0 font-mono" style={{ color: 'var(--muted)' }}>{dg.fecha?.slice(5, 16)}</span>
                                      {dg.cantidad_bien > 0 && <span style={{ color: 'var(--success)' }}>Bien:{dg.cantidad_bien}</span>}
                                      {dg.cantidad_danada > 0 && <span style={{ color: 'oklch(0.55 0.13 70)' }}>Dañ:{dg.cantidad_danada}</span>}
                                      {dg.cantidad_perdida > 0 && <span style={{ color: 'var(--danger)' }}>Perd:{dg.cantidad_perdida}</span>}
                                      {(dg.costo_reparacion || 0) > 0 && (
                                        <span className="text-[9px]" style={{ color: 'var(--faint)' }}>S/ {dg.costo_reparacion.toFixed(2)}</span>
                                      )}
                                      <span className="flex-1" />
                                      {dg.revertido
                                        ? <span className="text-[9px]" style={{ color: 'var(--faint)' }}>Revertido</span>
                                        : <button onClick={() => handleDeshacerGranel(dg.id, idx)}
                                            className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/10 text-[11px] font-bold"
                                            style={{ color: 'var(--danger)' }}
                                            title="Revertir esta devolución">×</button>
                                      }
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Fila 4: Base + Mora + Pagado + Total */}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 2, marginBottom: 4 }} />
                  <div className="flex justify-between items-center">
                    <div className="flex items-baseline gap-3">
                      <span style={{ color: 'var(--muted)' }}>Base <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {baseItem.toFixed(2)}</span></span>
                      {item.dias_atraso_item > 0 && (
                        <span className="flex items-center gap-1">
                          <span style={{ color: 'var(--danger)' }}>Mora </span>
                          {editandoMora[idx] ? (
                            <input type="number" step="0.01" min="0"
                              defaultValue={moraActual}
                              onBlur={e => { setMora(idx, parseFloat(e.target.value) || 0); setEditandoMora(p => ({ ...p, [idx]: false })); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                              className="w-20 h-6 px-1 rounded text-xs border font-mono text-right dev-nospin"
                              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--danger)' }}
                              autoFocus
                            />
                          ) : (
                            <span onClick={() => setEditandoMora(p => ({ ...p, [idx]: true }))}
                              className="font-mono cursor-pointer px-1 rounded hover:bg-black/5"
                              style={{ color: 'var(--danger)' }}>
                              S/ {moraActual.toFixed(2)}
                            </span>
                          )}
                        </span>
                      )}
                      {(item.pagado_item || 0) > 0 && (
                        <span style={{ color: 'var(--success)' }}>
                          Pagado <span className="font-mono">&minus;S/ {item.pagado_item.toFixed(2)}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                        S/ {(baseItem + moraActual - (item.pagado_item || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  {/* Fila 5: Botones de estado — solo para items individuales */}
                  {!esGranel && (yaGuardado ? (
                    <div className="flex items-center justify-between mt-2 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <div className="flex items-center gap-1 text-[10px] font-medium">
                        {item.saldo_item <= 0 ? (
                          <span style={{ color: 'var(--success)' }}><CheckCircle size={12} /> Devuelto correctamente</span>
                        ) : (
                          <span style={{ color: 'oklch(0.55 0.13 70)' }}><Clock size={12} /> Falta pagar</span>
                        )}
                      </div>
                      <button onClick={() => handleDeshacer(idx)}
                        className="text-[10px] px-2 h-5 rounded font-medium transition-all duration-150 hover:opacity-80"
                        style={{ backgroundColor: 'oklch(0.92 0.03 25)', color: 'var(--danger)' }}>
                        Deshacer
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 mt-2 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      {ESTADOS_OPC.map(op => {
                        const sel = est === op.id;
                        return (
                          <button key={op.id} onClick={() => setEstado(idx, op.id === est ? null : op.id)}
                            className="flex items-center gap-1 px-2.5 h-7 rounded text-[10px] font-medium transition-all duration-150"
                            style={{
                              backgroundColor: sel ? op.bg : 'var(--bg)',
                              color: sel ? op.ink : 'var(--muted)',
                              border: sel ? 'none' : '0.5px solid var(--border)',
                            }}>
                            <op.icon size={11} /> {op.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {/* Dañado: costo + nota — solo individual */}
                  {!esGranel && est === 'dañado' && (
                    <div className="flex items-center gap-2 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>Costo reparación: S/</span>
                      <input type="number" step="0.01" min="0" value={costosRep[idx] ?? ''}
                        placeholder="0" onChange={e => setCosto(idx, e.target.value)}
                        onBlur={e => { if (guardados[idx]) actualizarCostoDanos(idx, e.target.value); }}
                        className="w-16 h-6 px-1 rounded text-xs border text-center font-mono dev-nospin"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                      <input placeholder="Nota del daño..." value={notas[idx] || ''}
                        onChange={e => setNota(idx, e.target.value)}
                        onBlur={e => { if (guardados[idx] && e.target.value) actualizarCostoDanos(idx, costosRep[idx]); }}
                        className="flex-1 h-6 px-1.5 rounded text-[10px] border"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                    </div>
                  )}
                  {/* Pagar por ítem */}
                  {item.saldo_item > 0 && (
                    <div className="mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <button onClick={() => setPagoItemState({ item, pendiente: item.saldo_item, baseItem, moraItem: moraActual, idDetalle: item.id })}
                        className="w-full h-6 rounded text-[10px] font-semibold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}>
                        Pagar S/ {item.saldo_item.toFixed(2)}
                      </button>
                    </div>
                  )}
                  {/* Historial de pagos del item */}
                  {(() => {
                    const pagosItem = pagos.filter(p => p.id_detalle === item.id);
                    if (pagosItem.length === 0) return null;
                    const abierto = historialItemAbierto[idx];
                    return (
                      <div className="mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                        <button onClick={() => setHistorialItemAbierto(p => ({ ...p, [idx]: !p[idx] }))}
                          className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold w-full text-left"
                          style={{ color: 'var(--muted)' }}>
                          <ChevronRight size={10}
                            style={{ transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                          Pagos de este item ({pagosItem.length})
                        </button>
                        {abierto && (
                          <div className="space-y-1 pt-1">
                            {pagosItem.map(p => {
                              const anulado = p.anulado === 1;
                              return (
                                <div key={p.id} className="flex items-center gap-1.5 text-[10px]"
                                  style={{ opacity: anulado ? 0.4 : 1, textDecoration: anulado ? 'line-through' : 'none' }}>
<span className="shrink-0" style={{ color: 'var(--muted)' }}>{p.fecha_pago?.slice(5, 10)}</span>
                              <span className="font-mono" style={{ color: anulado ? 'var(--muted)' : 'var(--success)' }}>S/ {p.monto.toFixed(2)}</span>
                              <span className="text-[8px] capitalize" style={{ color: 'var(--muted)' }}>{p.metodo}</span>
                              <span className="flex-1" />
                              {anulado
                                ? <span className="text-[8px]" style={{ color: 'var(--muted)' }}>Anulado</span>
                                    : <button onClick={() => setAnulandoPago(p)}
                                        className="text-[9px] underline hover:opacity-70 shrink-0"
                                        style={{ color: 'var(--danger)' }}>Anular</button>
                                  }
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
        
        {/* COLUMNA DERECHA: Caja en devolución */}
        <div className="px-4 py-2 space-y-3" style={{ borderLeft: '0.5px solid var(--border)' }}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)' }}>Cierre de devolución</p>
          
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Alquiler base</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
            </div>
            
            {/* Mora total (suma de moras por ítem) */}
            {montoAtraso > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--danger)' }}>Recargo por atraso</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>
                  + S/ {montoAtraso.toFixed(2)}
                </span>
              </div>
            )}
            
            {/* Daños */}
            {totalDanos > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>+ S/ {totalDanos.toFixed(2)}</span>
              </div>
            )}
            {/* Pérdidas */}
            {totalPerdidas > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--danger)' }}>Cobro por pérdidas</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {totalPerdidas.toFixed(2)}</span>
              </div>
            )}
            
            <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
            
            <div className="flex justify-between font-semibold">
              <span style={{ color: 'var(--ink)' }}>TOTAL</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Pagado</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {totalPagado.toFixed(2)}</span>
            </div>
            
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
            
            <div className="flex justify-between font-bold">
              <span style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
              <span className="font-mono tabular-nums" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                S/ {pendiente.toFixed(2)}
              </span>
            </div>
            
            {garantia > 0 && (
              <>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--muted)' }}>Garant&iacute;a disponible</span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono" style={{ color: 'var(--info)' }}>S/ {garantia.toFixed(2)}</span>
                    <button onClick={() => setDevolviendoGarantia(!devolviendoGarantia)}
                      className="text-[10px] underline font-medium hover:opacity-70"
                      style={{ color: 'var(--danger)' }}>Devolver</button>
                  </span>
                </div>
                {devolviendoGarantia && (
                  <div className="flex items-center gap-1 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--danger)' }}>Devolver S/</span>
                    <input type="number" step="1" min="1" max={garantia} value={devGarMonto}
                      placeholder={garantia.toFixed(0)}
                      onChange={e => setDevGarMonto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleDevolverGarantia(); }}
                      className="w-16 h-6 px-1 rounded text-[10px] border font-mono text-center dev-nospin"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--danger)' }} />
                    {['efectivo','yape','plin'].map(m => (
                      <button key={m} onClick={() => setDevGarMetodo(m)}
                        className="h-6 px-1.5 rounded text-[9px] font-medium transition-all duration-150"
                        style={{
                          backgroundColor: devGarMetodo === m ? 'oklch(0.55 0.13 155)' : 'var(--surface)',
                          color: devGarMetodo === m ? '#fff' : 'var(--muted)',
                          border: '0.5px solid var(--border)',
                        }}>{m}</button>
                    ))}
                    <button onClick={handleDevolverGarantia} disabled={cobrando}
                      className="h-6 px-2 rounded text-[10px] font-semibold transition-all duration-150 active:scale-[0.97]"
                      style={{ backgroundColor: 'var(--danger)', color: '#fff', border: 'none' }}>&#10003;</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Historial de pagos general */}
          <div className="rounded-lg" style={{ border: '0.5px solid var(--border)', backgroundColor: 'var(--bg)' }}>
            <button onClick={() => setHistorialPagosAbierto(!historialPagosAbierto)}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:opacity-80 rounded-lg"
              style={{ color: 'var(--muted)' }}>
              <ChevronRight size={11}
                style={{ transform: historialPagosAbierto ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
              Historial de pagos{pagos.length > 0 ? ` (${pagos.length})` : ''}
            </button>
            {historialPagosAbierto && (
              <div className="px-2.5 pb-1.5 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
                {pagos.length === 0 ? (
                  <p className="pt-1.5 text-[11px]" style={{ color: 'var(--faint)' }}>Sin pagos registrados</p>
                ) : (
                  (() => {
                    const pagosAgrupados = gruparPagos(pagos);
                    return pagosAgrupados.map((p, idx) => {
                      const esDeposito = p.tipo === 'deposito';
                      const esDevolucionDeposito = p.tipo === 'devolucion_deposito';
                      const anulado = p.anulado === 1;
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
                          style={{ opacity: anulado ? 0.35 : 1 }}>
                          <span className="shrink-0" style={{ color: 'var(--muted)' }}>{p.fecha_pago?.slice(5, 10) || '-'}</span>
                          <span className="font-mono font-medium flex-1" style={{
                            color: 'var(--ink)',
                            textDecoration: anulado ? 'line-through' : 'none',
                          }}>
                            S/ {p.monto.toFixed(2)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-[10px] text-[9px] font-medium capitalize"
                            style={{ backgroundColor: colorMetodo + '20', color: colorMetodo }}>
                            {labelMetodo}
                          </span>
                          {anulado
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

          {/* Botones de accion */}
          <div className="space-y-2 pt-1">
            <button onClick={() => setPagoItemState({ item: null, pendiente: pendiente, esTotal: true })}
              disabled={pendiente <= 0}
              className="w-full h-9 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { if (pendiente > 0) e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}>
              {pendiente > 0 ? 'Pagar saldo pendiente S/ ' + pendiente.toFixed(2) : 'Sin deuda pendiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
    {pagoItemState && (
      <UnifiedPaymentModal
        tipo={pagoItemState.esTotal ? 'total' : 'item'}
        contrato={c}
        item={pagoItemState.item}
        itemPendiente={pagoItemState.pendiente}
        itemBase={pagoItemState.baseItem}
        itemMora={pagoItemState.moraItem}
        idDetalle={pagoItemState.idDetalle}
        onClose={() => setPagoItemState(null)}
        onConfirm={() => { setPagoItemState(null); onRecargar(); }}
      />
    )}
    {anulandoPago && (
      <AnularPagoModal
        pago={anulandoPago}
        onClose={() => setAnulandoPago(null)}
        onConfirm={() => { setAnulandoPago(null); onRecargar(); }}
      />
    )}
    </>
  );
}
