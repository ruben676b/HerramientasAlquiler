import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'alquiler_devoluciones';
const MAX_DEVOLUCIONES = 5;

const DevolucionesContext = createContext(null);

export function DevolucionesProvider({ children }) {
  const [devoluciones, setDevoluciones] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  });

  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const nextIdRef = useRef(devoluciones.length > 0 ? Math.max(...devoluciones.map(d => d.id)) + 1 : 1);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devoluciones));
  }, [devoluciones]);

  const addDevolucion = useCallback((contrato) => {
    // Evitar duplicados
    if (devoluciones.find(d => d.contrato_id === contrato.id && !d.completada)) return null;

    const id = nextIdRef.current++;
    const nueva = {
      id,
      contrato_id: contrato.id,
      cliente_nombre: contrato.cliente_nombre,
      cliente_dni: contrato.cliente_dni,
      fecha_pactada: contrato.fecha_devolucion_pactada,
      dias_atraso: contrato.dias_atraso || 0,
      estado_contrato: contrato.estado,
      items: contrato.items || [],
      completada: false,
      createdAt: Date.now(),
    };

    setDevoluciones(prev => [...prev, nueva]);
    return id;
  }, [devoluciones]);

  const removeDevolucion = useCallback((id) => {
    setDevoluciones(prev => prev.filter(d => d.id !== id));
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const markCompletada = useCallback((id) => {
    setDevoluciones(prev => prev.map(d => d.id === id ? { ...d, completada: true } : d));
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const openDialog = useCallback((contrato) => {
    if (contrato) {
      // Abrir con un contrato específico
      const id = addDevolucion(contrato);
      if (id) {
        setActiveId(id);
        setIsOpen(true);
      }
    } else {
      // Abrir con la primera devolución pendiente o vacío
      const pendientes = devoluciones.filter(d => !d.completada);
      if (pendientes.length > 0) {
        setActiveId(pendientes[0].id);
      }
      setIsOpen(true);
    }
  }, [devoluciones, addDevolucion]);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setActiveId(null);
  }, []);

  const value = {
    devoluciones,
    isOpen,
    activeId,
    addDevolucion,
    removeDevolucion,
    markCompletada,
    openDialog,
    closeDialog,
    setActiveId,
    pendientes: devoluciones.filter(d => !d.completada).length,
  };

  return (
    <DevolucionesContext.Provider value={value}>
      {children}
    </DevolucionesContext.Provider>
  );
}

export function useDevoluciones() {
  const ctx = useContext(DevolucionesContext);
  if (!ctx) throw new Error('useDevoluciones debe usarse dentro de DevolucionesProvider');
  return ctx;
}
