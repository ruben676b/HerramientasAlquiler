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
  }, []);

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
    setActiveId,
    loadFormData,
    saveFormData,
    clearFormData,
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
