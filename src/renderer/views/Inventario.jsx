import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Pencil, Trash2, Wrench, Package, X,
  ChevronDown, ChevronRight, CheckCircle, AlertTriangle, MinusCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SEMANTIC, ESTADOS_HERRAMIENTA } from '../lib/constants';
import Button from '../components/ui/button';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../components/Toast';

/* ================================================================
   INVENTARIO — Vista por familias
   ================================================================ */

const ESTADO_ICON = { disponible: CheckCircle, alquilado: Package, mantenimiento: AlertTriangle, malogrado: MinusCircle };

export default function Inventario() {
  const [tab, setTab] = useState('herramientas');
  const [familias, setFamilias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [granel, setGranel] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmUnidad, setConfirmUnidad] = useState(null);
  const [historial, setHistorial] = useState({});
  const [expanded, setExpanded] = useState({});
  const searchRef = useRef(null);
  const toast = useToast();

  const cargar = async () => {
    if (!window.api) return;
    setCargando(true);
    try {
      const [f, c, g] = await Promise.all([
        window.api.getHerramientasPorCategoria(),
        window.api.getCategorias(),
        window.api.getGranelFull(),
      ]);
      setFamilias(f);
      setCategorias(c);
      setGranel(g);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Filtrado local
  const familiasFiltradas = busqueda
    ? familias.map((f) => ({
        ...f,
        herramientas: f.herramientas.filter((h) =>
          !busqueda || h.id.toLowerCase().includes(busqueda.toLowerCase()) || h.nombre.toLowerCase().includes(busqueda.toLowerCase()) || h.id.replace('-', '').toLowerCase().includes(busqueda.toLowerCase())
        ),
      })).filter((f) => {
        const q = busqueda.toLowerCase();
        const qSinGuion = q.replace('-', '');
        return f.id_categoria.toLowerCase().includes(q) ||
          f.categoria_nombre.toLowerCase().includes(q) ||
          f.nombre.toLowerCase().includes(q) ||
          f.herramientas.length > 0;
      })
    : familias;

  const granelFiltrado = busqueda
    ? granel.filter((g) => g.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : granel;

  const [granelExpandido, setGranelExpandido] = useState({});

  // Auto-expand familias cuando se busca
  useEffect(() => {
    if (!busqueda) { setExpanded({}); return; }
    const exp = {};
    familiasFiltradas.forEach((f) => { exp[f.id_categoria] = true; });
    setExpanded(exp);
  }, [busqueda]);

  // Teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setModal(null); setConfirm(null); setConfirmUnidad(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Acciones
  const toggleExpand = (id) => {
    setExpanded((e) => {
      const nuevo = !e[id];
      if (nuevo && !historial[id] && window.api?.getHistorialUnidad) {
        window.api.getHistorialUnidad(id)
          .then((h) => setHistorial((p) => ({ ...p, [id]: h })))
          .catch(() => {});
      }
      return { ...e, [id]: nuevo };
    });
  };

  const handleCrearFamilia = async (data) => {
    try {
      const prefix = await window.api.crearCategoria({ nombre: data.nombre });
      const r = await window.api.crearLote({
        id_categoria: prefix.id,
        nombre: data.nombre,
        precio_dia: data.precio_dia,
        mora_dia: data.mora_dia,
        cantidad: data.cantidad,
      });
      toast(r.cantidad + ' herramienta(s) de ' + data.nombre + ' creada(s)');
      setModal(null);
      await cargar();
    } catch (e) {
      setError('Error al crear: ' + (e.message || e));
    }
  };

  const handleAgregarUnidades = async (idCat, cantidad, nombre) => {
    try {
      const r = await window.api.agregarUnidades(idCat, cantidad);
      toast(r.cantidad + ' unidad(es) agregada(s) a ' + nombre);
      setModal(null);
      await cargar();
    } catch (e) { setError('Error al agregar: ' + (e.message || e)); }
  };

  const handleEditarFamilia = async (idCat, data, nombre) => {
    try {
      await window.api.editarFamilia(idCat, data);
      toast(nombre + ' actualizada');
      setModal(null);
      await cargar();
    } catch (e) { setError('Error al editar: ' + (e.message || e)); }
  };

  const handleEliminarFamilia = async () => {
    if (!confirm) return;
    try {
      if (confirm.tipo === 'material') {
        // Eliminar todo el material (ambas variantes)
        const g = granel.find(x => x.nombre === confirm.id);
        if (g) {
          for (const v of g.variantes) {
            try { await window.api.eliminarVariante(v.id); } catch {}
          }
        }
        toast(confirm.nombre + ' eliminado');
      } else {
        const r = await window.api.eliminarFamilia(confirm.id);
        toast(r.eliminadas > 0
          ? r.eliminadas + ' herramienta(s) de ' + confirm.nombre + ' eliminada(s)'
          : confirm.nombre + ' eliminada');
      }
      setConfirm(null);
      await cargar();
    } catch (e) { setError(e.message); setConfirm(null); }
  };

  const handleCambiarEstado = async (id, estado, nombre) => {
    try {
      await window.api.cambiarEstado(id, estado);
      toast(id + ' → ' + estado);
      await cargar();
    } catch (e) { setError(e.message); }
  };

  const handleEliminarUnidad = async (id, nombre) => {
    try {
      await window.api.eliminarHerramienta(id);
      toast('Unidad ' + id + ' de ' + nombre + ' eliminada');
      await cargar();
    } catch (e) { setError(e.message); }
  };

  // Granel CRUD
  const handleCrearGranel = async (data) => {
    try { await window.api.crearMaterial(data); toast('Material creado'); setModal(null); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleEditarGranel = async (nombreOrig, data) => {
    try { await window.api.editarGranelFull(nombreOrig, data); toast('Material actualizado'); setModal(null); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleAjustarStock = async (id, delta) => {
    try { await window.api.ajustarStock(id, delta); toast('Stock actualizado'); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleBajaVariante = async (id) => {
    try { await window.api.eliminarVariante(id); toast('Variante eliminada'); await cargar(); }
    catch (e) { setError(e.message); }
  };

  // ================================================================
  // RENDER
  // ================================================================

  const totalFamilias = familiasFiltradas.filter((f) => f.total > 0).length;
  const totalHerramientas = familiasFiltradas.reduce((a, f) => a + f.total, 0);
  const disponibles = familiasFiltradas.reduce((a, f) => a + (f.conteo.disponible || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Inventario</h1>
          {tab === 'herramientas' && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {totalFamilias} herramienta{totalFamilias !== 1 ? 's' : ''} · {totalHerramientas} unidad{totalHerramientas !== 1 ? 'es' : ''} · {disponibles} disponible{disponibles !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setModal(tab === 'herramientas' ? { tipo: 'crear-familia' } : { tipo: 'crear-granel' })}>
          <Plus size={14} /> {tab === 'herramientas' ? 'Nueva' : 'Nuevo'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: 'var(--surface)' }}>
        {[
          { id: 'herramientas', label: 'Herramientas', icon: Wrench },
          { id: 'granel', label: 'Material a granel', icon: Package },
        ].map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setBusqueda(''); }}
            className={cn('flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium transition-colors duration-150')}
            style={{ backgroundColor: tab === t.id ? 'var(--primary)' : 'transparent', color: tab === t.id ? 'var(--primary-text)' : 'var(--muted)' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative max-w-[260px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input ref={searchRef} type="text" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          className="w-full h-9 pl-8 pr-8 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5" style={{ color: 'var(--faint)' }}><X size={12} /></button>}
      </div>

      {/* Contenido */}
      {cargando ? (
        <p className="text-sm py-12 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
      ) : tab === 'herramientas' ? (
        familiasFiltradas.length === 0 ? (
          <div className="py-16 text-center">
            <Wrench size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay herramientas</p>
            <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>Use Nueva para agregar una familia</p>
          </div>
        ) : (
          <div className="space-y-2">
            {familiasFiltradas.map((f) => {
              const isOpen = expanded[f.id_categoria];
              const sem = SEMANTIC;
              return (
                <div key={f.id_categoria} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {/* Family header */}
                  <button
                    onClick={() => toggleExpand(f.id_categoria)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--surface)]"
                  >
                    <span className="shrink-0">{isOpen ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}>{f.id_categoria}</span>
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{f.nombre}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                        <span>{f.total} unidad{f.total !== 1 ? 'es' : ''}</span>
                        <span>S/ {f.precio_dia?.toFixed(2)}/día</span>
                      </div>
                    </div>
                    {/* Status bar */}
                    <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                      {ESTADOS_HERRAMIENTA.map((e) => {
                        const c = f.conteo[e] || 0;
                        const s = sem[e];
                        if (!c) return null;
                        return (
                          <span key={e} className="h-1.5 rounded-full" style={{ width: Math.max(8, c * 10), backgroundColor: s?.color || 'var(--faint)' }} title={e + ': ' + c} />
                        );
                      })}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setModal({ tipo: 'agregar-unidades', familia: f })}
                        className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
                        style={{ color: 'var(--muted)' }}
                        title="Agregar unidades"
                      ><Plus size={13} /></button>
                      <button onClick={() => setModal({ tipo: 'editar-familia', familia: f })} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Editar"><Pencil size={13} /></button>
                      <button onClick={() => setConfirm({ id: f.id_categoria, nombre: f.nombre, total: f.total })} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90" style={{ color: 'var(--muted)' }} title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </button>

                  {/* Expanded individual units */}
                  {isOpen && f.herramientas.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {f.herramientas.map((h) => {
                        const s = sem[h.estado];
                        const Icon = ESTADO_ICON[h.estado];
                        return (
                          <div key={h.id}>
                            <div className="group/row flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150 hover:bg-[var(--surface)]" style={{ borderBottom: '1px solid var(--border)' }}>
                              <span className="font-mono text-xs font-medium w-16 shrink-0" style={{ color: 'var(--primary)' }}>{h.id}</span>
                              <span className="flex-1" style={{ color: 'var(--ink)' }}>{h.nombre}</span>
                            {h.estado === 'alquilado' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                                style={{ backgroundColor: s?.soft, color: s?.variable }}>
                                <Icon size={10} /> {h.estado}
                              </span>
                            ) : (
                              <EstadoDropdown h={h} s={s} Icon={Icon} onChange={(e) => handleCambiarEstado(h.id, e)} />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmUnidad({ id: h.id, nombre: f.nombre });
                              }}
                              className="p-1.5 rounded-md transition-colors duration-150 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                              style={{ color: 'var(--muted)' }} title="Eliminar unidad"
                            ><Trash2 size={13} /></button>
                            </div>
                            {/* Mini-historial */}
                            {historial[h.id] && (historial[h.id].ultimoAlquiler || historial[h.id].mantenimientos?.length > 0) && (
                              <div className="px-4 py-1.5 text-[11px] space-y-0.5" style={{ backgroundColor: 'var(--sidebar-hover)', borderBottom: '1px solid var(--border)' }}>
                                {historial[h.id].ultimoAlquiler && (
                                  <div style={{ color: 'var(--muted)' }}>
                                    Último alquiler: {historial[h.id].ultimoAlquiler.fecha_salida}
                                    {historial[h.id].ultimoAlquiler.fecha_devolucion_real ? ' → ' + historial[h.id].ultimoAlquiler.fecha_devolucion_real : ' (activo)'}
                                    {' — ' + historial[h.id].ultimoAlquiler.cliente_nombre}
                                  </div>
                                )}
                                {historial[h.id].mantenimientos?.map((m, i) => (
                                  <div key={i} style={{ color: 'var(--muted)' }}>
                                    Mantenimiento: {m.fecha_inicio}{m.fecha_fin ? ' → ' + m.fecha_fin : ' (abierto)'} — {m.descripcion}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* GRANEL — vista agrupada */
        granelFiltrado.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay materiales</p>
          </div>
        ) : (
          <div className="space-y-2">
            {granelFiltrado.map((g) => {
              const isOpen = granelExpandido[g.nombre];
              return (
                <div key={g.nombre} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setGranelExpandido((e) => ({ ...e, [g.nombre]: !e[g.nombre] }))}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--surface)]"
                  >
                    <span className="shrink-0">{isOpen ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{g.nombre}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>
                        S/ {g.variantes.find(v=>v.condicion==='nuevo')?.precio_dia?.toFixed(2) || '—'} nuevo · S/ {g.variantes.find(v=>v.condicion==='usado')?.precio_dia?.toFixed(2) || '—'} usado
                      </span>
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>
                      {g.disponibles}/{g.total} disponibles
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ tipo: 'editar-granel', data: g })}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Editar"><Pencil size={13} /></button>
                      <button onClick={() => setConfirm({ id: g.nombre, nombre: g.nombre, total: g.total, tipo: 'material' })}
                        className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90" style={{ color: 'var(--muted)' }} title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </button>

                  {isOpen && g.variantes.map((v) => {
                    const cb = SEMANTIC[v.condicion];
                    const bajo = v.cantidad_total > 0 && v.cantidad_disponible / v.cantidad_total < 0.2;
                    return (
                      <div key={v.id} className="group flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150 hover:bg-[var(--surface)]" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="w-5" />
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                          style={{ backgroundColor: cb?.soft, color: cb?.variable }}>{v.condicion}</span>
                        <span className="flex-1 text-xs" style={{ color: 'var(--muted)' }}>S/ {v.precio_dia.toFixed(2)}/día</span>
                        <span className="text-xs font-mono w-20 text-right" style={{ color: bajo ? 'var(--danger)' : 'var(--ink)' }}>
                          {v.cantidad_disponible}/{v.cantidad_total}
                          {bajo && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ backgroundColor: 'var(--danger)' }} />}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'restar-stock', data: v }); }}
                            className="w-5 h-5 rounded flex items-center justify-center text-[13px] font-bold transition-colors duration-150 hover:bg-red-50 dark:hover:bg-red-950 active:scale-90"
                            style={{ color: 'var(--danger)' }}
                            title="Restar stock"
                          >−</button>
                          <span className="text-xs font-mono w-8 text-center" style={{ color: v.cantidad_disponible > 0 ? 'var(--ink)' : 'var(--faint)' }}>{v.cantidad_disponible}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'sumar-stock', data: v }); }}
                            className="w-5 h-5 rounded flex items-center justify-center text-[13px] font-bold transition-colors duration-150 hover:bg-green-50 dark:hover:bg-green-950 active:scale-90"
                            style={{ color: 'var(--success)' }}
                            title="Sumar stock"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modales */}
      {modal?.tipo === 'crear-familia' && <ModalCrearFamilia onSave={handleCrearFamilia} onClose={() => setModal(null)} />}
      {modal?.tipo === 'agregar-unidades' && <ModalAgregarUnidades familia={modal.familia} onSave={handleAgregarUnidades} onClose={() => setModal(null)} />}
      {modal?.tipo === 'editar-familia' && <ModalEditarFamilia familia={modal.familia} onSave={handleEditarFamilia} onClose={() => setModal(null)} />}
      {modal?.tipo === 'crear-granel' && <ModalCrearGranel onSave={handleCrearGranel} onClose={() => setModal(null)} />}
      {modal?.tipo === 'editar-granel' && <ModalEditarGranel data={modal.data} onSave={handleEditarGranel} onClose={() => setModal(null)} />}
      {modal?.tipo === 'sumar-stock' && <StockModal tipo="sumar" data={modal.data} onApply={(d) => handleAjustarStock(modal.data.id, d)} onClose={() => setModal(null)} />}
      {modal?.tipo === 'restar-stock' && <StockModal tipo="restar" data={modal.data} onApply={(d) => handleAjustarStock(modal.data.id, d)} onClose={() => setModal(null)} />}

      <ConfirmModal
        open={!!confirm}
        title="Eliminar herramienta"
        message={confirm?.tipo === 'material'
          ? `¿Eliminar "${confirm?.nombre}" y todo su stock? Esta acción no se puede deshacer.`
          : confirm?.total > 0
            ? `¿Eliminar "${confirm?.nombre}" y sus ${confirm?.total} unidad(es)? Esta acción no se puede deshacer.`
            : `¿Eliminar "${confirm?.nombre}"? Esta categoría está vacía.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={handleEliminarFamilia}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmModal
        open={!!confirmUnidad}
        title="Eliminar unidad"
        message={`¿Eliminar ${confirmUnidad?.id} de ${confirmUnidad?.nombre}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          handleEliminarUnidad(confirmUnidad.id, confirmUnidad.nombre);
          setConfirmUnidad(null);
        }}
        onCancel={() => setConfirmUnidad(null)}
      />
    </div>
  );
}

/* ================================================================
   MODALES
   ================================================================ */

const inputCls = 'w-full h-9 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';
function EstadoDropdown({ h, s, Icon, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const estados = ['disponible', 'mantenimiento', 'malogrado'];

  const abrir = (e) => {
    e.stopPropagation();
    setAbierto((prev) => {
      if (prev) return false;
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left });
      }
      return true;
    });
  };

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { setAbierto(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [abierto]);

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        onClick={abrir}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors duration-150"
        style={{ backgroundColor: s?.soft, color: s?.variable }}
      >
        <Icon size={10} /> {h.estado} ▾
      </button>
      {abierto && (
        <div className="fixed z-50 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg py-0.5 min-w-[130px]"
          style={{ top: pos.top, left: pos.left }}>
          {estados.filter(e => e !== h.estado).map((e) => {
            const sem = SEMANTIC[e];
            const EIcon = ESTADO_ICON[e];
            return (
              <button
                key={e}
                onClick={(ev) => { ev.stopPropagation(); onChange(e); setAbierto(false); }}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:bg-[var(--surface)]"
                style={{ color: sem?.variable }}
              >
                <EIcon size={10} /> {e}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockButton({ delta, onApply }) {
  const [show, setShow] = useState(false);
  const [cant, setCant] = useState(1);
  const ref = useRef(null);

  useEffect(() => {
    if (!show) return;
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [show]);

  const aplicar = (e) => {
    e.stopPropagation();
    const valor = delta > 0 ? parseInt(cant, 10) : -parseInt(cant, 10);
    if (valor !== 0) onApply(valor);
    setShow(false);
    setCant(1);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold transition-colors duration-150 hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: delta > 0 ? 'var(--success)' : 'var(--danger)' }}
      >{delta > 0 ? '+' : '−'}</button>
      {show && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg p-2 flex items-center gap-1 z-50">
          <input type="number" min="1" value={cant} onChange={(e) => setCant(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 h-7 px-1.5 rounded text-xs border text-center outline-none"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicar(e); }}
            autoFocus />
          <button onClick={aplicar}
            className="h-7 px-2 rounded text-[11px] font-medium text-white transition-colors duration-150"
            style={{ backgroundColor: delta > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {delta > 0 ? '+' : '−'}{cant}
          </button>
        </div>
      )}
    </div>
  );
}

function InlineStockInput({ value, onApply }) {
  const [edit, setEdit] = useState(false);
  const [cant, setCant] = useState(value);
  const ref = useRef(null);

  useEffect(() => {
    if (!edit) return;
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setEdit(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [edit]);

  const aplicar = (e) => {
    e.stopPropagation();
    const delta = parseInt(cant, 10) - value;
    if (delta !== 0) onApply(delta);
    setEdit(false);
  };

  if (!edit) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setCant(value); setEdit(true); }}
        className="text-xs font-mono w-12 text-center py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150"
        style={{ color: value > 0 ? 'var(--ink)' : 'var(--faint)' }}
        title="Clic para editar cantidad"
      >{value}</button>
    );
  }

  return (
    <span ref={ref} className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => { const v = Math.max(0, parseInt(cant, 10) - 10); setCant(v); }}
        className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold hover:bg-red-50"
        style={{ color: 'var(--danger)' }} title="−10"
      >−</button>
      <input
        type="number" min="0" value={cant}
        onChange={(e) => setCant(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') aplicar(e); if (e.key === 'Escape') setEdit(false); }}
        className="w-14 h-6 px-1 rounded text-xs text-center border outline-none font-mono"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
        autoFocus
      />
      <button
        onClick={() => { const v = Math.max(0, parseInt(cant, 10) + 10); setCant(v); }}
        className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold hover:bg-green-50"
        style={{ color: 'var(--success)' }} title="+10"
      >+</button>
      <button
        onClick={aplicar}
        className="h-6 px-1.5 rounded text-[10px] font-medium text-white"
        style={{ backgroundColor: 'var(--primary)' }}
      >OK</button>
    </span>
  );
}

function StockModal({ tipo, data, onApply, onClose }) {
  const [cant, setCant] = useState('');
  const sumar = tipo === 'sumar';

  const aplicar = () => {
    const c = parseInt(cant, 10);
    if (c > 0) onApply(sumar ? c : -c);
    onClose();
  };

  return (
    <ModalShell title={(sumar ? 'Sumar stock: ' : 'Restar stock: ') + data.nombre + ' (' + data.condicion + ')'} onClose={onClose} onSubmit={aplicar}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Stock actual: {data.cantidad_disponible} de {data.cantidad_total}</p>
      <Field label={sumar ? 'Cantidad a agregar' : 'Cantidad a restar'} req>
        <input type="number" min="1" max={sumar ? undefined : data.cantidad_disponible} value={cant} onChange={(e) => setCant(e.target.value)} className={inputCls}
          style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } }} />
      </Field>
    </ModalShell>
  );
}

const Field = ({ label, req, children }) => (
  <div>
    <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}{req ? ' *' : ''}</label>
    {children}
  </div>
);

function ModalShell({ title, onClose, children, onSubmit, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }}><X size={15} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-2.5">
          {children}
          {error && <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Cancelar</button>
            <Button type="submit" variant="primary" size="sm" className="flex-1">Guardar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalCrearFamilia({ onSave, onClose }) {
  const [f, setF] = useState({ nombre: '', precio_dia: '', mora_dia: '', cantidad: '1' });
  const [err, setErr] = useState('');
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(''); };

  const submit = () => {
    if (!f.nombre.trim()) return setErr('Ingrese el nombre de la herramienta.');
    if (!f.precio_dia || parseFloat(f.precio_dia) < 0) return setErr('Ingrese un precio válido.');
    onSave({
      nombre: f.nombre.trim(),
      precio_dia: parseFloat(f.precio_dia) || 0,
      mora_dia: parseFloat(f.precio_dia) || 0,
      cantidad: parseInt(f.cantidad, 10) || 1,
    });
  };

  return (
    <ModalShell title="Nueva herramienta" onClose={onClose} onSubmit={submit} error={err}>
      <Field label="Nombre" req>
        <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} placeholder="Ej: Roto Martillo" autoFocus
          style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Precio/día S/" req>
          <input type="number" step="0.01" min="0" value={f.precio_dia} onChange={(e) => set('precio_dia', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Cantidad" req>
          <input type="number" min="1" value={f.cantidad} onChange={(e) => set('cantidad', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
      </div>
    </ModalShell>
  );
}

function ModalAgregarUnidades({ familia, onSave, onClose }) {
  const [cant, setCant] = useState('1');
  const submit = () => { const c = parseInt(cant, 10); if (c > 0) onSave(familia.id_categoria, c, familia.nombre); };
  return (
    <ModalShell title={'Agregar unidades: ' + familia.nombre} onClose={onClose} onSubmit={submit}>
      {familia.total > 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Última unidad: {familia.herramientas[familia.herramientas.length - 1]?.id}. Se continuará la numeración.</p>
      ) : (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Primera unidad. La numeración comenzará desde 01.</p>
      )}
      <Field label="Cantidad a agregar" req>
        <input type="number" min="1" value={cant} onChange={(e) => setCant(e.target.value)} className={inputCls} autoFocus style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
      </Field>
    </ModalShell>
  );
}

function ModalEditarFamilia({ familia, onSave, onClose }) {
  const [f, setF] = useState({ nombre: familia.nombre || '', precio_dia: familia.precio_dia ?? '', mora_dia: familia.mora_dia ?? '' });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => onSave(familia.id_categoria, { ...f, precio_dia: parseFloat(f.precio_dia) || 0, mora_dia: parseFloat(f.precio_dia) || 0 }, familia.nombre);
  return (
    <ModalShell title={'Editar ' + familia.nombre} onClose={onClose} onSubmit={submit}>
      <Field label="Nombre">
        <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus />
      </Field>
      <div className="grid grid-cols-1 gap-2">
        <Field label="Precio/día S/">
          <input type="number" step="0.01" min="0" value={f.precio_dia} onChange={(e) => set('precio_dia', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
      </div>
      {familia.total > 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Los cambios se aplican a las {familia.total} herramienta{familia.total !== 1 ? 's' : ''} de esta familia.</p>
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Sin unidades. Los cambios se aplicarán a las nuevas unidades que agregue.</p>
      )}
    </ModalShell>
  );
}

function ModalCrearGranel({ onSave, onClose }) {
  const [f, setF] = useState({ nombre: '', precio_nuevo: '', mora_nuevo: '', precio_usado: '', mora_usado: '' });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.nombre.trim()) return;
    onSave({ nombre: f.nombre.trim(), precio_nuevo: parseFloat(f.precio_nuevo) || 0, mora_nuevo: parseFloat(f.precio_nuevo) || 0, precio_usado: parseFloat(f.precio_usado) || 0, mora_usado: parseFloat(f.precio_usado) || 0 });
  };
  return (
    <ModalShell title="Nuevo material" onClose={onClose} onSubmit={submit}>
      <Field label="Nombre" req><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} placeholder="Ej: Tabla 3m" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--success)' }}>Nuevo</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_nuevo} onChange={(e) => set('precio_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--warning)' }}>Usado</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_usado} onChange={(e) => set('precio_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalEditarGranel({ data, onSave, onClose }) {
  const nuevo = data.variantes?.find(v => v.condicion === 'nuevo') || {};
  const usado = data.variantes?.find(v => v.condicion === 'usado') || {};
  const [f, setF] = useState({
    nombre: data.nombre || '',
    precio_nuevo: nuevo.precio_dia ?? '',
    mora_nuevo: nuevo.mora_dia ?? '',
    precio_usado: usado.precio_dia ?? '',
    mora_usado: usado.mora_dia ?? '',
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => onSave(data.nombre, {
    nombre: f.nombre.trim(),
    precio_nuevo: parseFloat(f.precio_nuevo) || 0,
    mora_nuevo: parseFloat(f.precio_nuevo) || 0,
    precio_usado: parseFloat(f.precio_usado) || 0,
    mora_usado: parseFloat(f.precio_usado) || 0,
  });
  return (
    <ModalShell title="Editar material" onClose={onClose} onSubmit={submit}>
      <Field label="Nombre" req><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--success)' }}>Nuevo</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_nuevo} onChange={(e) => set('precio_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--warning)' }}>Usado</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_usado} onChange={(e) => set('precio_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
      </div>
    </ModalShell>
  );
}
