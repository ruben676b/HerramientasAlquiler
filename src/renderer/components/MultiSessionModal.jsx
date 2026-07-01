import { X, Plus, Circle, CheckCircle2, Clock, ChevronLeft, ChevronRight, User, Wrench, DollarSign, Search, AlertTriangle, Package, FileText } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { useSessions } from '../contexts/SessionsContext';
import { useToast } from './Toast';
import { cn } from '../lib/utils';
import SignaturePad from './SignaturePad';
import Button from './ui/button';

export default function MultiSessionModal() {
  const {
    sessions, isOpen, activeId, closeDialog,
    setActiveId, addSession, removeSession,
  } = useSessions();

  const [confirmDelete, setConfirmDelete] = useState(null);

  if (!isOpen) return null;

  const activeSessions = sessions.filter((s) => !s.saved);
  const activeSession = activeSessions.find((s) => s.id === activeId);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
      onClick={closeDialog}
    >
      <div
        className="m-auto w-[98vw] max-w-[1400px] h-[92vh] rounded-2xl flex overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar global */}
        <button onClick={closeDialog} className="absolute top-3 right-3 z-50 p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--muted)' }}><X size={18} /></button>

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
  const { updateSession, closeDialog, markSaved, loadFormData, saveFormData, sessions } = useSessions();
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
    setFechaSalida(data.fechaSalida || new Date().toISOString().slice(0, 10));
    setFechaDevolucion(data.fechaDevolucion || new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    setClienteSeleccionado(data.clienteSeleccionado || null);
    setItems(data.items || []);
    setStep(data.step || 0);
    setError('');
    setBusquedaEquipo('');
    setSugerenciasDni([]);
    setSugerenciasNombre([]);
    setPagos(data.pagos || []);
    setDepositoDni(data.depositoDni || false);
    // Actualizar nombre de sesión con los datos CARGADOS
    const displayName = nuevoNombre || (nuevoDni.length === 8 ? 'DNI ' + nuevoDni : null);
    if (displayName) {
      updateSession(session.id, { clientName: displayName });
    }
  }, [session.id]);

  const [step, setStep] = useState(session.step || 0);
  const [error, setError] = useState('');
  const [dni, setDni] = useState(saved.dni || '');
  const [nombre, setNombre] = useState(saved.nombre || '');
  const [telefono, setTelefono] = useState(saved.telefono || '');
  const [fechaSalida, setFechaSalida] = useState(saved.fechaSalida || new Date().toISOString().slice(0, 10));
  const [fechaDevolucion, setFechaDevolucion] = useState(
    saved.fechaDevolucion || new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [sugerenciasDni, setSugerenciasDni] = useState([]);
  const [sugerenciasNombre, setSugerenciasNombre] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(saved.clienteSeleccionado || null);
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
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [todasHerramientas, setTodasHerramientas] = useState([]);
  const [granelCat, setGranelCat] = useState([]);
  const [items, setItems] = useState(saved.items || []);

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
    ]).then(([h, g]) => {
      setTodasHerramientas(h);
      setGranelCat(g);
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

  // Actualizar nombre de sesión cuando el usuario escribe
  useEffect(() => {
    if (!nombre && dni.length !== 8) return;
    const displayName = nombre || ('DNI ' + dni);
    updateSession(session.id, { clientName: displayName });
  }, [nombre, dni]);

  // Auto-guardar items
  useEffect(() => {
    saveFormData(session.id, { dni, nombre, telefono, fechaSalida, fechaDevolucion, clienteSeleccionado, items, step, firmaBase64, pagos, depositoMonto, depositoDni });
  }, [items, dni, nombre, telefono, fechaSalida, fechaDevolucion, clienteSeleccionado, session.id, step, pagos]);

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
      .filter(h => h.id.toLowerCase().includes(q) || h.nombre.toLowerCase().includes(q) || h.id.replace('-', '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.estado === 'disponible' && b.estado !== 'disponible') return -1;
        if (b.estado === 'disponible' && a.estado !== 'disponible') return 1;
        return 0;
      })
      .slice(0, 8)
      .map(h => ({ ...h, _tipo: 'herramienta', _enLista: items.some(i => i.id_herramienta === h.id) }));
    const gran = granelCat
      .filter(g => g.nombre.toLowerCase().includes(q))
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
    return [...herr, ...gran];
  }, [busquedaEquipo, todasHerramientas, granelCat, items]);

  const agregarHerramienta = (h) => {
    if (h.estado !== 'disponible') return;
    if (items.find((i) => i.id_herramienta === h.id)) {
      toast(h.id + ' ya está agregada en este alquiler', 'warning');
      return;
    }
    setItems([...items, { tipo: 'individual', id_herramienta: h.id, nombre: h.nombre, precio_dia: h.precio_dia, cantidad: 1 }]);
  };

  const agregarGranel = (g) => {
    if (g.cantidad_disponible < 1) return setError('Stock insuficiente.');
    const existente = items.find((i) => i.id_item_granel === g.id);
    if (existente) {
      setItems(items.map((i) => i.id_item_granel === g.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setItems([...items, { tipo: 'granel', id_item_granel: g.id, nombre: g.nombre, condicion: g.condicion, precio_dia: g.precio_dia, cantidad: 1 }]);
    }
  };

  const quitarItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const cambiarCantidad = (idx, delta) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const max = item._maxDisponible || 999;
      const nueva = Math.max(1, Math.min(max, item.cantidad + delta));
      return { ...item, cantidad: nueva };
    }));
  };

  // Calcular máximo disponible por ítem granel (considerando otras sesiones)
  const itemsConMaximo = useMemo(() => {
    return items.map(item => {
      if (item.tipo !== 'granel') return item;
      const original = granelCat.find(g => g.id === item.id_item_granel);
      const enOtras = granelEnOtrasSesiones[item.id_item_granel] || 0;
      const max = original ? Math.max(1, original.cantidad_disponible - enOtras) : 999;
      return { ...item, _maxDisponible: max, _stockOriginal: original?.cantidad_disponible || 0 };
    });
  }, [items, granelCat, granelEnOtrasSesiones]);



  const esAlquiler = session.tipo === 'alquiler';
  const accent = esAlquiler ? 'oklch(0.50 0.11 155)' : 'oklch(0.52 0.08 240)';
  const dias = Math.max(1, Math.ceil((new Date(fechaDevolucion + 'T00:00:00') - new Date(fechaSalida + 'T00:00:00')) / 86400000));

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
    setTelefono(c.telefono ? String(c.telefono) : '');
    setSugerenciasDni([]);
    setSugerenciasNombre([]);
  };

  const siguiente = () => {
    setError('');
    if (step === 0) {
      if (!dni && !nombre) return setError('Ingrese el DNI o el nombre del cliente.');
      if (dni && dni.length !== 8) return setError('El DNI debe tener 8 dígitos.');
      if (fechaDevolucion <= fechaSalida) return setError('La devolución debe ser posterior a la salida.');
    }
    if (step === 1 && items.length === 0) return setError('Agregue al menos un ítem al alquiler.');
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

  const totalPagado = pagos.reduce((a, p) => a + p.monto, 0);
  const totalEquipos = itemsConMaximo.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0);
  const pendiente = Math.max(0, totalEquipos - totalPagado);
  const guardar = async () => {
    if (!window.api) return;
    setError('');
    try {
      // 1. Crear o actualizar cliente
      // (Por ahora simplificado: el backend se encarga al crear el contrato)

      // 2. Crear contrato
      const resultado = await window.api.crearContrato({
        idCliente: clienteSeleccionado?.id || 0,
        dniCliente: dni || '',
        nombreCliente: nombre || '',
        telefonoCliente: telefono || '',
        idUsuario: 1,
        fechaSalida,
        fechaDevolucionPactada: fechaDevolucion,
        depositoMonto: 0, // Sin depósito monetario por ahora
        depositoDni: depositoDni ? 1 : 0,
        items: itemsConMaximo.map(item => ({
          tipo_item: item.tipo,
          id_herramienta: item.id_herramienta || undefined,
          id_item_granel: item.id_item_granel || undefined,
          cantidad: item.cantidad || 1,
        })),
        pagos: pagos,
      });

      const idContrato = resultado.idContrato;

      // 3. Guardar firma si existe
      if (firmaBase64) {
        await window.api.guardarFirma(idContrato, firmaBase64);
      }

      // 4. Generar PDF
      try {
        const pdfPath = await window.api.generarContratoPdf(idContrato);
        toast('Contrato #' + idContrato + ' creado. PDF generado.');
      } catch {
        toast('Contrato #' + idContrato + ' creado (sin PDF).', 'warning');
      }

      markSaved(session.id);
      toast('Alquiler #' + idContrato + ' guardado correctamente');
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
          {esAlquiler ? 'Nuevo Alquiler' : 'Nueva Reserva'}
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
                          className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 hover:bg-[var(--surface)] flex justify-between items-center"
                          style={{ backgroundColor: c.en_lista_negra ? 'oklch(0.95 0.015 25)' : 'transparent' }}>
                          <span style={{ color: 'var(--ink)' }}>{c.nombre}</span>
                          <span className="font-mono" style={{ color: 'var(--muted)' }}>{c.dni}</span>
                          {c.en_lista_negra && <span className="text-[9px] font-bold ml-1" style={{ color: 'var(--danger)' }}>LISTA NEGRA</span>}
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
                      className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 hover:bg-[var(--surface)] flex justify-between">
                      <span style={{ color: 'var(--ink)' }}>{c.nombre}</span>
                      {c.dni && <span className="font-mono" style={{ color: 'var(--muted)' }}>{c.dni}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {clienteSeleccionado?.en_lista_negra && (
              <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                style={{ backgroundColor: 'oklch(0.95 0.02 25)', color: 'var(--danger)' }}>
                <AlertTriangle size={13} className="shrink-0" />
                <span>Este cliente está en lista negra. Verifique antes de continuar.</span>
              </div>
            )}

            {/* Teléfono */}
            <div>
              <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 9))}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                placeholder="9 dígitos" maxLength={9} />
            </div>

            {/* Fechas */}
            <div>
              <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>Fechas</label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Salida</span>
                  <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)}
                    className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                </div>
                <div className="flex-1">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Devolución</span>
                  <input type="date" value={fechaDevolucion} onChange={(e) => setFechaDevolucion(e.target.value)}
                    className={inputCls} style={{ backgroundColor: 'var(--surface)', color: fechaDevolucion <= fechaSalida ? 'var(--danger)' : 'var(--ink)', borderColor: fechaDevolucion <= fechaSalida ? 'var(--danger)' : 'var(--border)' }} />
                </div>
                <div className="shrink-0 pt-5">
                  <span className="inline-flex px-2.5 py-1.5 rounded-lg text-xs font-bold"
                    style={{ backgroundColor: 'var(--info)', color: '#fff' }}>
                    {dias} día{dias !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== PASO 2: EQUIPOS ===== */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col space-y-3">
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
                      ? (r.estado === 'disponible' && !enLista && !enOtraSesion)
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
                      <button key={esHerr ? r.id : ('g' + r.id)} disabled={!disponible}
                        title={tooltip}
                        onClick={() => {
                          if (!disponible) {
                            toast(tooltip, 'warning');
                            return;
                          }
                          esHerr ? agregarHerramienta(r) : agregarGranel(r);
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
                        <span className="flex-1" style={{ color: 'var(--ink)' }}>{r.nombre}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
                          style={{ backgroundColor: esHerr ? 'oklch(0.55 0.08 240 / 0.10)' : 'oklch(0.62 0.13 75 / 0.10)', color: esHerr ? 'var(--info)' : 'var(--warning)' }}>
                          {esHerr ? 'Herr.' : 'Mat.'}
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
                  {itemsConMaximo.map((item, idx) => {
                    const sub = item.precio_dia * dias * item.cantidad;
                    return (
                      <div
                        className="px-4 py-3 rounded-xl transition-colors duration-150 group"
                        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                        {/* Línea 1: Identidad + Precio unitario + Total + días */}
                        <div className="flex items-center gap-3">
                          {item.id_herramienta ? (
                            <span className="inline-flex px-2.5 py-1 rounded-lg font-mono text-xs font-bold shrink-0"
                              style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.10)', color: 'var(--primary)' }}>
                              {item.id_herramienta}
                            </span>
                          ) : (
                            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium shrink-0"
                              style={{
                                backgroundColor: item.condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                                color: item.condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)'
                              }}>{item.condicion}</span>
                          )}
                          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                            {item.nombre}
                            <span className="text-xs font-normal ml-1.5" style={{ color: 'var(--muted)' }}>
                              · S/ {item.precio_dia.toFixed(2)}/día
                            </span>
                          </span>
                          <span className="text-sm font-mono font-semibold shrink-0" style={{ color: 'var(--ink)' }}>S/ {sub.toFixed(2)}</span>
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: 'var(--info)', color: '#fff' }}>
                            {dias}d
                          </span>
                          <button onClick={() => quitarItem(idx)}
                            className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                            style={{ color: 'var(--muted)' }}><X size={14} /></button>
                        </div>

                        {/* Línea 2: Solo para granel — controles de cantidad */}
                        {item.tipo === 'granel' && (
                          <div className="flex items-center gap-2 mt-1.5 ml-12 text-xs">
                            <span className="inline-flex items-center gap-1">
                              <button onClick={() => cambiarCantidad(idx, -1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950"
                                style={{ color: 'var(--danger)' }}>−</button>
                              <input
                                value={item.cantidad}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    setItems(items.map((it, i) => i === idx ? { ...it, cantidad: '' } : it));
                                    return;
                                  }
                                  const v = parseInt(raw, 10);
                                  if (!isNaN(v) && v > 0) {
                                    setItems(items.map((it, i) => i === idx ? { ...it, cantidad: v } : it));
                                  }
                                }}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  const max = item._maxDisponible || 999;
                                  if (isNaN(v) || v < 1) {
                                    setItems(items.map((it, i) => i === idx ? { ...it, cantidad: 1 } : it));
                                  } else if (v > max) {
                                    setItems(items.map((it, i) => i === idx ? { ...it, cantidad: max } : it));
                                    toast('Ajustado al máximo disponible: ' + max, 'warning');
                                  }
                                }}
                                className="w-12 h-6 rounded text-xs text-center font-mono border outline-none"
                                style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                              />
                              <button
                                onClick={() => cambiarCantidad(idx, 1)}
                                disabled={item.cantidad >= (item._maxDisponible || 999)}
                                className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-30"
                                style={{ color: 'var(--success)' }}>+</button>
                            </span>
                            <span style={{ color: 'var(--muted)' }}>unidades</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ borderTop: '2px solid var(--border)', backgroundColor: 'transparent' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                      {itemsConMaximo.length} ítem{itemsConMaximo.length !== 1 ? 's' : ''} por {dias} día{dias !== 1 ? 's' : ''} de alquiler
                    </span>
                    <span className="text-sm font-mono font-bold" style={{ color: 'var(--ink)' }}>
                      S/ {itemsConMaximo.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0).toFixed(2)}
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
                      .replaceAll('[TOTAL]', 'S/ ' + itemsConMaximo.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0).toFixed(2))
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
                      const total = itemsConMaximo.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0);
                      const pdfPath = await window.api.generarPdfPreview({
                        arrendadora: { nombre: 'SOLEDAD SUPANTA QUISPE', dni: '72094861', ruc: '10720948619', direccion: 'Av. Los Pinos N° 348', telefono: '985618849' },
                        cliente: { nombre: nombre || '—', dni: dni || '—', telefono: telefono || '—', direccion: '' },
                        items: itemsConMaximo.map(item => ({ codigo: item.id_herramienta || (item.nombre + ' (' + item.condicion + ')'), nombre: item.nombre, cantidad: item.cantidad, precio_dia: item.precio_dia, mora_dia: 0 })),
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

              {/* COLUMNA DERECHA: Resumen + Firma */}
              <div className="flex flex-col space-y-2 overflow-y-auto">
                <div className="rounded-lg border p-3 text-xs space-y-1" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{nombre || 'Cliente'}</p>
                  {(dni || telefono) && (
                    <p style={{ color: 'var(--muted)' }}>
                      {dni && <>DNI {dni}</>}
                      {dni && telefono && ' · '}
                      {telefono && <>Tel: {telefono}</>}
                    </p>
                  )}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 14, marginBottom: 14 }} />
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--ink)' }}>
                      {(() => {
                        const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
                        const fmt = (f) => { const p = f.split('-'); return p.length === 3 ? parseInt(p[2]) + ' ' + meses[parseInt(p[1])-1] + ' ' + p[0] : f; };
                        return fmt(fechaSalida) + ' → ' + fmt(fechaDevolucion);
                      })()}
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{ backgroundColor: 'var(--info)', color: '#fff' }}>
                      {dias} día{dias !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <hr style={{ borderColor: 'var(--border)', marginTop: 14, marginBottom: 10 }} />
                  <p className="text-[10px] uppercase tracking-wider font-medium mt-1 mb-3" style={{ color: 'var(--muted)' }}>Equipos y materiales</p>
                  {itemsConMaximo.map((item, idx) => (
                    <div key={idx}>
                      {item.id_herramienta ? (
                        <div className="flex items-start gap-2">
                          <span className="w-[50px] shrink-0 flex justify-end">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
                              style={{ backgroundColor: 'oklch(0.93 0.04 240)', color: 'var(--info)' }}>{item.id_herramienta}</span>
                          </span>
                          <span className="flex-1 text-[13px]" style={{ color: 'var(--ink)' }}>{item.nombre}</span>
                          <span className="font-mono shrink-0 text-[13px]" style={{ color: 'var(--ink)' }}>S/ {(item.precio_dia * dias * item.cantidad).toFixed(2)}</span>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start gap-2">
                            <span className="w-[50px] shrink-0 flex justify-end">
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ backgroundColor: item.condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)', color: item.condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)' }}>{item.condicion}</span>
                            </span>
                            <span className="flex-1 text-[13px]" style={{ color: 'var(--ink)' }}>{item.nombre} {item.condicion}</span>
                            <span className="font-mono shrink-0 text-[13px]" style={{ color: 'var(--ink)' }}>S/ {(item.precio_dia * dias * item.cantidad).toFixed(2)}</span>
                          </div>
                          <div className="flex gap-2 mt-0.5">
                            <span className="w-[50px] shrink-0" />
                            <span className="flex-1 text-[11px]" style={{ color: 'var(--faint)' }}>×{item.cantidad} · S/ {item.precio_dia.toFixed(2)}/día</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 14, marginBottom: 10 }} />
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>Total</span>
                    <span className="font-mono font-bold text-base" style={{ color: 'var(--success)' }}>S/ {itemsConMaximo.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0).toFixed(2)}</span>
                  </div>
                </div>
                {/* Sección de pago */}
                <div className="rounded-lg border p-3 text-xs space-y-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
                  <p className="font-medium" style={{ color: 'var(--ink)' }}>Registrar pago</p>
                  <div className="flex gap-1">
                    {[
                      { id: 'efectivo', color: 'oklch(0.55 0.13 155)', label: 'Efectivo' },
                      { id: 'yape', color: 'oklch(0.48 0.14 330)', label: 'Yape' },
                      { id: 'plin', color: 'oklch(0.55 0.12 240)', label: 'Plin' },
                    ].map(m => (
                      <button key={m.id} onClick={() => setPagoMetodo(m.id)}
                        className="flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-150"
                        style={{ backgroundColor: pagoMetodo === m.id ? m.color : 'var(--surface)', color: pagoMetodo === m.id ? '#fff' : 'var(--muted)' }}>{m.label}</button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-[11px] mb-0.5 block" style={{ color: 'var(--muted)' }}>Monto S/</label>
                      <input type="number" step="0.01" min="0"                       value={pagoMonto}
                      placeholder={pendiente > 0 ? pendiente : ''}
                        onChange={e => setPagoMonto(e.target.value)}
                        className="w-full h-8 px-2 rounded text-xs border" style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                    </div>
                    <Button variant="primary" size="sm" onClick={agregarPago} className="h-8 text-xs">Agregar</Button>
                  </div>
                  {pagos.length > 0 && (
                    <div className="space-y-1">
                      {pagos.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] py-1 px-2 rounded" style={{ backgroundColor: 'var(--surface)' }}>
                          <span className="capitalize" style={{ color: 'var(--ink)' }}>{p.metodo}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {p.monto.toFixed(2)}</span>
                            <button onClick={() => quitarPago(idx)} className="text-red-500 hover:text-red-700">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-medium pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>Pagado: S/ {totalPagado.toFixed(2)}</span>
                        <span style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {pendiente > 0 ? `Pendiente: S/ ${pendiente.toFixed(2)}` : 'Completado'}
                        </span>
                      </div>
                    </div>
                  )}
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
    </div>
  );
}
