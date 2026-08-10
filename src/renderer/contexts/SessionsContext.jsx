import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'alquiler_sessions';
const DATA_PREFIX = 'alquiler_session_data_';
const MAX_SESSIONS = 5;

const SessionsContext = createContext(null);

export function SessionsProvider({ children }) {
  const [sessions, setSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  });

  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const nextIdRef = useRef(sessions.length > 0 ? Math.max(...sessions.map(s => s.id)) + 1 : 1);

  // Persist sessions to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const saveFormData = (id, data) => {
    try {
      localStorage.setItem(DATA_PREFIX + id, JSON.stringify(data));
    } catch {}
  };

  const loadFormData = (id) => {
    try {
      return JSON.parse(localStorage.getItem(DATA_PREFIX + id));
    } catch { return null; }
  };

  const clearFormData = (id) => {
    localStorage.removeItem(DATA_PREFIX + id);
  };

  const addSession = useCallback((tipo) => {
    const active = sessions.filter(s => !s.saved && s.tipo === tipo);
    if (active.length >= MAX_SESSIONS) return null;

    const id = nextIdRef.current++;
    const label = tipo === 'reserva' ? 'Nueva Reserva' : 'Nuevo Alquiler';
    const newSession = {
      id, tipo, label,
      step: 0,
      saved: false,
      clientName: '',
      createdAt: Date.now(),
    };

    setSessions(prev => [...prev, newSession]);
    return id;
  }, [sessions]);

  const removeSession = useCallback((id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    clearFormData(id);
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const markSaved = useCallback((id) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, saved: true } : s));
    clearFormData(id);
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const updateSession = useCallback((id, info) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...info } : s));
    if (info._formData) saveFormData(id, info._formData);
  }, []);

  const openDialog = useCallback((tipo) => {
    const active = sessions.filter(s => !s.saved && s.tipo === tipo);
    let targetId;

    if (active.length > 0) {
      // Pick the most recently updated active session
      targetId = active.reduce((a, b) => (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b).id;
    } else {
      targetId = addSession(tipo);
    }

    if (targetId) {
      setActiveId(targetId);
      setIsOpen(true);
    }
  }, [sessions, addSession]);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setActiveId(null);
    
    // Limpiar sesiones vacías para no acumular basura
    setSessions(prev => {
      const toKeep = [];
      let changed = false;
      for (const s of prev) {
        if (s.saved) {
          toKeep.push(s);
          continue;
        }
        
        let isModified = false;
        try {
          const data = JSON.parse(localStorage.getItem(DATA_PREFIX + s.id)) || {};
          const hasDni = data.dni && data.dni.trim() !== '';
          const hasNombre = data.nombre && data.nombre.trim() !== '';
          const hasItems = data.items && data.items.length > 0;
          const hasEdit = data.editContratoId != null;
          isModified = hasDni || hasNombre || hasItems || hasEdit;
        } catch {
          isModified = false;
        }
        
        if (!isModified) {
          localStorage.removeItem(DATA_PREFIX + s.id);
          changed = true;
        } else {
          toKeep.push(s);
        }
      }
      return changed ? toKeep : prev;
    });
  }, []);

  const openEditDialog = (contrato) => {
    window.api?.log?.('[openEditDialog] INICIO - id:' + (contrato?.id) + ' estado:' + (contrato?.estado) + ' items:' + (contrato?.items?.length || 0));
    if (!contrato || !contrato.id) {
      window.api?.log?.('[openEditDialog] ERROR: contrato invalido');
      return;
    }
    const tipo = contrato.estado === 'reservado' ? 'reserva' : 'alquiler';
    window.api?.log?.('[openEditDialog] tipo:' + tipo);

    const id = nextIdRef.current++;
    window.api?.log?.('[openEditDialog] nuevo session id:' + id);
    const newSession = {
      id, tipo,
      label: tipo === 'reserva' ? ('Editar Reserva #' + contrato.id) : ('Editar Alquiler #' + contrato.id),
      step: 0,
      saved: false,
      clientName: 'Editar #' + contrato.id + ' - ' + (contrato.cliente_nombre || ''),
      createdAt: Date.now(),
      editMode: true,
    };

    const formData = {
      editContratoId: contrato.id,
      editMode: true,
      dni: contrato.cliente_dni || '',
      nombre: contrato.cliente_nombre || '',
      telefono: contrato.cliente_telefono || '',
      clienteSeleccionado: {
        id: contrato.id_cliente,
        nombre: contrato.cliente_nombre,
        dni: contrato.cliente_dni,
        telefono: contrato.cliente_telefono,
      },
      fechaSalida: contrato.fecha_salida,
      fechaDevolucion: contrato.fecha_devolucion_pactada,
      fechaReserva: contrato.fecha_reserva || '',
      depositoMonto: contrato.deposito_monto || 0,
      depositoDni: contrato.deposito_dni === 1,
      items: (contrato.items || [])
        .filter(item => item.tipo_item === 'kit' || !item.id_kit)
        .map(item => ({
          tipo: item.tipo_item,
          id_herramienta: item.id_herramienta || undefined,
          id_item_granel: item.id_item_granel || undefined,
          id_kit: item.id_kit || undefined,
          nombre: item.item_nombre || item.kit_nombre || '',
          precio_dia: item.precio_dia_aplicado || 0,
          precio_minimo: item.precio_minimo,
          precio_mes: item.precio_mes,
          cantidad: item.cantidad || 1,
          condicion: item.item_condicion || undefined,
          tarifa: item.tarifa_aplicada || 'dia',
          fecha_devolucion_item: item.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada,
          _componentes: undefined,
        })),
      pagos: [],
      step: 0,
      firmaBase64: null,
    };

    try { localStorage.setItem(DATA_PREFIX + id, JSON.stringify(formData)); } catch(e) { window.api?.log?.('[openEditDialog] localStorage error: ' + e); }
    window.api?.log?.('[openEditDialog] formData guardado, items count:' + formData.items.length);

    setSessions(prev => {
      window.api?.log?.('[openEditDialog] setSessions - prev length:' + prev.length + ' new session id:' + id);
      return [...prev, newSession];
    });
    setActiveId(id);
    setIsOpen(true);
    window.api?.log?.('[openEditDialog] FIN - isOpen:true activeId:' + id);
  };

  const value = {
    sessions,
    isOpen,
    activeId,
    addSession,
    removeSession,
    markSaved,
    updateSession,
    openDialog,
    closeDialog,
    openEditDialog,
    setActiveId,
    loadFormData,
    saveFormData,
    clearFormData,
    setIsOpen,
    activeAlquileres: sessions.filter(s => !s.saved && s.tipo === 'alquiler').length,
    activeReservas: sessions.filter(s => !s.saved && s.tipo === 'reserva').length,
  };

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions debe usarse dentro de SessionsProvider');
  return ctx;
}
