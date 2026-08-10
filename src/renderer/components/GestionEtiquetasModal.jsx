import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';
import { ETIQUETA_COLORS, tagStyle } from './TagChip';

/**
 * GestionEtiquetasModal — catálogo de etiquetas de cliente.
 * Permite agregar, editar y eliminar etiquetas (tablita sencilla).
 * onChanged se invoca tras cualquier cambio para refrescar vistas padre.
 */
export default function GestionEtiquetasModal({ open, onClose, onChanged }) {
  const toast = useToast();
  const [etiquetas, setEtiquetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(ETIQUETA_COLORS[0]);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editColor, setEditColor] = useState(ETIQUETA_COLORS[0]);
  const [aEliminar, setAEliminar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cargar = async () => {
    setCargando(true);
    try {
      setEtiquetas(await window.api.getEtiquetas());
    } catch (e) {
      toast(e.message || 'Error al cargar etiquetas', 'error');
    } finally {
      setCargando(false);
    }
  };

  const agregar = async () => {
    const nom = nombre.trim();
    if (!nom) {
      toast('Escriba un nombre para la etiqueta', 'warning');
      return;
    }
    setGuardando(true);
    try {
      await window.api.crearEtiqueta(nom, color);
      setNombre('');
      toast('Etiqueta creada');
      await cargar();
      onChanged?.();
    } catch (e) {
      toast(e.message || 'No se pudo crear la etiqueta', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (e) => {
    setEditId(e.id);
    setEditNombre(e.nombre);
    setEditColor(e.color);
  };

  const guardarEdicion = async () => {
    const nom = editNombre.trim();
    if (!nom) {
      toast('El nombre no puede estar vacío', 'warning');
      return;
    }
    setGuardando(true);
    try {
      await window.api.editarEtiqueta(editId, nom, editColor);
      setEditId(null);
      toast('Etiqueta actualizada');
      await cargar();
      onChanged?.();
    } catch (e) {
      toast(e.message || 'No se pudo actualizar la etiqueta', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    try {
      await window.api.eliminarEtiqueta(aEliminar.id);
      setAEliminar(null);
      toast('Etiqueta eliminada');
      await cargar();
      onChanged?.();
    } catch (e) {
      toast(e.message || 'No se pudo eliminar la etiqueta', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.12)' }}>
              <Tag size={14} style={{ color: 'oklch(0.55 0.08 240)' }} />
            </div>
            <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Gestionar etiquetas</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }}><X size={15} /></button>
        </div>

        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
          Etiquetas visibles solo para usted: casero, confiable, moroso, etc.
        </p>

        {/* Agregar */}
        <div className="space-y-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Nueva etiqueta</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
              placeholder="Nombre (ej: Casero)"
              className="w-full h-9 px-3 mt-1 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {ETIQUETA_COLORS.map((h) => {
                const s = tagStyle(h);
                return (
                  <button
                    key={h}
                    onClick={() => setColor(h)}
                    className="w-6 h-6 rounded-full transition-transform duration-150"
                    style={{
                      backgroundColor: s.bg,
                      border: color === h ? `2px solid ${s.dot}` : '2px solid transparent',
                      boxShadow: color === h ? `0 0 0 2px ${s.dot}33` : 'none',
                    }}
                    title={`Color ${h}`}
                  />
                );
              })}
            </div>
            <button
              onClick={agregar}
              disabled={guardando}
              className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              <Plus size={13} /> Agregar
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-1.5">
          {cargando ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
          ) : etiquetas.length === 0 ? (
            <div className="py-8 text-center">
              <Tag size={24} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Aún no hay etiquetas. Cree la primera.</p>
            </div>
          ) : (
            etiquetas.map((e) => {
              const s = tagStyle(e.color);
              const editando = editId === e.id;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  {editando ? (
                    <>
                      <input
                        value={editNombre}
                        onChange={(ev) => setEditNombre(ev.target.value)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') guardarEdicion(); if (ev.key === 'Escape') setEditId(null); }}
                        autoFocus
                        className="flex-1 h-8 px-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                      />
                      <div className="flex gap-1">
                        {ETIQUETA_COLORS.map((h) => {
                          const cs = tagStyle(h);
                          return (
                            <button
                              key={h}
                              onClick={() => setEditColor(h)}
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: cs.bg, border: editColor === h ? `1.5px solid ${cs.dot}` : '1.5px solid transparent' }}
                            />
                          );
                        })}
                      </div>
                      <button onClick={guardarEdicion} disabled={guardando} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--success)' }} title="Guardar">
                        <Pencil size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{e.nombre}</span>
                      <button onClick={() => iniciarEdicion(e)} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }} title="Editar">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setAEliminar(e)} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!aEliminar}
        title="Eliminar etiqueta"
        message={`¿Eliminar la etiqueta "${aEliminar?.nombre || ''}"? Se quitará de todos los clientes que la tengan asignada.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </div>
  );
}
