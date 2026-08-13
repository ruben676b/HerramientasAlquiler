import { X, Plus, Circle, CheckCircle2, Clock, ChevronLeft, ChevronRight, User, Wrench, DollarSign, Search, AlertTriangle, Package, FileText, Star, Info } from 'lucide-react';
import DescripcionPopover from './DescripcionPopover';
import { useState, useEffect, useMemo, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { useSessions } from '../contexts/SessionsContext';
import { useToast } from './Toast';
import { cn } from '../lib/utils';
import SignaturePad from './SignaturePad';
import StarRating, { CalificacionBadge } from './StarRating';
import DetalleClienteModal from './DetalleClienteModal';
import Button from './ui/button';
import TagChip from './TagChip';
import { fmtLocalDate, contarHabiles, desglosarMensual } from '../lib/duracion';
import DatePicker from './DatePicker';

export default function MultiSessionModal() {
  const {
    sessions, isOpen, activeId, closeDialog,
    setActiveId, addSession, removeSession,
  } = useSessions();

  const [confirmDelete, setConfirmDelete] = useState(null);

  const activeSessions = sessions.filter((s) => !s.saved);
  const activeSession = activeSessions.find((s) => s.id === activeId);

  if (!isOpen) {
    console.log('[MultiSessionModal] Oculto (isOpen=false)');
    return null;
  }

  console.log('[MultiSessionModal] Visible - isOpen:' + isOpen + ' activeId:' + activeId + ' sessions:' + sessions.length + ' activeSessions:' + activeSessions.length + ' foundSession:' + !!activeSession);
  if (!activeSession) {
    console.log('[MultiSessionModal] Sin sesion activa. activeSessions:', activeSessions.map(s => ({ id: s.id, tipo: s.tipo })));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={closeDialog}
    >
      <div
        className="m-auto w-[98vw] max-w-[1400px] h-[92vh] rounded-2xl flex overflow-hidden shadow-2xl relative"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar global */}
        <button onClick={closeDialog} 
          className="absolute top-4 right-4 z-50 flex items-center justify-center w-8 h-8 rounded-full shadow-sm transition-all hover:scale-105"
          style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)', border: '1px solid oklch(0.90 0.03 25)' }}>
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* ===== SIDEBAR DE SESIONES ===== */}
        <div
          className="w-[220px] shrink-0 border-r flex flex-col"
          style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--sidebar-ink)' }}>Sesiones</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-ink)' }}>
              {activeSessions.length}/{5}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {/* Sesiones guardadas (completadas) */}
            {sessions.filter(s => s.saved).slice(-3).map((s) => (
              <div key={s.id}
                className="mx-2 mb-1 px-2.5 py-2 rounded-lg flex items-center gap-2 group"
                style={{ backgroundColor: 'oklch(0.93 0.05 160 / 0.4)', color: 'var(--success)' }}>
                <CheckCircle2 size={12} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">{s.clientName || s.label}</p>
                  <p className="text-[9px] opacity-70">Alquiler completado</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950"
                  style={{ color: 'var(--sidebar-muted)' }}><X size={11} /></button>
              </div>
            ))}

            {/* Sesiones activas */}
            {activeSessions.map((s) => {
              const esAlquiler = s.tipo === 'alquiler';
              const accentColor = esAlquiler ? 'oklch(0.50 0.11 155)' : 'oklch(0.52 0.08 240)';
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 transition-colors duration-150 border-l-[3px] group relative',
                    activeId === s.id ? '' : 'border-transparent'
                  )}
                  style={{
                    backgroundColor: activeId === s.id ? 'var(--sidebar-active)' : 'transparent',
                    borderLeftColor: activeId === s.id ? accentColor : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Circle size={8} fill={accentColor} stroke="none" />
                    <span className="text-[12px] font-medium truncate pr-4" style={{ color: activeId === s.id ? accentColor : 'var(--sidebar-muted)' }}>
                      {s.clientName || s.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 ml-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: esAlquiler ? 'oklch(0.60 0.13 155 / 0.12)' : 'oklch(0.62 0.10 240 / 0.12)', color: accentColor }}>
                      {esAlquiler ? 'Alquiler' : 'Reserva'}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }}
                    className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950"
                    style={{ color: 'var(--sidebar-muted)' }}
                  ><X size={11} /></button>
                </button>
              );
            })}

            {activeSessions.length < 5 && (
              <div className="px-2 py-1.5 space-y-1">
                <button
                  onClick={() => { const id = addSession('alquiler'); if (id) setActiveId(id); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150"
                  style={{ backgroundColor: 'oklch(0.60 0.13 155 / 0.10)', color: 'oklch(0.50 0.11 155)' }}
                ><Plus size={13} /> Nuevo Alquiler</button>
                <button
                  onClick={() => { const id = addSession('reserva'); if (id) setActiveId(id); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150"
                  style={{ backgroundColor: 'oklch(0.62 0.10 240 / 0.10)', color: 'oklch(0.52 0.08 240)' }}
                ><Clock size={13} /> Nueva Reserva</button>
              </div>
            )}
          </div>

        </div>

        {/* ===== PANEL DEL FORMULARIO ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeSession ? (
            <SessionForm session={activeSession} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Seleccione o cree una sesión para comenzar</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Eliminar sesión"
        message={confirmDelete?.clientName
          ? `¿Eliminar la sesión de "${confirmDelete.clientName}"? Los datos ingresados se perderán.`
          : `¿Eliminar esta sesión? Los datos ingresados se perderán.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          removeSession(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/* ================================================================
   FORMULARIO MULTI-PASO
   ================================================================ */

const PASOS = [
  { id: 0, label: 'Cliente', icon: User },
  { id: 1, label: 'Equipos', icon: Wrench },
  { id: 2, label: 'Contrato', icon: FileText },
];

function SessionForm({ session }) {
  const { updateSession, closeDialog, markSaved, loadFormData, saveFormData, sessions, removeSession, setActiveId } = useSessions();
  const toast = useToast();
  const saved = loadFormData(session.id) || {};

  // Recargar datos al cambiar de sesión
  useEffect(() => {
    const data = loadFormData(session.id) || {};
    const nuevoNombre = data.nombre || '';
    const nuevoDni = data.dni || '';
    setDni(nuevoDni);
    setNombre(nuevoNombre);
    setTelefono(data.telefono || '');
    const defaultFechaLoad = session.tipo === 'reserva'
      ? (data.fechaReserva || fmtLocalDate(new Date(Date.now() + 86400000)))
      : fmtLocalDate(new Date());

    setFechaSalida(data.fechaSalida || defaultFechaLoad);
    setFechaDevolucionRaw(data.fechaDevolucion || defaultFechaLoad);
    setFechaReserva(data.fechaReserva || (session.tipo === 'reserva' ? fmtLocalDate(new Date(Date.now() + 86400000)) : ''));
    setClienteSeleccionado(data.clienteSeleccionado || null);
    setItems((data.items || []).map(it => ({ ...it, descripcion: it.item_descripcion || it.descripcion || null, tarifa: it.tarifa || (it.usar_precio_mes ? 'mes' : 'dia') })));
    setStep(data.step || 0);
    setError('');
    setBusquedaEquipo('');
    setSugerenciasDni([]);
    setSugerenciasNombre([]);
    setPagos(data.pagos || []);
    setDepositoMonto(data.depositoMonto || 0);
    setDepositoDni(data.depositoDni || false);
    setFirmaBase64(data.firmaBase64 || null);
    setEditContratoId(data.editContratoId || null);
    // Actualizar nombre de sesión con los datos CARGADOS
    const displayName = nuevoNombre || (nuevoDni.length === 8 ? 'DNI ' + nuevoDni : null);
    if (displayName) {
      updateSession(session.id, { clientName: displayName });
    }
  }, [session.id]);

  const [step, setStep] = useState(saved.step || 0);
  const [error, setError] = useState('');
  const [dni, setDni] = useState(saved.dni || '');
  const [nombre, setNombre] = useState(saved.nombre || '');
  const [telefono, setTelefono] = useState(saved.telefono || '');
  const defaultFecha = session.tipo === 'reserva'
    ? (saved.fechaReserva || fmtLocalDate(new Date(Date.now() + 86400000)))
    : fmtLocalDate(new Date());

  const [fechaSalida, setFechaSalida] = useState(
    saved.fechaSalida || defaultFecha
  );
  const [fechaDevolucion, setFechaDevolucionRaw] = useState(
    saved.fechaDevolucion || defaultFecha
  );
  const setFechaDevolucion = (f) => {
    setFechaDevolucionRaw(f);
    setItems(prev => prev.map(item => ({ ...item, total_editado: undefined })));
  };
  const [fechaReserva, setFechaReserva] = useState(
    saved.fechaReserva || (session.tipo === 'reserva' ? fmtLocalDate(new Date(Date.now() + 86400000)) : '')
  );
  const [sugerenciasDni, setSugerenciasDni] = useState([]);
  const [sugerenciasNombre, setSugerenciasNombre] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(saved.clienteSeleccionado || null);
  const [detalleCliente, setDetalleCliente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [dniFocus, setDniFocus] = useState(false);
  const [nombreFocus, setNombreFocus] = useState(false);
  const dniRef = useRef(null);
  const nombreRef = useRef(null);
  const busquedaRef = useRef(null);

  // --- Paso 2: Equipos ---
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [equipoFoco, setEquipoFoco] = useState(false);
  const [equipoIndex, setEquipoIndex] = useState(-1);
  const [consultandoReniec, setConsultandoReniec] = useState(false);

  const [firmaBase64, setFirmaBase64] = useState(saved.firmaBase64 || null);
  const [clausulas, setClausulas] = useState('');
  const [pdfPreviewPath, setPdfPreviewPath] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pagos, setPagos] = useState(saved.pagos || []);
  const [depositoMonto, setDepositoMonto] = useState(saved.depositoMonto || 0);
  const [depositoDni, setDepositoDni] = useState(saved.depositoDni || false);
  const [editContratoId, setEditContratoId] = useState(saved.editContratoId || null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [garantias, setGarantias] = useState([]);
  const [garantiaMonto, setGarantiaMonto] = useState('');
  const [garantiaMetodo, setGarantiaMetodo] = useState('efectivo');
  const [todasHerramientas, setTodasHerramientas] = useState([]);
  const [granelCat, setGranelCat] = useState([]);
  const [kitsCat, setKitsCat] = useState([]);
  const [items, setItems] = useState(saved.items || []);
  const [totalEditando, setTotalEditando] = useState({});
  const [cantEditando, setCantEditando] = useState({});
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const inputTotalRefs = useRef({});
  const inputCantRefs = useRef({});

  // Cargar cláusulas del contrato
  useEffect(() => {
    if (window.api?.getConfig) {
      window.api.getConfig('contrato_clausulas').then(setClausulas).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (step !== 1 || !window.api) return;
    Promise.all([
      window.api.getHerramientas({}),
      window.api.getGranel(),
      window.api.getKits ? window.api.getKits() : Promise.resolve([]),
    ]).then(([h, g, k]) => {
      setTodasHerramientas(h);
      setGranelCat(g);
      setKitsCat(k);
    }).catch(() => {});
  }, [step]);

  // Granel reservado en otras sesiones activas
  const granelEnOtrasSesiones = useMemo(() => {
    const mapa = {};
    sessions
      .filter(s => !s.saved && s.id !== session.id)
      .forEach(s => {
        const data = loadFormData(s.id);
        (data?.items || []).forEach(item => {
          if (item.id_item_granel) {
            mapa[item.id_item_granel] = (mapa[item.id_item_granel] || 0) + item.cantidad;
          }
        });
      });
    return mapa;
  }, [sessions, session.id, items]);

  // Kits reservados en otras sesiones activas
  const kitsEnOtrasSesiones = useMemo(() => {
    const mapa = {};
    sessions
      .filter(s => !s.saved && s.id !== session.id)
      .forEach(s => {
        const data = loadFormData(s.id);
        (data?.items || []).forEach(item => {
          if (item.id_kit) {
            mapa[item.id_kit] = (mapa[item.id_kit] || 0) + (item.cantidad || 1);
          }
        });
      });
    return mapa;
  }, [sessions, session.id, items]);

  // Actualizar nombre de sesión cuando el usuario escribe
  useEffect(() => {
    if (!nombre && dni.length !== 8) return;
    const displayName = nombre || ('DNI ' + dni);
    updateSession(session.id, { clientName: displayName });
  }, [nombre, dni]);

  // Auto-guardar items
  useEffect(() => {
    saveFormData(session.id, { dni, nombre, telefono, fechaSalida, fechaDevolucion, fechaReserva, clienteSeleccionado, items, step, firmaBase64, pagos, depositoMonto, depositoDni, editContratoId });
  }, [items, dni, nombre, telefono, fechaSalida, fechaDevolucion, clienteSeleccionado, session.id, step, pagos, editContratoId]);

  // Sincronizar fechaSalida y fechaDevolucion con fechaReserva en reservas
  useEffect(() => {
    if (session.tipo !== 'reserva' || !fechaReserva) return;
    setFechaSalida(fechaReserva);
    setFechaDevolucionRaw(fechaReserva);
  }, [fechaReserva]);

  // Herramientas ya en otras sesiones activas
  const herramientasEnOtrasSesiones = useMemo(() => {
    const ids = new Set();
    sessions
      .filter(s => !s.saved && s.id !== session.id)
      .forEach(s => {
        const data = loadFormData(s.id);
        (data?.items || []).forEach(item => {
          if (item.id_herramienta) ids.add(item.id_herramienta);
        });
      });
    return ids;
  }, [sessions, session.id, items]);

  // Resultados unificados
  const resultadosUnificados = useMemo(() => {
    if (!busquedaEquipo) return [];
    const q = busquedaEquipo.toLowerCase();
    const herr = todasHerramientas
      .filter(h => (h.id || '').toLowerCase().includes(q) || (h.nombre || '').toLowerCase().includes(q) || (h.id || '').replace('-', '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.estado === 'disponible' && b.estado !== 'disponible') return -1;
        if (b.estado === 'disponible' && a.estado !== 'disponible') return 1;
        return 0;
      })
      .slice(0, 8)
      .map(h => {
        const enLista = items.some(i => i.id_herramienta === h.id);
        return {
          ...h,
          _tipo: 'herramienta',
          _enLista: enLista,
          _enContratoEditado: editContratoId && enLista,
        };
      });
    const gran = granelCat
      .filter(g => (g.nombre || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(g => {
        const enLista = items.find(i => i.id_item_granel === g.id);
        const enOtras = granelEnOtrasSesiones[g.id] || 0;
        return {
          ...g,
          _tipo: 'granel',
          _enLista: !!enLista,
          _dispEfectivo: g.cantidad_disponible - (enLista?.cantidad || 0) - enOtras,
        };
      });
    const kits = kitsCat
      .filter(k => (k.nombre || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(k => {
        const enLista = items.find(i => i.id_kit === k.id);
        const enOtras = kitsEnOtrasSesiones[k.id] || 0;
        return {
          ...k,
          _tipo: 'kit',
          _enLista: !!enLista,
          _dispEfectivo: (k.disponibilidad || 0) - (enLista?.cantidad || 0) - enOtras,
        };
      });
    return [...herr, ...gran, ...kits];
  }, [busquedaEquipo, todasHerramientas, granelCat, kitsCat, items, kitsEnOtrasSesiones]);

  const agregarHerramienta = (h) => {
    const yaEnEstaSesion = items.find((i) => i.id_herramienta === h.id);
    if (yaEnEstaSesion) {
      toast(h.id + ' ya esta agregada en este alquiler', 'warning');
      return;
    }
    if (h.estado !== 'disponible' && !editContratoId) return;
    if (h.estado !== 'disponible' && editContratoId && !h._enContratoEditado) return;
    setItems([...items, { tipo: 'individual', id_herramienta: h.id, nombre: h.nombre, descripcion: h.descripcion, precio_dia: h.precio_dia, precio_minimo: h.precio_minimo, precio_mes: h.precio_mes, cantidad: 1, fecha_devolucion_item: fechaDevolucion, tarifa: 'dia' }]);
    setBusquedaEquipo('');
  };

  const agregarGranel = (g) => {
    if (g.cantidad_disponible < 1) return setError('Stock insuficiente.');
    const existente = items.find((i) => i.id_item_granel === g.id);
    if (existente) {
      setItems(items.map((i) => i.id_item_granel === g.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setItems([...items, { tipo: 'granel', id_item_granel: g.id, nombre: g.nombre, descripcion: g.descripcion, condicion: g.condicion, precio_dia: g.precio_dia, precio_minimo: g.precio_minimo, precio_mes: g.precio_mes, cantidad: 1, fecha_devolucion_item: fechaDevolucion, tarifa: 'dia' }]);
    }
    setBusquedaEquipo('');
  };

  const agregarKit = (k) => {
    const enLista = items.find((i) => i.id_kit === k.id);
    const enOtras = kitsEnOtrasSesiones[k.id] || 0;
    const disp = (k.disponibilidad || 0) - (enLista?.cantidad || 0) - enOtras;
    if (disp < 1) return setError('Stock insuficiente para el kit ' + k.nombre + '.');
    if (enLista) {
      setItems(items.map((i) => i.id_kit === k.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setItems([...items, { tipo: 'kit', id_kit: k.id, nombre: k.nombre, descripcion: k.descripcion, precio_dia: k.precio_dia, precio_minimo: k.precio_minimo, precio_mes: k.precio_mes, cantidad: 1, fecha_devolucion_item: fechaDevolucion, tarifa: 'dia', _componentes: k.componentes || [], _disponibilidad: k.disponibilidad || 0 }]);
    }
    setBusquedaEquipo('');
  };

  const cambiarFechaItem = (idx, fecha) => {
    setItems(items.map((item, i) => i === idx ? { ...item, fecha_devolucion_item: fecha, total_editado: undefined } : item));
  };

  const quitarItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const cambiarCantidad = (idx, delta) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const max = item._maxDisponible || 999;
      const nueva = Math.max(1, Math.min(max, item.cantidad + delta));
      return { ...item, cantidad: nueva, total_editado: undefined };
    }));
  };

  /* --- Inline editing de total --- */
  const iniciarEdicionTotal = (idx) => {
    setTotalEditando(p => ({ ...p, [idx]: true }));
    setTimeout(() => inputTotalRefs.current[idx]?.select(), 60);
  };

  const finalizarEdicionTotal = (idx, raw) => {
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) {
      setItems(items.map((item, i) => i === idx ? { ...item, total_editado: val } : item));
    } else {
      setItems(items.map((item, i) => i === idx ? { ...item, total_editado: undefined } : item));
    }
    setTotalEditando(p => ({ ...p, [idx]: false }));
  };

  // Calcular máximo disponible por ítem granel (considerando otras sesiones)
  const itemsConMaximo = useMemo(() => {
    return items.map(item => {
      if (item.tipo === 'kit') {
        const original = kitsCat.find(k => k.id === item.id_kit);
        const enOtras = kitsEnOtrasSesiones[item.id_kit] || 0;
        const max = original ? Math.max(1, (original.disponibilidad || 0) - enOtras) : 999;
        return { ...item, _maxDisponible: max, _stockOriginal: original?.disponibilidad || 0 };
      }
      if (item.tipo !== 'granel') return item;
      const original = granelCat.find(g => g.id === item.id_item_granel);
      const enOtras = granelEnOtrasSesiones[item.id_item_granel] || 0;
      const max = original ? Math.max(1, original.cantidad_disponible - enOtras) : 999;
      return { ...item, _maxDisponible: max, _stockOriginal: original?.cantidad_disponible || 0 };
    });
  }, [items, granelCat, kitsCat, granelEnOtrasSesiones, kitsEnOtrasSesiones]);



  const esAlquiler = session.tipo === 'alquiler';
  const accent = esAlquiler ? 'oklch(0.50 0.11 155)' : 'oklch(0.52 0.08 240)';

  // Sugerencias por DNI
  useEffect(() => {
    if (dni.length < 1 || clienteSeleccionado) { setSugerenciasDni([]); return; }
    const t = setTimeout(async () => {
      if (!window.api) return;
      setBuscando(true);
      try { setSugerenciasDni(await window.api.buscarClientes(dni)); }
      catch {}
      finally { setBuscando(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [dni, clienteSeleccionado]);

  // Sugerencias por nombre
  useEffect(() => {
    if (nombre.length < 1 || clienteSeleccionado) { setSugerenciasNombre([]); return; }
    const t = setTimeout(async () => {
      if (!window.api) return;
      setBuscando(true);
      try { setSugerenciasNombre(await window.api.buscarClientes(nombre)); }
      catch {}
      finally { setBuscando(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [nombre, clienteSeleccionado]);

  const seleccionarCliente = (c) => {
    setClienteSeleccionado(c);
    setDni(c.dni || '');
    setNombre(c.nombre || '');
    setTelefono(c.telefono && parseInt(c.telefono) > 0 ? String(c.telefono) : '');
    setSugerenciasDni([]);
    setSugerenciasNombre([]);
  };

  const siguiente = () => {
    setError('');
    if (step === 0) {
      if (!dni && !nombre) return setError('Ingrese el DNI o el nombre del cliente.');
      if (dni && dni.length !== 8) return setError('El DNI debe tener 8 dígitos.');
      if (!telefono || telefono.length < 9) return setError('El teléfono es obligatorio (9 dígitos).');
      if (fechaDevolucion < fechaSalida) return setError('La devolución debe ser posterior a la salida.');
      if (session.tipo === 'reserva' && !fechaReserva) return setError('La fecha de reserva es obligatoria.');
    }
    if (step === 1) {
      if (items.length === 0) return setError('Agregue al menos un ítem al alquiler.');
      for (const item of items) {
        if (item.id_kit) {
          const original = kitsCat.find(k => k.id === item.id_kit);
          if (!original) continue;
          const enOtras = kitsEnOtrasSesiones[item.id_kit] || 0;
          const disponible = (original.disponibilidad || 0) - enOtras;
          if (item.cantidad > disponible) {
            return setError('Stock insuficiente para el kit "' + item.nombre + '". Pedido: ' + item.cantidad + ', disponible: ' + disponible + '.');
          }
          continue;
        }
        if (!item.id_item_granel) continue;
        const original = granelCat.find(g => g.id === item.id_item_granel);
        if (!original) continue;
        const enOtras = granelEnOtrasSesiones[item.id_item_granel] || 0;
        const disponible = original.cantidad_disponible - enOtras;
        if (item.cantidad > disponible) {
          return setError('Stock insuficiente para "' + item.nombre + '". Pedido: ' + item.cantidad + ', disponible: ' + disponible + '.');
        }
      }
    }
    setStep(step + 1);
  };

  const anterior = () => { setError(''); setStep(Math.max(step - 1, 0)); };

  const agregarPago = () => {
    const m = parseFloat(pagoMonto) || (pendiente > 0 ? pendiente : 0);
    if (!m || m <= 0) return setError('Ingrese un monto válido.');
    if (m > pendiente) return setError('El monto excede el total pendiente (S/ ' + pendiente.toFixed(2) + ').');
    setPagos([...pagos, { metodo: pagoMetodo, monto: m }]);
    setPagoMonto('');
    setError('');
  };

  const quitarPago = (idx) => setPagos(pagos.filter((_, i) => i !== idx));

  const agregarGarantia = () => {
    const m = parseFloat(garantiaMonto);
    if (!m || m <= 0) return setError('Ingrese un monto de garantía válido.');
    setGarantias([...garantias, { metodo: garantiaMetodo, monto: m }]);
    setGarantiaMonto('');
    setError('');
  };

  const quitarGarantia = (idx) => setGarantias(garantias.filter((_, i) => i !== idx));

  const totalPagado = pagos.reduce((a, p) => a + p.monto, 0);
  const itemsConDias = useMemo(() => {
    return itemsConMaximo.map(item => {
      const devDate = item.fecha_devolucion_item || fechaDevolucion;
      const tarifa = item.tarifa || 'dia';
      const diasItem = Math.max(1, Math.ceil(
        (new Date(devDate + 'T00:00:00') - new Date(fechaSalida + 'T00:00:00')) / 86400000
      ) + 1);
      const diasHabilesItem = contarHabiles(fechaSalida, devDate);
      let subCalc;
      let mesesItem = 0;
      let diasExtraItem = 0;
      if (tarifa === 'mes' && item.precio_mes != null) {
        const desg = desglosarMensual(fechaSalida, devDate);
        mesesItem = desg.meses;
        diasExtraItem = desg.diasExtra;
        if (desg.meses > 0) {
          const extraRate = item.precio_dia || (item.precio_minimo || 0);
          subCalc = (item.precio_mes * desg.meses + extraRate * desg.diasExtra) * item.cantidad;
        } else {
          subCalc = (item.precio_dia || 0) * diasHabilesItem * item.cantidad;
        }
      } else if (tarifa === 'minimo' && item.precio_minimo != null) {
        subCalc = item.precio_minimo * diasHabilesItem * item.cantidad;
      } else {
        subCalc = (item.precio_dia || 0) * diasHabilesItem * item.cantidad;
      }
      return { ...item, dias_item: diasItem, dias_habiles_item: diasHabilesItem, meses_item: mesesItem, dias_extra_item: diasExtraItem, sub_calc: subCalc, tarifa };
    });
  }, [itemsConMaximo, fechaSalida, fechaDevolucion]);

  const infoTarifa = (item) => {
    if (item.tarifa === 'mes' && item.precio_mes != null) return { precio: item.precio_mes, label: '/mes' };
    if (item.tarifa === 'minimo' && item.precio_minimo != null) return { precio: item.precio_minimo, label: '/día' };
    return { precio: item.precio_dia || 0, label: '/día' };
  };

  const setTarifaItem = (idx, tarifa) => {
    setItems(items.map((it, i) => i === idx ? { ...it, tarifa, total_editado: undefined } : it));
  };

  /* --- Agrupación visual de unidades individuales por familia --- */
  const grupos = useMemo(() => {
    const out = [];
    const porPrefijo = new Map();
    itemsConDias.forEach((item, idx) => {
      if (item.id_herramienta) {
        const prefix = item.id_herramienta.split('-')[0];
        let g = porPrefijo.get(prefix);
        if (!g) {
          g = { key: 'i-' + prefix, tipo: 'grupo', prefix, nombre: item.nombre, descripcion: item.descripcion, items: [] };
          porPrefijo.set(prefix, g);
          out.push(g);
        }
        g.items.push({ ...item, _idx: idx });
      } else {
        out.push({ key: 'u-' + idx, tipo: 'unidad', items: [{ ...item, _idx: idx }] });
      }
    });
    return out;
  }, [itemsConDias]);

  const toggleGrupo = (key) => setGruposAbiertos(p => ({ ...p, [key]: !p[key] }));
  const quitarUltimaDelGrupo = (g) => {
    const ultimo = g.items[g.items.length - 1];
    if (ultimo) quitarItem(ultimo._idx);
  };
  const quitarGrupo = (g) => {
    setItems(items.filter(i => !(i.id_herramienta && i.id_herramienta.split('-')[0] === g.prefix)));
  };

  const renderItemCard = (item, idx, cardKey) => {
    const esGranel = !!item.id_item_granel;
    const esKit = !!item.id_kit;
    const tarifa = item.tarifa || 'dia';
    const refInfo = infoTarifa(item);
    const subCalc = item.sub_calc;
    const sub = item.total_editado != null ? item.total_editado : subCalc;
    const bajoMinimo = tarifa === 'dia' && item.precio_minimo != null && sub < item.precio_minimo * item.dias_habiles_item * item.cantidad;
    return (
      <div key={cardKey}
        className="px-4 py-3 rounded-xl transition-colors duration-150 group"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
        {/* Línea 1: Badge + Nombre + Quitar */}
        <div className="flex items-center gap-2">
          {item.id_herramienta ? (
            <span className="inline-flex px-2 py-0.5 rounded-lg font-mono text-xs font-bold shrink-0"
              style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.10)', color: 'var(--primary)' }}>
              {item.id_herramienta}
            </span>
          ) : esKit ? (
            <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium shrink-0"
              style={{ backgroundColor: 'oklch(0.50 0.11 155 / 0.12)', color: 'var(--success)' }}>
              Kit
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium shrink-0"
              style={{
                backgroundColor: item.condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                color: item.condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)'
              }}>{item.condicion}</span>
          )}
          <span className="flex-1 flex items-center gap-1.5 min-w-0 text-sm font-medium" style={{ color: 'var(--ink)' }}>
            <span className="truncate">{item.nombre}</span>
            <DescripcionPopover text={item.descripcion} />
          </span>
          <button onClick={() => quitarItem(idx)}
            className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
            style={{ color: 'var(--muted)' }}><X size={14} /></button>
        </div>

        {/* Línea 1b: Cantidad (solo granel y kits) */}
        {(esGranel || esKit) && (
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span style={{ color: 'var(--muted)' }}>Cantidad:</span>
            <button onClick={() => cambiarCantidad(idx, -1)}
              className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-black/5"
              style={{ color: 'var(--muted)' }}>&#8722;</button>
            {cantEditando[idx] ? (
              <input
                ref={el => inputCantRefs.current[idx] = el}
                type="number" min="1"
                defaultValue={item.cantidad}
                onBlur={e => { const max = item._maxDisponible || 999; const v = Math.max(1, Math.min(parseInt(e.target.value) || 1, max)); setItems(items.map((it, i) => i === idx ? { ...it, cantidad: v, total_editado: undefined } : it)); setCantEditando(p => ({ ...p, [idx]: false })); }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                className="w-10 h-5 px-0.5 rounded text-xs text-center font-mono border"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                autoFocus
              />
            ) : (
              <span onClick={() => { setCantEditando(p => ({ ...p, [idx]: true })); setTimeout(() => inputCantRefs.current[idx]?.select(), 60); }}
                className="w-8 text-center font-mono text-sm font-semibold cursor-pointer px-0.5 rounded hover:bg-black/5"
                style={{ color: 'var(--ink)' }}>{item.cantidad}</span>
            )}
            <button onClick={() => cambiarCantidad(idx, 1)}
              className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-black/5"
              style={{ color: 'var(--muted)' }}>+</button>
            <span className="text-[10px]" style={{ color: 'var(--faint)' }}>unid.</span>
            <span className="text-[10px] ml-auto shrink-0" style={{
              color: item.cantidad >= item._maxDisponible ? 'var(--danger)' : 'var(--muted)'
            }}>
              Stock: {item._stockOriginal} disp.
            </span>
          </div>
        )}

        {/* Componentes del kit */}
        {esKit && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(item._componentes || []).map((c, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--surface)', color: 'var(--faint)' }}>
                {(c.cantidad * (item.cantidad || 1)) + '× ' + c.nombre}
              </span>
            ))}
          </div>
        )}

        {/* Línea 2: Fecha por ítem + botones rápidos */}
        <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <span>Desde: {new Date(fechaSalida + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="flex items-center gap-1">
            Hasta:
            <DatePicker compacto value={item.fecha_devolucion_item || fechaDevolucion} onChange={(f) => cambiarFechaItem(idx, f)} min={fechaSalida} />
          </span>
          <span className="font-medium" style={{ color: 'var(--info)' }}>
            {tarifa === 'mes' && item.precio_mes != null && item.meses_item > 0
              ? `${item.meses_item} mes${item.meses_item !== 1 ? 'es' : ''}${item.dias_extra_item > 0 ? ` + ${item.dias_extra_item} día${item.dias_extra_item !== 1 ? 's' : ''}` : ''} (${item.dias_habiles_item} día${item.dias_habiles_item !== 1 ? 's' : ''} sin dom.)`
              : `(${item.dias_habiles_item} día${item.dias_habiles_item !== 1 ? 's' : ''} sin dom.)`}
          </span>
        </div>

        {/* Línea 3: Tarifa + Total editable */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="flex gap-px rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setTarifaItem(idx, 'dia')}
              title="Precio normal por día"
              className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
              style={{
                backgroundColor: tarifa === 'dia' ? 'oklch(0.53 0.135 55)' : 'var(--bg)',
                color: tarifa === 'dia' ? '#fff' : 'var(--muted)',
              }}>S/ {(item.precio_dia || 0).toFixed(0)}/día</button>
            {item.precio_minimo != null && (
              <button onClick={() => setTarifaItem(idx, 'minimo')}
                title="Precio mínimo por día"
                className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
                style={{
                  backgroundColor: tarifa === 'minimo' ? 'oklch(0.55 0.12 240)' : 'var(--bg)',
                  color: tarifa === 'minimo' ? '#fff' : 'var(--muted)',
                }}>Min S/ {item.precio_minimo.toFixed(0)}</button>
            )}
            {item.precio_mes != null && (
              <button onClick={() => setTarifaItem(idx, 'mes')}
                title="Precio mensual (de 6 a 6)"
                className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
                style={{
                  backgroundColor: tarifa === 'mes' ? 'oklch(0.50 0.11 155)' : 'var(--bg)',
                  color: tarifa === 'mes' ? '#fff' : 'var(--muted)',
                }}>S/ {item.precio_mes.toFixed(0)}/mes</button>
            )}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--faint)' }}>
            {refInfo.label === '/mes' ? 'plana por mes' : 'por día'}
          </span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>Total:</span>
          {totalEditando[idx] ? (
            <input
              ref={el => inputTotalRefs.current[idx] = el}
              type="number" step="0.01" min="0"
              defaultValue={sub}
              onBlur={e => finalizarEdicionTotal(idx, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') finalizarEdicionTotal(idx, e.target.value); }}
              className="w-24 h-6 px-1 rounded text-xs border font-mono text-center"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                borderColor: bajoMinimo ? 'var(--danger)' : 'var(--success)',
                outline: `2px solid ${bajoMinimo ? 'var(--danger)' : 'var(--success)'}`,
              }}
              autoFocus
            />
          ) : (
            <span
              onClick={() => iniciarEdicionTotal(idx)}
              className="font-mono font-bold text-sm cursor-pointer px-1.5 py-0.5 rounded hover:bg-black/5"
              style={{ color: 'var(--ink)' }}>
              S/ {sub.toFixed(2)}
            </span>
          )}
          {item.total_editado != null && (() => {
            const baseCalc = item.sub_calc;
            const diff = item.total_editado - baseCalc;
            return diff !== 0 ? (
              <span className="text-[9px]" style={{ color: 'var(--danger)' }}>
                ({diff < 0 ? '\u2013S/ ' + Math.abs(diff).toFixed(0) : '+S/ ' + diff.toFixed(0)})
              </span>
            ) : null;
          })()}
        </div>
      </div>
    );
  };

  const totalEquipos = itemsConDias.reduce((a, item) => a + item.sub_calc, 0);
  const pendiente = Math.max(0, totalEquipos - totalPagado);
  const guardar = async () => {
    if (!window.api) return;
    setError('');
    try {
      const esReserva = session.tipo === 'reserva';

const itemsData = itemsConDias.map(item => ({
        tipo_item: item.tipo,
        id_herramienta: item.id_herramienta || undefined,
        id_item_granel: item.id_item_granel || undefined,
        id_kit: item.id_kit || undefined,
        cantidad: item.cantidad || 1,
        fecha_devolucion_pactada: item.fecha_devolucion_item || undefined,
        tarifa_aplicada: item.tarifa || 'dia',
        precio_aplicado: infoTarifa(item).precio,
        total_item_snapshot: item.total_editado != null ? item.total_editado : item.sub_calc,
      }));

      const pagosData = [
        ...pagos.map(p => ({
          ...p,
          tipo: totalPagado >= totalEquipos ? 'saldo' : 'adelanto'
        })),
        ...garantias.map(g => ({
          ...g,
          tipo: 'deposito'
        })),
      ];

      let idContrato;

      if (editContratoId) {
        // Modo edicion
        const editarData = {
          idCliente: clienteSeleccionado?.id || 0,
          dniCliente: dni || '',
          nombreCliente: nombre || '',
          telefonoCliente: telefono || '',
          idUsuario: 1,
          fechaSalida: esReserva ? fechaReserva : fechaSalida,
          fechaDevolucionPactada: fechaDevolucion,
          depositoMonto: 0,
          depositoDni: depositoDni ? 1 : 0,
          items: itemsData,
        };
        if (esReserva) {
          editarData.fechaReserva = fechaReserva;
          await window.api.editarReserva(editContratoId, editarData);
        } else {
          await window.api.editarContrato(editContratoId, editarData);
        }
        idContrato = editContratoId;
        toast((esReserva ? 'Reserva' : 'Alquiler') + ' #' + editContratoId + ' actualizado correctamente');
      } else if (esReserva) {
        const resultado = await window.api.crearReserva({
          idCliente: clienteSeleccionado?.id || 0,
          dniCliente: dni || '',
          nombreCliente: nombre || '',
          telefonoCliente: telefono || '',
          idUsuario: 1,
          fechaReserva,
          fechaDevolucionPactada: fechaDevolucion,
          depositoMonto: 0,
          depositoDni: depositoDni ? 1 : 0,
          items: itemsData,
          pagos: pagosData,
        });
        idContrato = resultado.idContrato;
      } else {
        const resultado = await window.api.crearContrato({
          idCliente: clienteSeleccionado?.id || 0,
          dniCliente: dni || '',
          nombreCliente: nombre || '',
          telefonoCliente: telefono || '',
          idUsuario: 1,
          fechaSalida,
          fechaDevolucionPactada: fechaDevolucion,
          depositoMonto: 0,
          depositoDni: depositoDni ? 1 : 0,
          items: itemsData,
          pagos: pagosData,
        });
        idContrato = resultado.idContrato;
      }

      if (firmaBase64 && !editContratoId) {
        await window.api.guardarFirma(idContrato, firmaBase64);
      }

      if (!editContratoId) {
        try {
          const pdfPath = await window.api.generarContratoPdf(idContrato);
          toast('Contrato #' + idContrato + ' creado. PDF generado.');
        } catch {
          toast('Contrato #' + idContrato + ' creado (sin PDF).', 'warning');
        }
      }

      removeSession(session.id);
      window.dispatchEvent(new CustomEvent('contrato-creado'));
      
      const remainingSessions = sessions.filter(s => !s.saved && s.id !== session.id);
      if (remainingSessions.length === 0) {
        closeDialog();
      } else {
        setActiveId(remainingSessions[0].id);
      }
    } catch (e) {
      setError(e.message || 'Error al guardar contrato.');
    }
  };

  const inputCls = 'w-full h-9 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header + Step indicator — una sola línea */}
      <div className="shrink-0 flex items-center gap-6 px-5 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold shrink-0" style={{ color: 'var(--ink)' }}>
          {editContratoId
            ? (esAlquiler ? 'Editar Alquiler #' : 'Editar Reserva #') + editContratoId
            : (esAlquiler ? 'Nuevo Alquiler' : 'Nueva Reserva')}
        </h2>

        <div className="flex items-center gap-0 flex-1">
          {PASOS.map((p, i) => {
            const completado = step > p.id;
            const actual = step === p.id;
            return (
              <div key={p.id} className="flex items-center gap-0 flex-1 last:flex-none">
                <button
                  onClick={() => { if (completado) { setError(''); setStep(p.id); } }}
                  className="flex items-center gap-1.5 shrink-0"
                  style={{ cursor: completado ? 'pointer' : 'default' }}
                >
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-150"
                    style={{
                      backgroundColor: completado || actual ? accent : 'transparent',
                      color: completado || actual ? '#fff' : 'var(--muted)',
                      border: completado || actual ? 'none' : '1.5px solid var(--border)',
                    }}>
                    {completado ? <CheckCircle2 size={11} /> : (p.id + 1)}
                  </span>
                  <span className="text-[11px] font-medium hidden sm:inline"
                    style={{ color: completado || actual ? 'var(--ink)' : 'var(--muted)' }}>{p.label}</span>
                </button>
                {i < 2 && <div className="flex-1 h-0.5 mx-1.5 rounded" style={{ backgroundColor: completado ? accent : 'var(--border)' }} />}
              </div>
            );
          })}
        </div>

        </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
        )}

        {/* ===== PASO 1: CLIENTE + FECHAS ===== */}
        {step === 0 && (
          <div className="flex-1 overflow-y-auto p-5 max-w-xl mx-auto space-y-4">
            {/* DNI + botón RENIEC */}
            <div>
              <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>DNI</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input ref={dniRef} value={dni} onChange={(e) => { setDni(e.target.value.replace(/\D/g, '').slice(0, 8)); setClienteSeleccionado(null); setDniFocus(true); }}
                    onBlur={() => setTimeout(() => setDniFocus(false), 200)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setSugerenciasDni([]); setDniFocus(false); e.currentTarget.blur(); } }}
                    className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                    placeholder="8 dígitos" maxLength={8} />
                  {dniFocus && sugerenciasDni.length > 0 && (
                    <div className="fixed z-[100] bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg max-h-44 overflow-y-auto"
                      style={{ top: (dniRef.current?.getBoundingClientRect().bottom || 0) + 4, left: dniRef.current?.getBoundingClientRect().left || 0, width: dniRef.current?.getBoundingClientRect().width || 300 }}>
                  {sugerenciasDni.map((c) => (
                    <button key={c.id} onClick={() => seleccionarCliente(c)}
                      className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 hover:bg-[var(--surface)] flex items-center justify-between gap-2"
                      style={{ backgroundColor: c.en_lista_negra ? 'oklch(0.95 0.015 25)' : 'transparent' }}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate" style={{ color: 'var(--ink)' }}>{c.nombre}</span>
                          {c.en_lista_negra ? <span className="text-[9px] font-bold shrink-0" style={{ color: 'var(--danger)' }}>LISTA NEGRA</span> : null}
                        </div>
                        {c.etiquetas?.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {c.etiquetas.slice(0, 2).map((t) => <TagChip key={t.id} tag={t} />)}
                            {c.etiquetas.length > 2 && (
                              <span className="text-[9px] font-semibold" style={{ color: 'var(--faint)' }}>+{c.etiquetas.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="font-mono shrink-0" style={{ color: 'var(--muted)' }}>{c.dni}</span>
                    </button>
                  ))}
                    </div>
                  )}
                </div>
                <button
                  disabled={dni.length !== 8 || consultandoReniec}
                  onClick={async () => {
                    if (dni.length !== 8 || !window.api) return;
                    setConsultandoReniec(true);
                    try {
                      const result = await window.api.consultarDni(dni);
                      setNombre(result.nombre_completo || '');
                      setClienteSeleccionado(null);
                      toast('Datos obtenidos de RENIEC');
                    } catch (e) {
                      toast(e.message || 'Error al consultar RENIEC', 'error');
                    } finally {
                      setConsultandoReniec(false);
                    }
                  }}
                  className="h-9 px-3 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1 shrink-0"
                    style={{
                      backgroundColor: dni.length === 8 ? 'oklch(0.48 0.10 330)' : 'var(--surface)',
                      color: dni.length === 8 ? '#fff' : 'var(--faint)',
                      border: dni.length === 8 ? 'none' : '1px solid var(--border)',
                      cursor: dni.length === 8 ? 'pointer' : 'not-allowed',
                      opacity: consultandoReniec ? 0.7 : 1,
                    }}>
                  <Search size={12} />
                  {consultandoReniec ? 'Consultando...' : 'RENIEC'}
                </button>
              </div>
            </div>

            {/* Nombre completo */}
            <div className="relative">
              <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>Nombre completo</label>
              <input ref={nombreRef} value={nombre} onChange={(e) => { setNombre(e.target.value); setClienteSeleccionado(null); setNombreFocus(true); }}
                onBlur={() => setTimeout(() => setNombreFocus(false), 200)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSugerenciasNombre([]); setNombreFocus(false); e.currentTarget.blur(); } }}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                placeholder={clienteSeleccionado ? '' : 'Buscar o escribir'} />
              {nombreFocus && sugerenciasNombre.length > 0 && (
                <div className="fixed z-[100] bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg max-h-44 overflow-y-auto"
                  style={{ top: (nombreRef.current?.getBoundingClientRect().bottom || 0) + 4, left: nombreRef.current?.getBoundingClientRect().left || 0, width: nombreRef.current?.getBoundingClientRect().width || 300 }}>
                  {sugerenciasNombre.map((c) => (
                    <button key={c.id} onClick={() => seleccionarCliente(c)}
                      className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 hover:bg-[var(--surface)] flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="truncate block" style={{ color: 'var(--ink)' }}>{c.nombre}</span>
                        {c.etiquetas?.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {c.etiquetas.slice(0, 2).map((t) => <TagChip key={t.id} tag={t} />)}
                            {c.etiquetas.length > 2 && (
                              <span className="text-[9px] font-semibold" style={{ color: 'var(--faint)' }}>+{c.etiquetas.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {c.dni && <span className="font-mono shrink-0" style={{ color: 'var(--muted)' }}>{c.dni}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {clienteSeleccionado?.en_lista_negra ? (
              <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)' }}>
                <AlertTriangle size={13} className="shrink-0" />
                <span>Este cliente está en lista negra. Verifique antes de continuar.</span>
              </div>
            ) : null}

            {clienteSeleccionado && (
              <div className="space-y-1.5 px-1">
                <div className="flex items-center gap-2">
                  <CalificacionBadge
                    promedio={clienteSeleccionado.promedio_estrellas}
                    total={clienteSeleccionado.total_calificaciones}
                  />
                  {clienteSeleccionado.promedio_estrellas && (
                    <StarRating value={clienteSeleccionado.promedio_estrellas} readonly size={12} />
                  )}
                  <span className="text-[10px]" style={{ color: 'var(--faint)' }}>
                    {clienteSeleccionado.total_alquileres || 0} alquiler{clienteSeleccionado.total_alquileres !== 1 ? 'es' : ''}
                  </span>
                  <button
                    onClick={() => setDetalleCliente(clienteSeleccionado)}
                    className="p-1 rounded-md hover:bg-[var(--surface)] transition-colors"
                    style={{ color: 'var(--faint)' }}
                    title="Ver detalle del cliente"
                  >
                    <Info size={12} />
                  </button>
                </div>
                {clienteSeleccionado.etiquetas?.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {clienteSeleccionado.etiquetas.map((t) => <TagChip key={t.id} tag={t} />)}
                  </div>
                )}
              </div>
            )}

            {/* Teléfono */}
            <div>
              <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>Teléfono <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 9))}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                placeholder="9 dígitos" maxLength={9} />
            </div>

            {/* Fecha de reserva (solo para tipo reserva) */}
            {session.tipo === 'reserva' && (
              <div>
                <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>
                  Fecha de reserva <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <DatePicker amplio value={fechaReserva} onChange={setFechaReserva} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--faint)' }}>
                  Fecha en que el cliente vendrá a recoger los equipos
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== PASO 2: EQUIPOS ===== */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col space-y-3">
            {/* Barra de fechas globales */}
            <div className="flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--surface)', border: '0.5px solid var(--border)' }}>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>Salida</span>
              <DatePicker compacto value={fechaSalida} onChange={setFechaSalida} />
              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>→</span>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>Devolución</span>
              <DatePicker compacto value={fechaDevolucion} onChange={setFechaDevolucion} min={fechaSalida} error={fechaDevolucion < fechaSalida} />
              {items.length > 0 && (
                <button onClick={() => setItems(items.map(i => ({
                  ...i,
                  fecha_devolucion_item: fechaDevolucion,
                  total_editado: undefined,
                })))}
                  className="px-2 h-6 rounded text-[10px] font-medium transition-all duration-150 shrink-0"
                  style={{ backgroundColor: 'oklch(0.55 0.13 240)', color: '#fff', border: 'none' }}>
                  Aplicar a todo
                </button>
              )}
            </div>
            {/* Buscador unificado */}
            <div className="relative shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
              <input type="text" placeholder="Buscar herramienta o material..." value={busquedaEquipo}
                onChange={(e) => { setBusquedaEquipo(e.target.value); setEquipoIndex(-1); }}
                onFocus={() => setEquipoFoco(true)}
                onBlur={() => setTimeout(() => setEquipoFoco(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setEquipoIndex(i => Math.min(i + 1, resultadosUnificados.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setEquipoIndex(i => Math.max(i - 1, -1)); }
                  if (e.key === 'Enter' && equipoIndex >= 0 && resultadosUnificados[equipoIndex]) {
                    const r = resultadosUnificados[equipoIndex];
                    if (r._tipo === 'herramienta') agregarHerramienta(r);
                    else if (r._tipo === 'kit') agregarKit(r);
                    else agregarGranel(r);
                    setEquipoIndex(-1);
                  }
                  if (e.key === 'Escape') { setBusquedaEquipo(''); setEquipoIndex(-1); setEquipoFoco(false); e.currentTarget.blur(); }
                }}
                ref={busquedaRef}
                className="w-full h-9 pl-8 pr-8 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              {busquedaEquipo && (
                <button onClick={() => setBusquedaEquipo('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5" style={{ color: 'var(--faint)' }}>✕</button>
              )}
              {equipoFoco && busquedaEquipo && resultadosUnificados.length > 0 && (
                <div className="fixed z-[100] bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg max-h-56 overflow-y-auto"
                  style={{ top: (busquedaRef.current?.getBoundingClientRect().bottom || 0) + 4, left: busquedaRef.current?.getBoundingClientRect().left || 0, width: busquedaRef.current?.getBoundingClientRect().width || 300 }}>
                  {resultadosUnificados.map((r, idx) => {
                    const esHerr = r._tipo === 'herramienta';
                    const enLista = r._enLista;
                    const enOtraSesion = esHerr && !enLista && herramientasEnOtrasSesiones.has(r.id);
                    const disponible = esHerr
                      ? ((r.estado === 'disponible' && !enLista && !enOtraSesion) || r._enContratoEditado)
                      : (r._dispEfectivo > 0);

                    let tooltip = '';
                    if (!disponible) {
                      if (esHerr) {
                        if (enOtraSesion) tooltip = 'Reservada en otra sesión activa';
                        else if (enLista) tooltip = 'Ya está en este alquiler';
                        else tooltip = r.estado === 'alquilado' ? 'Alquilada' : r.estado === 'mantenimiento' ? 'En mantenimiento' : 'Malograda';
                      } else {
                        tooltip = 'Sin stock disponible';
                      }
                    } else if (!esHerr && enLista) {
                      tooltip = 'Agregar otra unidad (stock: ' + r._dispEfectivo + ')';
                    }
                    const destacado = idx === equipoIndex;
                    return (
                      <button key={esHerr ? r.id : (r._tipo === 'kit' ? 'k' + r.id : 'g' + r.id)} disabled={!disponible}
                        title={tooltip}
                        onClick={() => {
                          if (!disponible) {
                            toast(tooltip, 'warning');
                            return;
                          }
                          esHerr ? agregarHerramienta(r) : (r._tipo === 'kit' ? agregarKit(r) : agregarGranel(r));
                        }}
                        className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 flex items-center gap-3 disabled:opacity-40"
                        style={{
                          cursor: disponible ? 'pointer' : 'not-allowed',
                          backgroundColor: destacado ? 'var(--surface)' : 'var(--bg)',
                        }}>
                        {esHerr ? (
                          <span className="font-mono font-medium shrink-0 w-14" style={{ color: 'var(--primary)' }}>{r.id}</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                            style={{ backgroundColor: r.condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)', color: r.condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)' }}>{r.condicion}</span>
                        )}
                        <span className="flex-1 flex items-center gap-1.5 min-w-0" style={{ color: 'var(--ink)' }}>
                          <span className="truncate">{r.nombre}</span>
                          <DescripcionPopover text={r.descripcion} />
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
                          style={{ backgroundColor: esHerr ? 'oklch(0.55 0.08 240 / 0.10)' : (r._tipo === 'kit' ? 'oklch(0.50 0.11 155 / 0.10)' : 'oklch(0.62 0.13 75 / 0.10)'), color: esHerr ? 'var(--info)' : (r._tipo === 'kit' ? 'var(--success)' : 'var(--warning)') }}>
                          {esHerr ? 'Herr.' : (r._tipo === 'kit' ? 'Kit' : 'Mat.')}
                        </span>
                        <span className="text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>S/ {r.precio_dia.toFixed(2)}</span>
                        {enOtraSesion && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                            style={{ backgroundColor: 'oklch(0.93 0.04 240)', color: 'var(--info)' }}>
                            En otro alquiler
                          </span>
                        )}
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold shrink-0" style={{
                          backgroundColor: enLista ? 'oklch(0.93 0.04 240)' : (disponible ? 'oklch(0.93 0.07 160)' : 'oklch(0.93 0.05 25)'),
                          color: enLista ? 'var(--info)' : (disponible ? 'oklch(0.40 0.10 160)' : 'oklch(0.40 0.15 25)'),
                        }}>{enLista ? 'Agregado' : (esHerr ? (r.estado === 'disponible' ? 'Disp.' : r.estado) : (r._dispEfectivo > 0 ? r._dispEfectivo + ' disp.' : 'Sin stock'))}</span>
                        {!esHerr && enLista && r._dispEfectivo > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded font-semibold shrink-0"
                            style={{ backgroundColor: 'oklch(0.93 0.07 160)', color: 'oklch(0.40 0.10 160)' }}>{r._dispEfectivo} disp.</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lista de ítems agregados */}
            <div className="flex-1 overflow-y-auto px-1 space-y-1.5">
              {itemsConMaximo.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs" style={{ color: 'var(--faint)' }}>Busque y agregue herramientas o materiales</p>
                </div>
              ) : (
                <>
                  {grupos.map((g) => {
                    if (g.tipo === 'unidad') {
                      const item = g.items[0];
                      return renderItemCard(item, item._idx, g.key);
                    }
                    const abierto = !!gruposAbiertos[g.key];
                    const totalGrupo = g.items.reduce((a, it) => a + (it.total_editado != null ? it.total_editado : it.sub_calc), 0);
                    return (
                      <div key={g.key} className="rounded-xl transition-colors duration-150 overflow-hidden"
                        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                        <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
                          onClick={() => toggleGrupo(g.key)}>
                          <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--muted)', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                          <span className="flex-1 flex items-center gap-1.5 min-w-0 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                            <span className="truncate">{g.nombre}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-bold shrink-0"
                              style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.10)', color: 'var(--primary)' }}>
                              &times;{g.items.length}
                            </span>
                            <DescripcionPopover text={g.descripcion} />
                          </span>
                          <span className="font-mono text-xs font-bold shrink-0" style={{ color: 'var(--ink)' }}>
                            S/ {totalGrupo.toFixed(2)}
                          </span>
                          <span className="text-[10px] shrink-0" style={{ color: 'var(--faint)' }}>
                            {abierto ? 'ocultar' : g.items.length + ' unidad' + (g.items.length !== 1 ? 'es' : '')}
                          </span>
                          <button title="Quitar la última unidad agregada"
                            onClick={(e) => { e.stopPropagation(); quitarUltimaDelGrupo(g); }}
                            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                            style={{ color: 'var(--muted)' }}>&#8722;</button>
                          <button title="Quitar todas"
                            onClick={(e) => { e.stopPropagation(); quitarGrupo(g); }}
                            className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                            style={{ color: 'var(--muted)' }}><X size={14} /></button>
                        </div>
                        {abierto && (
                          <div className="px-2 pb-2 space-y-2">
                            {g.items.map(it => renderItemCard(it, it._idx, it.id_herramienta || ('u-' + (it.id_item_granel || it.id_kit || it._idx))))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ borderTop: '2px solid var(--border)', backgroundColor: 'transparent' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                      {itemsConMaximo.length} ítem{itemsConMaximo.length !== 1 ? 's' : ''} (cada uno con su fecha)
                    </span>
                    <span className="text-sm font-mono font-bold" style={{ color: 'var(--ink)' }}>
                      S/ {itemsConDias.reduce((a, item) => a + item.sub_calc, 0).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== PASO 3: CONTRATO + FIRMA ===== */}
        {step === 2 && (
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <div className="grid grid-cols-2 gap-4" style={{ minHeight: '100%' }}>
              {/* COLUMNA IZQUIERDA: Texto legal */}
              <div className="flex flex-col space-y-2 overflow-y-auto">
                <div className="flex-1 rounded-lg border p-3 text-[11px] leading-relaxed"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                  {clausulas
                    ? clausulas
                      .replaceAll('[ARRENDADORA_NOMBRE]', 'SOLEDAD SUPANTA QUISPE')
                      .replaceAll('[ARRENDADORA_DNI]', '72094861')
                      .replaceAll('[ARRENDADORA_DIRECCION]', 'Av. Los Pinos N° 348')
                      .replaceAll('[CLIENTE_NOMBRE]', nombre || '—')
                      .replaceAll('[CLIENTE_DNI]', dni || '—')
                      .replaceAll('[CLIENTE_DIRECCION]', '—')
                      .replaceAll('[TOTAL]', 'S/ ' + itemsConDias.reduce((a, item) => a + item.sub_calc, 0).toFixed(2))
                      .replaceAll('[FECHA_INICIO]', fechaSalida)
                      .replaceAll('[FECHA_DEVOLUCION]', fechaDevolucion)
                      .replaceAll('[DEPOSITO_TEXTO]', '')
                      .split('\n\n')
                      .map((p, i) => {
                        const firstWord = p.trim().split(':')[0];
                        const isTitulo = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO','SEXTO','SÉPTIMO'].includes(firstWord);
                        let html = p.trim();
                        if (!isTitulo) {
                          html = html.replace('SOLEDAD SUPANTA QUISPE', '<strong>SOLEDAD SUPANTA QUISPE</strong>');
                          html = html.replace('72094861', '<strong>72094861</strong>');
                          if (dni) html = html.replace(dni, `<strong>${dni}</strong>`);
                          if (nombre) html = html.replace(nombre, `<strong>${nombre}</strong>`);
                        }
                        return (
                          <p key={i} className="mb-1" style={{ fontWeight: isTitulo ? 'bold' : 'normal', color: 'var(--muted)' }}
                            dangerouslySetInnerHTML={{ __html: html }} />
                        );
                      })
                    : <p style={{ color: 'var(--faint)' }}>Cargando cláusulas...</p>
                  }
                </div>
                <button
                  onClick={async () => {
                    if (!window.api) return;
                    try {
                      const total = itemsConDias.reduce((a, item) => a + item.sub_calc, 0);
                      const pdfPath = await window.api.generarPdfPreview({
                        arrendadora: { nombre: 'SOLEDAD SUPANTA QUISPE', dni: '72094861', ruc: '10720948619', direccion: 'Av. Los Pinos N° 348', telefono: '985618849' },
                        cliente: { nombre: nombre || '—', dni: dni || '—', telefono: telefono || '—', direccion: '' },
                        items: itemsConDias.map(item => ({ codigo: item.id_herramienta || (item.nombre + ' (' + item.condicion + ')'), nombre: item.nombre, cantidad: item.cantidad, precio_dia: infoTarifa(item).precio, tarifa: item.tarifa || 'dia', snapshot: item.sub_calc, desglose: item._componentes ? item._componentes.map(c => ({ cantidad: c.cantidad * (item.cantidad || 1), nombre: c.nombre })) : undefined, fecha_devolucion_pactada: item.fecha_devolucion_item || fechaDevolucion })),
                        fechas: { salida: fechaSalida, devolucion: fechaDevolucion },
                        total, firmaBase64: firmaBase64 || null,
                      });
                      setPdfPreviewPath(pdfPath);
                      const b64 = await window.api.leerArchivoBase64(pdfPath);
                      setPdfPreviewUrl('data:application/pdf;base64,' + b64);
                    } catch (e) { toast('Error: ' + (e.message || e), 'error'); }
                  }}
                  className="text-xs underline hover:opacity-70 text-left"
                  style={{ color: 'var(--muted)' }}
                >👁 Previsualizar PDF</button>
                <div className="mt-3">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--ink)' }}>Firma del cliente</p>
                  {firmaBase64 ? (
                    <div className="space-y-2">
                      <div className="border rounded-lg p-2 bg-white flex items-center justify-center" style={{ borderColor: 'var(--border)', height: 80 }}>
                        <img src={firmaBase64} alt="Firma" className="max-h-full" />
                      </div>
                      <button onClick={() => setFirmaBase64(null)}
                        className="text-[11px] px-2 py-1 rounded border hover:bg-red-50 dark:hover:bg-red-950"
                        style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Limpiar firma</button>
                    </div>
                  ) : (
                    <SignaturePad onSave={(dataUrl) => setFirmaBase64(dataUrl)} disabled={false} />
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: Recibo + Dinero */}
              <div className="flex flex-col space-y-2 overflow-y-auto">
                {/* Bloque 1: Cliente compacto */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-lg shrink-0">&#128100;</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{nombre || 'Cliente'}</p>
                    {dni && <p className="text-[11px]" style={{ color: 'var(--muted)' }}>DNI {dni}</p>}
                  </div>
                </div>

                {/* Bloque 2: El Recibo */}
                <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                  {itemsConDias.length === 0 ? (
                    <p style={{ color: 'var(--faint)' }}>Sin equipos</p>
                  ) : (
                    <div className="space-y-1">
                      {(() => {
                        const filas = [];
                        const porPrefijo = new Map();
                        itemsConDias.forEach((item) => {
                          if (item.id_herramienta) {
                            const prefix = item.id_herramienta.split('-')[0];
                            let g = porPrefijo.get(prefix);
                            if (!g) {
                              g = { prefix, nombre: item.nombre, items: [] };
                              porPrefijo.set(prefix, g);
                              filas.push(g);
                            }
                            g.items.push(item);
                          } else {
                            filas.push({ prefix: null, nombre: item.nombre, items: [item] });
                          }
                        });
                        return filas.map((f, i) => {
                          const total = f.items.reduce((a, it) => a + (it.total_editado != null ? it.total_editado : it.sub_calc), 0);
                          const cant = f.items.length;
                          const first = f.items[0];
                          const multi = !!first.id_herramienta && cant > 1;
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <span className="font-mono text-[9px] shrink-0" style={{ color: 'var(--info)' }}>
                                {multi ? first.id_herramienta.split('-')[0] : (first.id_herramienta || first.condicion)}
                              </span>
                              <span className="flex-1 truncate text-[12px]" style={{ color: 'var(--ink)' }}>
                                {f.nombre}
                                {first.id_herramienta ? (multi ? ' ×' + cant : '') : (' x' + (first.cantidad || 1))}
                                {!multi && (
                                  <span className="text-[10px] ml-1" style={{ color: 'var(--info)' }}>
                                    {first.tarifa === 'mes' && first.precio_mes != null && first.meses_item > 0
                                      ? `(${first.meses_item} mes${first.meses_item !== 1 ? 'es' : ''}${first.dias_extra_item > 0 ? ` + ${first.dias_extra_item} día${first.dias_extra_item !== 1 ? 's' : ''}` : ''})`
                                      : `(${first.dias_habiles_item} día${first.dias_habiles_item !== 1 ? 's' : ''} sin dom.)`}
                                  </span>
                                )}
                              </span>
                              <span className="font-mono shrink-0 text-[12px]" style={{ color: 'var(--ink)' }}>
                                S/ {total.toFixed(2)}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 8, marginBottom: 6 }} />
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-sm" style={{ color: 'var(--ink)' }}>TOTAL</span>
                    <span className="font-mono font-bold text-sm" style={{ color: 'var(--success)' }}>S/ {itemsConDias.reduce((a, item) => a + item.sub_calc, 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Bloque 3: Acciones de dinero */}
                <div className="rounded-lg border p-3 text-xs space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
                  {/* Fila: Cobrar adelanto */}
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>Cobrar adelanto</p>
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'efectivo', color: 'oklch(0.55 0.13 155)', label: 'Efectivo' },
                        { id: 'yape', color: 'oklch(0.48 0.14 330)', label: 'Yape' },
                        { id: 'plin', color: 'oklch(0.55 0.12 240)', label: 'Plin' },
                      ].map(m => (
                        <button key={m.id} onClick={() => setPagoMetodo(m.id)}
                          className="h-7 px-2.5 rounded text-[11px] font-medium transition-all duration-150"
                          style={{
                            backgroundColor: pagoMetodo === m.id ? m.color : 'var(--surface)',
                            color: pagoMetodo === m.id ? '#fff' : 'var(--muted)',
                            border: pagoMetodo === m.id ? 'none' : '0.5px solid var(--border)',
                          }}>{m.label}</button>
                      ))}
                      <input type="number" step="1" min="0" value={pagoMonto}
                        placeholder={pendiente > 0 ? pendiente.toFixed(0) : '0'}
                        onChange={e => setPagoMonto(e.target.value)}
                        className="w-24 h-7 px-1 rounded text-[11px] border font-mono text-center"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--ink)',
                          borderColor: 'var(--border)',
                          MozAppearance: 'textfield',
                        }}
                        onFocus={e => e.target.addEventListener('wheel', e => e.preventDefault(), { passive: false })} />
                      <button onClick={agregarPago}
                        className="h-7 px-3 rounded text-[11px] font-semibold transition-all duration-150 active:scale-[0.97]"
                        style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}>+</button>
                    </div>
                    {pagos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pagos.map((p, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] capitalize"
                            style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                            {p.metodo} S/ {p.monto.toFixed(2)}
                            <button onClick={() => quitarPago(idx)} className="hover:text-red-500">&#10005;</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Fila: Garantía */}
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'oklch(0.55 0.12 70)' }}>Retener garant&iacute;a (opcional)</p>
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'efectivo', color: 'oklch(0.55 0.13 155)', label: 'Efectivo' },
                        { id: 'yape', color: 'oklch(0.48 0.14 330)', label: 'Yape' },
                        { id: 'plin', color: 'oklch(0.55 0.12 240)', label: 'Plin' },
                      ].map(m => (
                        <button key={m.id} onClick={() => setGarantiaMetodo(m.id)}
                          className="h-7 px-2.5 rounded text-[11px] font-medium transition-all duration-150"
                          style={{
                            backgroundColor: garantiaMetodo === m.id ? m.color : 'var(--surface)',
                            color: garantiaMetodo === m.id ? '#fff' : 'var(--muted)',
                            border: garantiaMetodo === m.id ? 'none' : '0.5px solid var(--border)',
                          }}>{m.label}</button>
                      ))}
                      <input type="number" step="1" min="0" value={garantiaMonto}
                        placeholder="0"
                        onChange={e => setGarantiaMonto(e.target.value)}
                        className="w-24 h-7 px-1 rounded text-[11px] border font-mono text-center"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--ink)',
                          borderColor: 'var(--border)',
                          MozAppearance: 'textfield',
                        }}
                        onFocus={e => e.target.addEventListener('wheel', e => e.preventDefault(), { passive: false })} />
                      <button onClick={agregarGarantia}
                        className="h-7 px-3 rounded text-[11px] font-semibold transition-all duration-150 active:scale-[0.97]"
                        style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}>+</button>
                    </div>
                    {garantias.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {garantias.map((g, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] capitalize"
                            style={{ backgroundColor: 'oklch(0.95 0.06 75 / 0.3)', color: 'oklch(0.55 0.12 70)' }}>
                            {g.metodo} S/ {g.monto.toFixed(2)}
                            <button onClick={() => quitarGarantia(idx)} className="hover:text-red-500">&#10005;</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloque 4: Estado de cuenta */}
                <div className="rounded-lg border p-2.5 text-xs space-y-1" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Pagado</span>
                    <span className="font-mono" style={{ color: 'var(--success)' }}>S/ {totalPagado.toFixed(2)}</span>
                  </div>
                  {garantias.length > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--muted)' }}>Garant&iacute;a</span>
                      <span className="font-mono" style={{ color: 'var(--info)' }}>S/ {garantias.reduce((a, g) => a + g.monto, 0).toFixed(2)}</span>
                    </div>
                  )}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 2, marginBottom: 2 }} />
                  <div className="flex justify-between font-semibold">
                    <span style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {pendiente > 0 ? 'SALDO PENDIENTE' : 'COMPLETADO'}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      S/ {pendiente.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal PDF Preview */}
      {pdfPreviewPath && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.6)' }}
          onClick={() => { setPdfPreviewPath(null); setPdfPreviewUrl(null); }}>
          <div className="w-[95vw] h-[95vh] max-w-[1100px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--bg)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Previsualización del Contrato</span>
              <button onClick={() => { setPdfPreviewPath(null); setPdfPreviewUrl(null); }} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
                <X size={16} />
              </button>
            </div>
            {pdfPreviewUrl && (
              <embed src={pdfPreviewUrl} type="application/pdf" className="flex-1 w-full border-0" />
            )}
          </div>
        </div>
      )}


      {/* Botones navegación */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button onClick={anterior} disabled={step === 0}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-30"
          style={{ color: 'var(--muted)' }}>
          <ChevronLeft size={14} /> Anterior
        </button>

        {step < 2 ? (
          <button onClick={siguiente}
            className="flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97]"
            style={{ backgroundColor: accent, color: '#fff' }}>
            Siguiente <ChevronRight size={14} />
          </button>
        ) : (
          <button onClick={guardar}
            className="flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97]"
            style={{ backgroundColor: 'var(--success)', color: '#fff' }}>
            <CheckCircle2 size={14} /> Guardar {esAlquiler ? 'Alquiler' : 'Reserva'}
          </button>
        )}
      </div>

      {detalleCliente && (
        <DetalleClienteModal
          cliente={detalleCliente}
          onClose={() => setDetalleCliente(null)}
        />
      )}
    </div>
  );
}
