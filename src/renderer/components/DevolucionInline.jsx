import { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Minus, Plus, ChevronRight, Clock, Star, Eye } from 'lucide-react';
import { useToast } from './Toast';
import UnifiedPaymentModal from './UnifiedPaymentModal';
import AnularPagoModal from './AnularPagoModal';
import CalificarContratoModal from './CalificarContratoModal';
import ImagenVisor from './ImagenVisor';
import ConfirmModal from './ConfirmModal';
import { gruparPagos } from '../lib/gruparPagos';
import { localDate } from '../lib/date';

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
  const [regla9amActiva, setRegla9amActiva] = useState(false);
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
  const [costosNoDevueltos, setCostosNoDevueltos] = useState({});
  const savingRef = useRef({});
  const guardadosRef = useRef({});
  const dirtyRef = useRef({});
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // Estado para historial de DEVOLUCION_GRANEL
  const [historialGranelAbierto, setHistorialGranelAbierto] = useState({});
  const [devolucionesGranel, setDevolucionesGranel] = useState({});
  const [cargandoHistorial, setCargandoHistorial] = useState({});
  // Estado para el acordeón de componentes del kit
  const [kitAbierto, setKitAbierto] = useState({});
  // Estado para el agrupamiento visual de unidades individuales por familia
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const [calificarModal, setCalificarModal] = useState(false);
  // Visor de imagen de referencia
  const [visor, setVisor] = useState(null);
  // Catálogo de daños predefinidos por ítem: [idx] = { lista, cargando }
  const [dañosCat, setDañosCat] = useState({});
  // Daños predefinidos agregados al listado por ítem: [idx] = [{ id, nombre, costo }]
  const [dañosAgregados, setDañosAgregados] = useState({});
  // Acordeón de sugerencias de daños por ítem: undefined = abierto, false = cerrado
  const [dañosAcordeon, setDañosAcordeon] = useState({});
  // Acordeón de lista de daños registrados por ítem: undefined = abierto, false = cerrado
  const [listaAcordeon, setListaAcordeon] = useState({});
  // Acordeón del detalle de daños en cierre: undefined = abierto, false = cerrado
  const [detalleDañosAbierto, setDetalleDañosAbierto] = useState(undefined);
  // Confirmación para deshacer devolución: null | { tipo, idx, idDevolucion?, nombre }
  const [confirmDeshacer, setConfirmDeshacer] = useState(null);

  const verImagenItem = async (item) => {
    try {
      const tipo = item.id_herramienta ? 'herramienta' : 'granel';
      const id = item.id_herramienta || item.id_item_granel;
      if (id == null) return;
      const r = await window.api.getImagenItem(tipo, id);
      const nombre = item.item_nombre || item.nombre || 'Ítem';
      if (r?.ruta) {
        setVisor({ ruta: r.ruta, titulo: nombre });
      } else {
        toast(nombre + ' no tiene imagen de referencia.');
      }
    } catch (e) {
      toast('No se pudo cargar la imagen: ' + (e.message || e), 'error');
    }
  };

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
    const item = items[idx];
    setConfirmDeshacer({
      tipo: 'granel',
      idx,
      idDevolucion: idDevolucionGranel,
      nombre: item?.item_nombre || item?.nombre || 'este material',
    });
  };

  const c = contrato;
  const items = c.items || [];
  useEffect(() => {
    const init = {};
    items.forEach((item, idx) => {
      if (!item.id_herramienta) return;
      if (item.estado_devolucion && item.estado_devolucion !== 'pendiente') {
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

  // Regla de las 9 AM: atraso de exactamente 1 día y devolución antes de las 9:00
  const maxDiasAtraso = items.reduce((m, i) => Math.max(m, i.dias_atraso_item || 0), 0);
  const regla9amAplica = new Date().getHours() < 9 && maxDiasAtraso === 1;
  const montoAtrasoEfectivo = regla9amActiva ? 0 : montoAtraso;

  const costosDanosBackend = items.reduce((s, i) => {
    if (i.id_item_granel) return s + (i.granel_dev_costo_reparacion || 0);
    if (i.estado_devolucion === 'dañado' && i.danos_devueltos && i.danos_devueltos.length > 0) {
      return s + i.danos_devueltos.reduce((x, d) => x + (d.costo || 0), 0);
    }
    return s;
  }, 0);
  const costosPerdBackend = items.reduce((s, i) => s + (i.granel_dev_costo_perdida || 0), 0);
  const costosDanosLocal = Object.entries(estados).reduce((a, [idx, v]) => {
    if (v === 'dañado' && items[idx] && !items[idx].id_item_granel) {
      const lista = dañosAgregados[idx] || [];
      return a + lista.reduce((s, d) => s + (parseFloat(d.costo) || 0), 0);
    }
    return a;
  }, 0);
  const costosPerdLocal = Object.values(costosPerdida).reduce((a, v) => a + (parseFloat(v) || 0), 0);
  // Separar ventas de pérdidas en items individuales
  const totalDanos = costosDanosBackend + costosDanosLocal;
  const totalPerdidas = costosPerdBackend + costosPerdLocal;
  const totalCargosExtra = totalDanos + totalPerdidas;

  const total = montoBase + montoAtrasoEfectivo + totalCargosExtra;
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
    const item = items[idx];
    setConfirmDeshacer({
      tipo: 'individual',
      idx,
      nombre: item?.item_nombre || item?.nombre || 'este ítem',
    });
  };

  const ejecutarDeshacer = async () => {
    if (!confirmDeshacer || !window.api) return;
    const { tipo, idx, idDevolucion } = confirmDeshacer;
    setConfirmDeshacer(null);
    try {
      if (tipo === 'individual') {
        await window.api.revertirDevolucion({ idDetalle: items[idx].id });
        setGuardados(p => { const n = { ...p }; delete n[idx]; return n; });
        setEstados(p => { const n = { ...p }; delete n[idx]; return n; });
        setBuenas(p => { const n = { ...p }; delete n[idx]; return n; });
        setDanadas(p => { const n = { ...p }; delete n[idx]; return n; });
        setPerdidas(p => { const n = { ...p }; delete n[idx]; return n; });
        setCostosPerdida(p => { const n = { ...p }; delete n[idx]; return n; });
        setCostosRep(p => { const n = { ...p }; delete n[idx]; return n; });
        setCostosNoDevueltos(p => { const n = { ...p }; delete n[idx + '_perdido']; delete n[idx + '_vendido']; return n; });
        setDañosCat(p => { const n = { ...p }; delete n[idx]; return n; });
        setDañosAgregados(p => { const n = { ...p }; delete n[idx]; return n; });
setDañosAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
      setListaAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
      delete guardadosRef.current[idx];
        toast('Devolución revertida');
      } else if (tipo === 'granel') {
        await window.api.revertirDevolucionGranel(idDevolucion);
        setDevolucionesGranel(p => { const n = { ...p }; delete n[idx]; return n; });
        toast('Devolución revertida');
        const item = items[idx];
        if (item) cargarHistorialGranel(idx, item);
      }
      onRecargar();
    } catch (e) {
      toast('Error al revertir: ' + (e.message || e), 'error');
    }
  };

  const seleccionarEstado = (idx, e) => {
    if (guardadosRef.current[idx]) return;
    const actual = estados[idx];
    if (actual === e) {
      // Toggle off: limpiar estado y selección de daños
      setEstados(p => ({ ...p, [idx]: null }));
      setDañosAgregados(p => { const n = { ...p }; delete n[idx]; return n; });
      setDañosAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
      setListaAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
      return;
    }
    setEstados(p => ({ ...p, [idx]: e }));
    if (e === 'dañado') cargarDañosItem(idx, items[idx]);
  };

  const marcarTodasBien = () => {
    const nuevos = {};
    items.forEach((item, idx) => {
      if (!item.id_herramienta) return;
      if (guardadosRef.current[idx]) return;
      if (item.estado_devolucion && item.estado_devolucion !== 'pendiente') return;
      if (estados[idx] !== 'bien') nuevos[idx] = true;
    });
    if (Object.keys(nuevos).length === 0) return;
    setEstados(p => {
      const n = { ...p };
      Object.keys(nuevos).forEach(idx => { n[idx] = 'bien'; });
      return n;
    });
    Object.keys(nuevos).forEach(idx => {
      setDañosAgregados(p => { const n2 = { ...p }; delete n2[idx]; return n2; });
      setDañosAcordeon(p => { const n2 = { ...p }; delete n2[idx]; return n2; });
      setListaAcordeon(p => { const n2 = { ...p }; delete n2[idx]; return n2; });
    });
  };

  const guardarDevolucionBatch = async () => {
    if (!window.api) return;
    const pendientes = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item, idx }) => !item.id_item_granel && !guardadosRef.current[idx] && estados[idx]);

    if (pendientes.length === 0) {
      toast('No hay devoluciones pendientes para confirmar.', 'warn');
      return;
    }

    const ventas = pendientes.filter(({ idx }) => estados[idx] === 'vendido');
    await procesarDevoluciones(pendientes);
  };

  const procesarDevoluciones = async (pendientes) => {
    setCobrando(true);
    let exitos = 0;
    let fallos = 0;

    for (const { item, idx } of pendientes) {
      const estado = estados[idx];
      guardadosRef.current[idx] = true;
      try {
        const hoy = localDate();
        await window.api.registrarDevolucion({
          idContrato: c.id,
          fechaDevolucionReal: hoy,
          itemsDevueltos: [{
            id_detalle: item.id,
            estado_devolucion: estado,
            costo_reparacion: estado === 'dañado' ? ((dañosAgregados[idx] || []).reduce((s, d) => s + (parseFloat(d.costo) || 0), 0)) : undefined,
            danos: estado === 'dañado' ? (dañosAgregados[idx] || []).map(d => ({ nombre: d.nombre, costo: parseFloat(d.costo) || 0 })) : undefined,
          }],
          observaciones: notas[idx] ? { [item.id]: notas[idx] } : {},
        });
        if (mountedRef.current) {
          setGuardados(p => ({ ...p, [idx]: true }));
        }
        exitos++;
      } catch (err) {
        guardadosRef.current[idx] = false;
        fallos++;
        console.error('[Devolucion] Error procesando item idx=' + idx + ' id=' + item.id + ' estado=' + estado + ':', err.message || err);
      }
    }

    if (mountedRef.current) {
      setCobrando(false);
      if (exitos > 0) toast(exitos + ' herramienta' + (exitos !== 1 ? 's' : '') + ' devuelta' + (exitos !== 1 ? 's' : ''));
      if (fallos > 0) toast(fallos + ' error' + (fallos !== 1 ? 'es' : '') + ' al procesar', 'error');
      onRecargar();
    }
  };

  const individualesPendientes = items.filter((item, idx) =>
    !item.id_item_granel && !guardadosRef.current[idx] && estados[idx]
  ).length;
  const itemsSeleccionables = items.filter((item, idx) =>
    !item.id_item_granel && !guardadosRef.current[idx]
  ).length;

  const actualizarCostoDanos = async (idx, costo) => {
    if (!window.api || !mountedRef.current) return;
    const item = items[idx];
    if (item.id_item_granel) return;
    savingRef.current[idx] = true;
    try {
      const hoy = localDate();
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
    const capped = Math.max(0, Math.min(v, max));
    setDanadas(p => ({ ...p, [idx]: capped }));
    if (capped > 0) cargarDañosItem(idx, item);
    if (capped === 0) setDañosAgregados(p => { const n = { ...p }; delete n[idx]; return n; });
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
      const hoy = localDate();
      const outcomes = [];
      if (b > 0) outcomes.push({ id_detalle: item.id, estado_devolucion: 'bien', cantidad_devuelta: b });
      if (d > 0) outcomes.push({ id_detalle: item.id, estado_devolucion: 'dañado', cantidad_devuelta: d, costo_reparacion: (dañosAgregados[idx] || []).reduce((s, dd) => s + (parseFloat(dd.costo) || 0), 0),
        danos: (dañosAgregados[idx] || []).map(dd => ({ nombre: dd.nombre, costo: parseFloat(dd.costo) || 0 })) });
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
      setDañosCat(p => { const n = { ...p }; delete n[idx]; return n; });
      setDañosAgregados(p => { const n = { ...p }; delete n[idx]; return n; });
      setDañosAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
      setListaAcordeon(p => { const n = { ...p }; delete n[idx]; return n; });
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

  /** Carga el catálogo de daños predefinidos de un ítem (una sola vez). */
  const cargarDañosItem = async (idx, item) => {
    if (!window.api || dañosCat[idx]?.lista) return;
    const tipo = item.id_herramienta ? 'herramienta' : 'granel';
    const id = item.id_herramienta || item.id_item_granel;
    if (id == null) return;
    setDañosCat(p => ({ ...p, [idx]: { lista: null, cargando: true } }));
    try {
      const lista = await window.api.getDañosItem(tipo, id);
      if (!mountedRef.current) return;
      setDañosCat(p => ({ ...p, [idx]: { lista, cargando: false } }));
    } catch (e) {
      if (!mountedRef.current) return;
      setDañosCat(p => ({ ...p, [idx]: { lista: [], cargando: false } }));
    }
  };

  /** Autocompleta campos de borrador con el daño sugerido */
  const autocompletarDaño = (idx, d) => {
    setCosto(idx, String(d.costo_sugerido));
    setNota(idx, d.nombre);
  };

  /** Agrega el daño del borrador al listado */
  const agregarDaño = (idx) => {
    const nombre = (notas[idx] || '').trim();
    const costo = parseFloat(costosRep[idx]) || 0;
    if (!nombre && costo <= 0) return;
    const entry = {
      id: Date.now() + Math.random(),
      nombre: nombre || 'Daño S/' + costo.toFixed(2),
      costo,
    };
    setDañosAgregados(p => ({
      ...p,
      [idx]: [...(p[idx] || []), entry],
    }));
    // Limpiar borrador
    setNota(idx, '');
    setCosto(idx, '');
  };

  /** Quita un daño del listado por su id */
  const quitarDaño = (idx, id) => {
    setDañosAgregados(p => {
      const lista = (p[idx] || []).filter(d => d.id !== id);
      if (lista.length === 0) {
        const n = { ...p };
        delete n[idx];
        return n;
      }
      return { ...p, [idx]: lista };
    });
  };

  /** Lista de daños agregados para el ítem idx (acordeón vertical, abierto por defecto). */
  const ListaDaños = ({ idx }) => {
    const lista = dañosAgregados[idx] || [];
    if (lista.length === 0) return null;
    const abierto = listaAcordeon[idx] !== false;
    return (
      <div className="mt-1">
        <button onClick={() => setListaAcordeon(p => ({ ...p, [idx]: abierto ? false : undefined }))}
          className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold w-full text-left"
          style={{ color: 'var(--muted)' }}>
          <ChevronRight size={10}
            style={{ transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
          Daños registrados ({lista.length})
        </button>
        {abierto && (
          <div className="flex flex-col gap-0.5 mt-1">
            {lista.map(d => (
              <div key={d.id}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: 'oklch(0.62 0.17 80 / 0.12)', color: 'oklch(0.52 0.17 80)' }}>
                <span className="truncate flex-1">{d.nombre}</span>
                <span className="font-mono shrink-0">S/ {d.costo.toFixed(2)}</span>
                <button onClick={() => quitarDaño(idx, d.id)}
                  className="w-3.5 h-3.5 rounded flex items-center justify-center hover:bg-black/10 font-bold leading-none shrink-0"
                  style={{ color: 'oklch(0.52 0.17 80)', fontSize: '11px' }}>x</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /** Chips de daños sugeridos para el ítem idx (acordeón, solo autocompletan). */
  const ChipsDaños = ({ idx }) => {
    const info = dañosCat[idx];
    if (!info) return null;
    if (info.cargando) {
      return <p className="text-[9px] mt-1" style={{ color: 'var(--faint)' }}>Cargando daños sugeridos...</p>;
    }
    if (!info.lista || info.lista.length === 0) return null;
    const abierto = dañosAcordeon[idx] !== false;
    return (
      <div className="mt-1">
        <button onClick={() => setDañosAcordeon(p => ({ ...p, [idx]: abierto ? false : undefined }))}
          className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold w-full text-left"
          style={{ color: 'var(--muted)' }}>
          <ChevronRight size={10}
            style={{ transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
          Sugerencias de daños ({info.lista.length})
        </button>
        {abierto && (
          <div className="flex flex-wrap gap-1 mt-1">
            {info.lista.map(d => (
              <button key={d.id} onClick={() => autocompletarDaño(idx, d)}
                className="px-1.5 h-5 rounded text-[9px] font-medium transition-all duration-150 active:scale-95"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--muted)',
                  border: '0.5px solid var(--border)',
                }}>
                {d.nombre} · S/ {d.costo_sugerido.toFixed(2)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
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
    <div className="space-y-3 pt-3" style={{ borderTop: '3px solid oklch(0.53 0.135 55)', backgroundColor: 'oklch(0.95 0.02 55)' }}>
      {/* Encabezado con botón cancelar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.12)', color: 'oklch(0.53 0.135 55)' }}>Modo devolución</p>
          {itemsSeleccionables > 0 && (
            <button onClick={marcarTodasBien} disabled={cobrando}
              className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold transition-all duration-150 disabled:opacity-50"
              style={{ backgroundColor: 'oklch(0.50 0.13 155 / 0.10)', color: 'oklch(0.42 0.14 155)', border: '0.5px solid oklch(0.50 0.13 155 / 0.35)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.50 0.13 155 / 0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.50 0.13 155 / 0.10)'; }}>
              <CheckCircle size={11} /> Todas bien
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setCalificarModal(true)}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold transition-all duration-150"
            style={{ backgroundColor: 'oklch(0.62 0.17 80 / 0.12)', color: 'oklch(0.52 0.17 80)', border: '0.5px solid oklch(0.62 0.17 80 / 0.3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.62 0.17 80 / 0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.62 0.17 80 / 0.12)'; }}>
            <Star size={11} /> Calificar
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
      )}
      
      <div className="grid grid-cols-[3fr_2fr] gap-0 min-h-0">
        {/* COLUMNA IZQUIERDA: Items en devolución */}
        <div className="px-4 py-2 space-y-3 min-w-0">
          {items.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>Sin ítems registrados</p>
          ) : (
            (() => {
              // Agrupar componentes bajo la tarjeta de su kit
              const hijosPorKit = {};
              const ordenPadres = [];
              items.forEach((it, i) => {
                if (it.id_kit && it.tipo_item !== 'kit') {
                  (hijosPorKit[it.id_kit] = hijosPorKit[it.id_kit] || []).push(i);
                } else {
                  ordenPadres.push(i);
                }
              });
              const renderItemBody = (item, idx, esKit, esHijo) => {
              const est = estados[idx] || null;
              const esGranel = !!item.id_item_granel;
              const devueltoEnDB = item.estado_devolucion && item.estado_devolucion !== 'pendiente';
              const yaGuardado = guardados[idx] || devueltoEnDB;
              const fechaPactadaItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
              const diasItem = item.dias_item || 0;
              const moraActual = morasEditadas[idx] != null ? morasEditadas[idx] : ((item.dias_atraso_item || 0) * (item.precio_dia_aplicado || 0) * (item.cantidad || 1));
              const hijosKit = esKit ? (hijosPorKit[item.id_kit] || []) : [];
              const pendKit = hijosKit.reduce((acc, hIdx) => {
                const h = items[hIdx];
                return acc + (h.id_item_granel ? (h.granel_pendiente || 0) : (h.estado_devolucion === 'pendiente' ? 1 : 0));
              }, 0);
              return (
                <>
                  {/* Línea 1: Badge + Nombre (wrap) + Eye */}
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 leading-none mt-0.5"
                      style={{ backgroundColor: esKit ? 'oklch(0.45 0.13 160)' : 'oklch(0.40 0.12 240)', color: '#fff' }}>
                      {esKit ? 'Kit ×' + (item.cantidad || 1) : (esGranel ? 'x' + (item.cantidad || 1) : item.item_codigo || item.id)}
                    </span>
                    <span className="text-[13px] leading-snug font-semibold min-w-0 flex-1 break-words" style={{ color: 'var(--ink)' }}>{item.item_nombre || item.nombre}</span>
                    {(item.id_herramienta || item.id_item_granel) && (
                      <button
                        onClick={() => verImagenItem(item)}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150 shrink-0"
                        style={{ color: 'var(--faint)' }}
                        title="Ver imagen de referencia"
                      >
                        <Eye size={12} />
                      </button>
                    )}
                  </div>
                  {/* Línea 2: Fechas + Precio + Mora */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {!esHijo && (
                      <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: 'oklch(0.93 0.02 240 / 0.15)', color: 'var(--info)' }}>
                        {fmtFecha(item.fecha_salida_item || c.fecha_salida)} → {fmtFecha(fechaPactadaItem)} · {diasItem}d
                      </span>
                    )}
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--muted)' }}>
                      S/ {item.precio_dia_aplicado?.toFixed(2)}/día{esGranel ? ' c/u' : ''}
                    </span>
                    {(item.dias_atraso_item || 0) > 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold shrink-0 leading-none"
                        style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>
                        +{item.dias_atraso_item}d atraso
                      </span>
                    )}
                  </div>
                  {/* Línea 3: Acciones + Badges + Kit */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {!esGranel && !esKit && !yaGuardado && (
                      <div className="flex gap-0.5 shrink-0">
                        {ESTADOS_OPC.map(op => {
                          const sel = est === op.id;
                          return (
                            <button key={op.id} onClick={() => seleccionarEstado(idx, op.id)}
                              className="flex items-center gap-0.5 px-1.5 h-5 rounded text-[9px] font-medium transition-all duration-150"
                              style={{
                                backgroundColor: sel ? op.bg : 'var(--bg)',
                                color: sel ? op.ink : 'var(--muted)',
                                border: sel ? 'none' : '0.5px solid var(--border)',
                              }}>
                              <op.icon size={10} /> {op.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {yaGuardado && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{
                          backgroundColor: item.estado_devolucion === 'dañado' ? 'oklch(0.55 0.12 70)' : item.estado_devolucion === 'perdido' ? 'oklch(0.55 0.19 30)' : item.estado_devolucion === 'vendido' ? 'oklch(0.45 0.15 250)' : 'oklch(0.50 0.13 155)',
                          color: '#fff',
                        }}>
                        {item.estado_devolucion === 'dañado' ? 'Dañado' : item.estado_devolucion === 'perdido' ? 'Perdido' : item.estado_devolucion === 'vendido' ? 'Vendido' : 'Devuelto'}
                      </span>
                    )}
                    {esKit && pendKit > 0 && !kitAbierto[item.id] && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                        style={{ backgroundColor: 'oklch(0.92 0.04 240)', color: 'oklch(0.43 0.13 240)' }}>
                        {pendKit} pendiente{pendKit !== 1 ? 's' : ''}
                      </span>
                    )}
                    {esKit && hijosKit.length > 0 && (
                      <span className="flex items-center gap-0.5 shrink-0" style={{ color: 'var(--muted)' }}>
                        <ChevronRight size={12}
                          style={{ transform: kitAbierto[item.id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                        <span className="text-[9px] font-semibold uppercase tracking-wider">Componentes ({hijosKit.length})</span>
                      </span>
                    )}
                    {!esGranel && !esKit && yaGuardado && (
                      <button onClick={() => handleDeshacer(idx)}
                        className="text-[9px] px-1.5 h-5 rounded font-medium transition-all duration-150 hover:opacity-80 shrink-0"
                        style={{ backgroundColor: 'oklch(0.92 0.03 25)', color: 'var(--danger)' }}>
                        Deshacer
                      </button>
                    )}
                  </div>
                  {/* Desglose de daños en individuales guardados */}
                  {!esGranel && !esKit && yaGuardado && item.estado_devolucion === 'dañado' && item.danos_devueltos && item.danos_devueltos.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: 'var(--faint)' }}>
                      <span className="font-medium">Costos:</span>
                      <span style={{ color: 'var(--warning)' }}>
                        {item.danos_devueltos.map(d => d.nombre + ' S/' + d.costo.toFixed(2)).join(' · ')}
                      </span>
                    </div>
                  )}
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
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: 'var(--faint)' }}>
                            <span className="font-medium">Costos:</span>
                            {item.danos_devueltos && item.danos_devueltos.length > 0 ? (
                              <span style={{ color: 'var(--warning)' }}>
                                {item.danos_devueltos.map(d => d.nombre + ' S/' + d.costo.toFixed(2)).join(' · ')}
                              </span>
                            ) : item.granel_dev_costo_reparacion > 0 ? (
                              <span style={{ color: 'var(--warning)' }}>Daños S/ {item.granel_dev_costo_reparacion.toFixed(2)}</span>
                            ) : null}
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
                              </div>
                            {(danadas[idx] || 0) > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[9px]" style={{ color: 'var(--muted)' }}>Costo S/</span>
                                <input type="number" step="0.01" min="0" value={costosRep[idx] ?? ''}
                                  placeholder="0" onChange={e => setCosto(idx, e.target.value)}
                                  className="w-14 h-5 px-0.5 rounded text-[9px] border text-center font-mono dev-nospin"
                                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                                <input placeholder="Nota..." value={notas[idx] || ''}
                                  onChange={e => setNota(idx, e.target.value)}
                                  className="flex-1 min-w-[50px] h-5 px-1 rounded text-[9px] border"
                                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                                <button onClick={() => agregarDaño(idx)}
                                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all duration-150 active:scale-90 text-[10px] font-bold"
                                  style={{ backgroundColor: 'oklch(0.50 0.13 155)', color: '#fff', lineHeight: '1' }}>+</button>
                              </div>
                            )}
                            {(danadas[idx] || 0) > 0 && <ListaDaños idx={idx} />}
                            {(danadas[idx] || 0) > 0 && <ChipsDaños idx={idx} />}
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
                                  {!costoPerdManual[idx] && item.item_precio_venta && (
                                    <span className="text-[8px] px-0.5 py-0.5 rounded whitespace-nowrap"
                                      style={{ color: 'oklch(0.40 0.12 250)', backgroundColor: 'oklch(0.93 0.05 250)' }}>
                                      Sugerido S/{item.item_precio_venta} c/u
                                    </span>
                                  )}
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
                  {/* Dañado: costo + nota — solo individual */}
                  {!esGranel && !esKit && est === 'dañado' && !yaGuardado && (
                    <>
                      <div className="flex items-center gap-2 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>Costo reparación: S/</span>
                        <input type="number" step="0.01" min="0" value={costosRep[idx] ?? ''}
                          placeholder="0" onChange={e => setCosto(idx, e.target.value)}
                          className="w-16 h-6 px-1 rounded text-xs border text-center font-mono dev-nospin"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                        <input placeholder="Nota del daño..." value={notas[idx] || ''}
                          onChange={e => setNota(idx, e.target.value)}
                          className="flex-1 h-6 px-1.5 rounded text-[10px] border"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                        <button onClick={() => agregarDaño(idx)}
                          className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-all duration-150 active:scale-90 text-sm font-bold"
                          style={{ backgroundColor: 'oklch(0.50 0.13 155)', color: '#fff' }}
                          title="Añadir daño">+</button>
                      </div>
                      <ListaDaños idx={idx} />
                      <ChipsDaños idx={idx} />
                    </>
                  )}
                  {/* Perdido/Vendido: monto (reposición o precio de venta) — solo individual */}
                  </>
              );
              };
              const renderItemCard = (item, idx) => {
                const esKit = item.tipo_item === 'kit';
                const estK = estados[idx] || null;
                const devDB = item.estado_devolucion && item.estado_devolucion !== 'pendiente';
                const yaG = guardados[idx] || devDB;
                const styleCard = {
                  borderColor: yaG
                    ? 'oklch(0.50 0.13 155)'
                    : (estK ? ((ESTADOS_OPC.find(o => o.id === estK)?.bg || (estK === 'perdido' ? 'oklch(0.55 0.19 30)' : 'oklch(0.45 0.15 250)')) + '60') : 'var(--border)'),
                  backgroundColor: yaG
                    ? 'oklch(0.95 0.05 155)'
                    : (estK ? (ESTADOS_OPC.find(o => o.id === estK) ? 'oklch(0.97 0.04 70)' : 'oklch(0.96 0.04 260)') : 'var(--bg)'),
                };
                const cardBody = (
                  <div className="rounded-lg border px-3 py-2 text-xs transition-all duration-150"
                    style={esKit ? { ...styleCard, cursor: 'pointer' } : styleCard}
                    onClick={esKit ? () => setKitAbierto(p => ({ ...p, [item.id]: !p[item.id] })) : undefined}
                    title={esKit ? 'Clic para ver componentes' : undefined}>
                    {renderItemBody(item, idx, esKit, false)}
                  </div>
                );
                if (!esKit) return <div key={idx}>{cardBody}</div>;
                const hijos = hijosPorKit[item.id_kit] || [];
                return (
                  <div key={idx}>
                    {cardBody}
                    {kitAbierto[item.id] && hijos.length > 0 && (
                      <div className="ml-3 mt-1.5 space-y-1.5">
                        {hijos.map(hIdx => {
                          const hi = items[hIdx];
                          const estH = estados[hIdx] || null;
                          const yaH = guardados[hIdx] || (hi.estado_devolucion && hi.estado_devolucion !== 'pendiente');
                          return (
                            <div key={hIdx} className="rounded-lg border px-3 py-2 text-xs transition-all duration-150"
                              style={{
                                borderColor: yaH
                                  ? 'oklch(0.50 0.13 155)'
                                  : (estH ? ESTADOS_OPC.find(o => o.id === estH)?.bg + '60' : 'var(--border)'),
                                backgroundColor: yaH
                                  ? 'oklch(0.95 0.05 155)'
                                  : (estH ? 'oklch(0.97 0.04 70)' : 'var(--bg)'),
                              }}>
                              {renderItemBody(hi, hIdx, false, true)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              };
              const ordenGrupos = [];
              const porPrefijoG = new Map();
              ordenPadres.forEach(i => {
                const it = items[i];
                const esIndividual = !!it.id_herramienta;
                if (esIndividual) {
                  const codigo = it.item_codigo || it.id || '';
                  const m = codigo.match(/^([A-Za-z]+)-/);
                  const prefix = m ? m[1] : codigo;
                  let g = porPrefijoG.get(prefix);
                  if (!g) { g = { prefix, nombre: it.item_nombre || it.nombre, indices: [] }; porPrefijoG.set(prefix, g); ordenGrupos.push(g); }
                  g.indices.push(i);
                } else {
                  ordenGrupos.push({ prefix: null, indices: [i] });
                }
              });
              return ordenGrupos.map((g, gi) => {
                if (g.prefix === null) {
                  return renderItemCard(items[g.indices[0]], g.indices[0]);
                }
                const abierto = gruposAbiertos[g.prefix] !== false;
                const pendientes = g.indices.filter(i => {
                  const it = items[i];
                  return !it.estado_devolucion || it.estado_devolucion === 'pendiente';
                }).length;
                return (
                  <div key={'g-' + g.prefix} className="rounded-xl transition-all duration-150 mb-1.5"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'oklch(0.96 0.015 240 / 0.12)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                      onClick={() => setGruposAbiertos(p => ({ ...p, [g.prefix]: !p[g.prefix] }))}>
                      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--muted)', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                      <span className="flex-1 min-w-0 text-[13px] font-semibold break-words" style={{ color: 'var(--ink)' }}>
                        {g.nombre}
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-lg font-bold align-middle"
                          style={{ backgroundColor: 'oklch(0.40 0.12 240 / 0.12)', color: 'var(--info)' }}>&times;{g.indices.length}</span>
                      </span>
                      {pendientes > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                          style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>{pendientes} pendiente{pendientes !== 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                          style={{ backgroundColor: 'oklch(0.93 0.05 160)', color: 'var(--success)' }}>Completo</span>
                      )}
                    </div>
                    {abierto && (
                      <div className="px-2 pb-2 space-y-1.5">
                        {g.indices.map(i => renderItemCard(items[i], i))}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
          <div className="flex gap-2 px-4 pb-2">
            {individualesPendientes > 0 && (
              <button onClick={guardarDevolucionBatch} disabled={cobrando}
                className="flex-1 h-9 rounded-lg text-xs font-bold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}>
                <CheckCircle size={14} />
                {cobrando ? 'Procesando...' : 'Confirmar devolución'}
              </button>
            )}
            <button onClick={closeDevMode}
              className="h-9 px-4 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}>
              <X size={14} /> Cancelar devolución
            </button>
          </div>
        </div>
        
        {/* COLUMNA DERECHA: Caja en devolución */}
        <div className="px-4 py-2 space-y-3" style={{ borderLeft: '2px solid oklch(0.53 0.135 55)' }}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)' }}>Cierre de devolución</p>
          
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Alquiler base</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
            </div>
            
            {/* Regla de las 9 AM: aviso de exoneración de mora */}
            {regla9amAplica && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px]"
                style={{ backgroundColor: 'oklch(0.93 0.05 250)', color: 'oklch(0.40 0.12 250)' }}>
                <span className="flex-1">
                  Aún no son las 9:00 AM. Según la regla de las 9, puede no cobrar el recargo por atraso (S/ {montoAtraso.toFixed(2)}).
                </span>
                <button onClick={() => setRegla9amActiva(v => !v)}
                  className="px-2 h-5 rounded text-[9px] font-semibold transition-all duration-150 active:scale-[0.97] whitespace-nowrap"
                  style={{
                    backgroundColor: regla9amActiva ? 'var(--success)' : 'var(--surface)',
                    color: regla9amActiva ? '#fff' : 'oklch(0.40 0.12 250)',
                    border: regla9amActiva ? 'none' : '0.5px solid var(--border)',
                  }}>
                  {regla9amActiva ? 'Cobrar recargo' : 'No cobrar recargo'}
                </button>
              </div>
            )}

            {/* Mora total (suma de moras por ítem) */}
            {montoAtrasoEfectivo > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--warning)' }}>Recargo por atraso</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>
                  + S/ {montoAtrasoEfectivo.toFixed(2)}
                </span>
              </div>
            )}
            
            {/* Daños */}
            {totalDanos > 0 && (
              <>
              <div className="flex justify-between">
                <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>+ S/ {totalDanos.toFixed(2)}</span>
              </div>
              {(() => {
                const partes = [];
                for (const [, lista] of Object.entries(dañosAgregados)) {
                  for (const d of lista || []) {
                    partes.push({ nombre: d.nombre, costo: parseFloat(d.costo) || 0 });
                  }
                }
                for (const item of items) {
                  if (item.danos_devueltos) {
                    for (const d of item.danos_devueltos) {
                      partes.push({ nombre: d.nombre, costo: d.costo });
                    }
                  }
                }
                if (partes.length === 0) return null;
                return (
                  <div className="mt-0.5">
                    <button onClick={() => setDetalleDañosAbierto(p => p === false ? undefined : false)}
                      className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold w-full text-left"
                      style={{ color: 'var(--muted)' }}>
                      <ChevronRight size={10}
                        style={{ transform: detalleDañosAbierto !== false ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                      Detalle de daños ({partes.length})
                    </button>
                    {detalleDañosAbierto !== false && (
                      <div className="flex flex-col gap-0.5 mt-0.5 pl-3">
                        {partes.map((p, i) => (
                          <div key={i}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: 'oklch(0.62 0.17 80 / 0.12)', color: 'oklch(0.52 0.17 80)' }}>
                            <span className="truncate flex-1">{p.nombre}</span>
                            <span className="font-mono shrink-0">S/ {p.costo.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              </>
            )}
            {/* Ventas */}
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
        pendienteExterno={pagoItemState.esTotal ? pendiente : undefined}
        danosExterno={pagoItemState.esTotal ? totalDanos : undefined}
        perdidasExterno={pagoItemState.esTotal ? totalPerdidas : undefined}
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
    {calificarModal && (
      <CalificarContratoModal
        idContrato={c.id}
        idCliente={c.id_cliente}
        onClose={() => setCalificarModal(false)}
        onGuardado={() => { toast('Calificación guardada'); }}
      />
    )}
    {confirmDeshacer && (
      <ConfirmModal
        open={true}
        title={'Revertir devolución'}
        message={'¿Revertir la devolución de ' + confirmDeshacer.nombre + '? Esta acción eliminará el registro de devolución y sus daños asociados.'}
        confirmLabel={'Sí, revertir'}
        danger={true}
        onConfirm={ejecutarDeshacer}
        onCancel={() => setConfirmDeshacer(null)}
      />
    )}
    {visor && (
      <ImagenVisor
        ruta={visor.ruta}
        titulo={visor.titulo}
        onClose={() => setVisor(null)}
      />
    )}
    </>
  );
}
