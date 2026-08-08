import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Pencil, Trash2, Wrench, Package, X, History,
  ChevronDown, ChevronRight, CheckCircle, AlertTriangle, MinusCircle, Layers,
  ImagePlus,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SEMANTIC, ESTADOS_HERRAMIENTA } from '../lib/constants';
import Button from '../components/ui/button';
import ConfirmModal from '../components/ConfirmModal';
import KitEditorModal from '../components/KitEditorModal';
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
  const [kits, setKits] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmUnidad, setConfirmUnidad] = useState(null);
  const [confirmKit, setConfirmKit] = useState(null);
  const [historial, setHistorial] = useState({});
  const [expanded, setExpanded] = useState({});
  const searchRef = useRef(null);
  const toast = useToast();

  const cargar = async () => {
    if (!window.api) return;
    setCargando(true);
    try {
      const [f, c, g, k] = await Promise.all([
        window.api.getHerramientasPorCategoria(),
        window.api.getCategorias(),
        window.api.getGranelFull(),
        window.api.getKits ? window.api.getKits() : Promise.resolve([]),
      ]);
      setFamilias(f);
      setCategorias(c);
      setGranel(g);
      setKits(k);
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

  const kitsFiltrado = busqueda
    ? kits.filter((k) => k.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : kits;

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
    if (String(id).startsWith('kit-')) {
      setExpanded((e) => ({ ...e, [id]: !e[id] }));
      return;
    }
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
        cantidad: data.cantidad,
      });
      if (data.imagenBase64) {
        await window.api.guardarImagenHerramienta(prefix.id, data.imagenBase64);
      }
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

  const handleEditarFamilia = async (idCat, data, nombre, img) => {
    try {
      await window.api.editarFamilia(idCat, data);
      if (img?.imagen === null) {
        await window.api.eliminarImagenHerramienta(idCat);
      } else if (typeof img?.imagen === 'string') {
        await window.api.guardarImagenHerramienta(idCat, img.imagen);
      }
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
    try {
      await window.api.crearMaterial(data);
      if (data.imagenBase64) {
        await window.api.guardarImagenGranel(data.nombre, data.imagenBase64);
      }
      toast('Material creado'); setModal(null); await cargar();
    }
    catch (e) { setError(e.message); }
  };
  const handleEditarGranel = async (nombreOrig, data, img) => {
    try {
      await window.api.editarGranelFull(nombreOrig, data);
      if (img?.imagen === null) {
        await window.api.eliminarImagenGranel(nombreOrig);
      } else if (typeof img?.imagen === 'string') {
        await window.api.guardarImagenGranel(data.nombre, img.imagen);
      }
      toast('Material actualizado'); setModal(null); await cargar();
    }
    catch (e) { setError(e.message); }
  };
  const handleAjustarStock = async (id, delta) => {
    try { await window.api.ajustarStock(id, delta); toast('Stock actualizado'); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleDarBaja = async (id, cantidad, motivo) => {
    try { await window.api.darBajaGranel(id, cantidad, motivo); toast(cantidad + ' unidad(es) marcada(s) como ' + motivo); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleRevertirAudit = async (auditId) => {
    try { await window.api.revertirAuditGranel(auditId); toast('Modificación revertida'); await cargar(); }
    catch (e) { setError(e.message); }
  };
  const handleBajaVariante = async (id) => {
    try { await window.api.eliminarVariante(id); toast('Variante eliminada'); await cargar(); }
    catch (e) { setError(e.message); }
  };

  // Kits CRUD
  const handleGuardarKit = async (data) => {
    try {
      if (modal?.kit) {
        await window.api.editarKit(modal.kit.id, data);
        toast('Kit actualizado');
      } else {
        await window.api.crearKit(data);
        toast('Kit creado');
      }
      setModal(null);
      await cargar();
    } catch (e) { setError(e.message); }
  };

  const handleDesactivarKit = async () => {
    if (!confirmKit) return;
    try {
      await window.api.desactivarKit(confirmKit.id);
      toast(confirmKit.nombre + ' desactivado');
      setConfirmKit(null);
      await cargar();
    } catch (e) { setError(e.message); setConfirmKit(null); }
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
        <Button variant="primary" size="sm" onClick={() => setModal(tab === 'herramientas' ? { tipo: 'crear-familia' } : tab === 'granel' ? { tipo: 'crear-granel' } : { tipo: 'crear-kit' })}>
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
          { id: 'kits', label: 'Kits', icon: Layers },
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
                      <button onClick={() => setModal({ tipo: 'danos-familia', familia: f })} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Daños predefinidos"><AlertTriangle size={13} /></button>
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
                            {historial[h.id]?.mantenimientos?.length > 0 && (
                              <div className="px-4 py-1.5 text-[11px] space-y-0.5" style={{ backgroundColor: 'var(--sidebar-hover)', borderBottom: '1px solid var(--border)' }}>
                                {historial[h.id].mantenimientos.map((m, i) => {
                                  const esDanioDevolucion = m.id_contrato && m.cliente_nombre;
                                  const danios = m.id_contrato ? (historial[h.id].danosPorContrato?.[m.id_contrato] || []) : [];
                                  const esActual = i === 0 && h.estado === 'mantenimiento';
                                  return (
                                    <div key={m.id || i} className={esActual ? 'rounded px-2 py-1 -mx-1' : ''}
                                         style={esActual ? { backgroundColor: 'oklch(0.55 0.13 70 / 0.1)', borderLeft: '2px solid oklch(0.55 0.13 70)' } : {}}>
                                      {esDanioDevolucion ? (
                                        <>
                                          <div className="flex items-center gap-1.5" style={{ color: esActual ? 'var(--warning)' : 'var(--muted)' }}>
                                            <span className="font-semibold">Dañado</span>
                                            <span style={{ color: 'var(--ink)' }}>por {m.cliente_nombre}</span>
                                            <span style={{ color: 'var(--faint)' }}>— {m.fecha_inicio}</span>
                                          </div>
                                          {m.descripcion && !m.descripcion.startsWith('Devolucion:') && (
                                            <div className="text-[10px] ml-3" style={{ color: 'var(--faint)' }}>{m.descripcion}</div>
                                          )}
                                          {danios.length > 0 && (
                                            <div className="flex flex-col gap-0.5 ml-3 mt-0.5">
                                              {danios.map((d, j) => (
                                                <div key={j} className="text-[10px] flex items-center gap-1"
                                                     style={{ color: esActual ? 'var(--warning)' : 'var(--faint)' }}>
                                                  {'↳ ' + d.nombre + ' — S/ ' + d.costo.toFixed(2)}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div style={{ color: 'var(--muted)' }}>
                                          Marcado manualmente — {m.fecha_inicio}
                                          {m.fecha_fin ? ' → ' + m.fecha_fin : ' (abierto)'}
                                          {m.descripcion !== 'Cambio manual de estado a mantenimiento' && (
                                            <span className="ml-1 text-[10px]" style={{ color: 'var(--faint)' }}>— {m.descripcion}</span>
                                          )}
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
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'granel' ? (
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
                    <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--muted)' }}>
                      Disp {g.disponibles} / Total {g.total}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ tipo: 'editar-granel', data: g })}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Editar"><Pencil size={13} /></button>
                      <button onClick={() => setModal({ tipo: 'danos-granel', data: g })}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Daños predefinidos"><AlertTriangle size={13} /></button>
                      <button onClick={() => setConfirm({ id: g.nombre, nombre: g.nombre, total: g.total, tipo: 'material' })}
                        className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90" style={{ color: 'var(--muted)' }} title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </button>

                  {isOpen && (
                    <>
                      {/* Column headers */}
                      <div className="flex items-center px-4 py-1 text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--faint)', borderTop: '1px solid var(--border)' }}>
                        <span className="w-5 shrink-0" />
                        <span className="w-14 shrink-0" />
                        <span className="text-right w-10 shrink-0">Disp</span>
                        <span className="text-right w-9 shrink-0">Alq</span>
                        <span className="text-right w-9 shrink-0">Dañ</span>
                        <span className="text-right w-9 shrink-0">Perd</span>
                        <span className="text-right w-9 shrink-0">Vend</span>
                        <span className="text-right w-9 shrink-0">Baja</span>
                        <span className="text-right w-10 shrink-0">Total</span>
                        <span className="flex-1" />
                        <span className="w-[68px] shrink-0" />
                      </div>
                      {g.variantes.map((v) => {
                        const cb = SEMANTIC[v.condicion];
                        return (
                          <div key={v.id} className="group flex items-center px-4 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--surface)]" style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="w-5 shrink-0" />
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 w-14 justify-center"
                              style={{ backgroundColor: cb?.soft, color: cb?.variable }}>{v.condicion}</span>
                            <span className="w-10 text-right font-mono" style={{ color: v.cantidad_disponible > 0 ? 'var(--ink)' : 'var(--faint)' }}>{v.cantidad_disponible}</span>
                            <span className="w-9 text-right font-mono" style={{ color: (v.cantidad_alquilada || 0) > 0 ? 'oklch(0.45 0.12 240)' : 'var(--faint)' }}>{v.cantidad_alquilada || 0}</span>
                            <span className="w-9 text-right font-mono" style={{ color: (v.cantidad_danada || 0) > 0 ? 'oklch(0.55 0.13 70)' : 'var(--faint)' }}>{v.cantidad_danada || 0}</span>
                            <span className="w-9 text-right font-mono" style={{ color: (v.cantidad_perdida || 0) > 0 ? 'var(--danger)' : 'var(--faint)' }}>{v.cantidad_perdida || 0}</span>
                            <span className="w-9 text-right font-mono" style={{ color: (v.cantidad_vendida || 0) > 0 ? 'var(--info)' : 'var(--faint)' }}>{v.cantidad_vendida || 0}</span>
                            <span className="w-9 text-right font-mono" style={{ color: (v.cantidad_baja || 0) > 0 ? 'var(--muted)' : 'var(--faint)' }}>{v.cantidad_baja || 0}</span>
                            <span className="w-10 text-right font-mono font-semibold" style={{ color: 'var(--ink)' }}>{v.cantidad_total}</span>
                            <span className="flex-1 text-[10px] text-right" style={{ color: 'var(--muted)' }}>S/ {v.precio_dia.toFixed(2)}/día</span>
                            <div className="flex items-center gap-0.5 shrink-0 w-[68px] justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'historial-granel', data: v }); }}
                                className="w-5 h-5 rounded flex items-center justify-center transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
                                style={{ color: 'var(--muted)' }}
                                title="Historial de modificaciones"
                              ><History size={12} /></button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'baja-granel', data: v }); }}
                                className="w-5 h-5 rounded flex items-center justify-center text-[13px] font-bold transition-colors duration-150 hover:bg-red-50 dark:hover:bg-red-950 active:scale-90"
                                style={{ color: 'var(--danger)' }}
                                title="Dar de baja / Perder / Dañar / Vender"
                              >−</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'sumar-stock', data: v }); }}
                                className="w-5 h-5 rounded flex items-center justify-center text-[13px] font-bold transition-colors duration-150 hover:bg-green-50 dark:hover:bg-green-950 active:scale-90"
                                style={{ color: 'var(--success)' }}
                                title="Comprar stock"
                              >+</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* KITS */
        kitsFiltrado.length === 0 ? (
          <div className="py-16 text-center">
            <Layers size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay kits</p>
            <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>Use Nuevo para crear un kit con herramientas y materiales</p>
          </div>
        ) : (
          <div className="space-y-2">
            {kitsFiltrado.map((k) => {
              const isOpen = expanded['kit-' + k.id];
              const disp = k.disponibilidad || 0;
              return (
                <div key={k.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => toggleExpand('kit-' + k.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--surface)]"
                  >
                    <span className="shrink-0">{isOpen ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{k.nombre}</span>
                        {k.descripcion && <span className="text-xs truncate" style={{ color: 'var(--faint)' }}>{k.descripcion}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                        <span>{k.componentes?.length || 0} componente{(k.componentes?.length || 0) !== 1 ? 's' : ''}</span>
                        <span>S/ {k.precio_dia?.toFixed(2)}/día</span>
                        {k.precio_venta ? <span className="text-[10px]">venta S/ {k.precio_venta.toFixed(2)}</span> : null}
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                      style={{
                        backgroundColor: disp > 0 ? SEMANTIC.disponible.soft : SEMANTIC.pendiente.soft,
                        color: disp > 0 ? SEMANTIC.disponible.variable : SEMANTIC.pendiente.variable,
                      }}
                      title={disp > 0 ? 'Kits armables con el stock actual' : 'Sin stock completo para armar'}
                    >
                      {disp > 0 ? disp + ' disponible' + (disp !== 1 ? 's' : '') : 'sin stock'}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ tipo: 'editar-kit', kit: k })}
                        className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }} title="Editar kit"><Pencil size={13} /></button>
                      <button onClick={() => setConfirmKit({ id: k.id, nombre: k.nombre })}
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90" style={{ color: 'var(--muted)' }} title="Desactivar kit"><Trash2 size={13} /></button>
                    </div>
                  </button>

                  {/* Componentes expandidos */}
                  {isOpen && k.componentes?.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="flex items-center px-4 py-1 text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--faint)' }}>
                        <span className="flex-1">Componente</span>
                        <span className="w-16 text-right shrink-0">Tipo</span>
                        <span className="w-16 text-right shrink-0">Cant.</span>
                        <span className="w-20 text-right shrink-0">Stock actual</span>
                      </div>
                      {k.componentes.map((c, i) => {
                        const esGranel = c.tipo_item === 'granel';
                        const stock = esGranel ? (c.cantidad_disponible ?? 0) : (c.estado_herramienta === 'disponible' ? 1 : 0);
                        const ok = esGranel ? stock >= c.cantidad : stock >= 1;
                        const cb = esGranel ? SEMANTIC[c.condicion] : null;
                        return (
                          <div key={i} className="flex items-center px-4 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--surface)]" style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="flex-1 flex items-center gap-2 min-w-0" style={{ color: 'var(--ink)' }}>
                              {esGranel ? <Package size={11} style={{ color: 'var(--muted)' }} /> : <Wrench size={11} style={{ color: 'var(--muted)' }} />}
                              <span className="truncate">{c.nombre}</span>
                              {cb && <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0" style={{ backgroundColor: cb.soft, color: cb.variable }}>{c.condicion}</span>}
                            </span>
                            <span className="w-16 text-right shrink-0 font-mono" style={{ color: 'var(--muted)' }}>{esGranel ? 'material' : 'herramienta'}</span>
                            <span className="w-16 text-right shrink-0 font-mono" style={{ color: 'var(--ink)' }}>{esGranel ? c.cantidad : 1}</span>
                            <span className="w-20 text-right shrink-0 font-mono" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>
                              {esGranel ? (stock >= c.cantidad ? stock + ' (ok)' : stock + ' / req ' + c.cantidad) : (stock ? 'disponible' : 'no disp.')}
                            </span>
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
      )}

      {/* Modales */}
      {modal?.tipo === 'crear-familia' && <ModalCrearFamilia onSave={handleCrearFamilia} onClose={() => setModal(null)} />}
      {modal?.tipo === 'agregar-unidades' && <ModalAgregarUnidades familia={modal.familia} onSave={handleAgregarUnidades} onClose={() => setModal(null)} />}
      {modal?.tipo === 'editar-familia' && <ModalEditarFamilia familia={modal.familia} onSave={handleEditarFamilia} onClose={() => setModal(null)} />}
      {modal?.tipo === 'danos-familia' && <ModalDañosFamilia familia={modal.familia} onClose={() => setModal(null)} />}
      {modal?.tipo === 'crear-granel' && <ModalCrearGranel onSave={handleCrearGranel} onClose={() => setModal(null)} />}
      {modal?.tipo === 'editar-granel' && <ModalEditarGranel data={modal.data} onSave={handleEditarGranel} onClose={() => setModal(null)} />}
      {modal?.tipo === 'danos-granel' && <ModalDañosGranel data={modal.data} onClose={() => setModal(null)} />}
      {modal?.tipo === 'sumar-stock' && <StockModal data={modal.data} onApply={(d) => handleAjustarStock(modal.data.id, d)} onClose={() => setModal(null)} />}
      {modal?.tipo === 'baja-granel' && <BajaGranelModal data={modal.data} onSave={handleDarBaja} onClose={() => setModal(null)} />}
      {modal?.tipo === 'historial-granel' && <HistorialGranelModal data={modal.data} onUndo={handleRevertirAudit} onClose={() => setModal(null)} />}
      {modal?.tipo === 'crear-kit' && <KitEditorModal onSave={handleGuardarKit} onClose={() => setModal(null)} />}
      {modal?.tipo === 'editar-kit' && <KitEditorModal kitId={modal.kit.id} onSave={handleGuardarKit} onClose={() => setModal(null)} />}

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

      <ConfirmModal
        open={!!confirmKit}
        title="Desactivar kit"
        message={`¿Desactivar el kit "${confirmKit?.nombre}"? Los contratos existentes no se ven afectados.`}
        confirmLabel="Desactivar"
        danger
        onConfirm={handleDesactivarKit}
        onCancel={() => setConfirmKit(null)}
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

function StockModal({ data, onApply, onClose }) {
  const [cant, setCant] = useState('');

  const aplicar = () => {
    const c = parseInt(cant, 10);
    if (c > 0) onApply(c);
    onClose();
  };

  return (
    <ModalShell title={'Comprar stock: ' + data.nombre + ' (' + data.condicion + ')'} onClose={onClose} onSubmit={aplicar}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Stock actual: {data.cantidad_disponible} de {data.cantidad_total}</p>
      <Field label="Cantidad a agregar" req>
        <input type="number" min="1" value={cant} onChange={(e) => setCant(e.target.value)} className={inputCls}
          style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } }} />
      </Field>
    </ModalShell>
  );
}

function BajaGranelModal({ data, onSave, onClose }) {
  const [cant, setCant] = useState('');
  const [motivo, setMotivo] = useState('baja');

  const aplicar = () => {
    const c = parseInt(cant, 10);
    if (c > 0) onSave(data.id, c, motivo);
    onClose();
  };

  const MOTIVOS = [
    { id: 'baja', label: 'Dar de baja (sin motivo específico)', color: 'var(--muted)' },
    { id: 'perdido', label: 'Perdido', color: 'var(--danger)' },
    { id: 'dañado', label: 'Dañado', color: 'oklch(0.55 0.13 70)' },
    { id: 'vendido', label: 'Vendido', color: 'var(--info)' },
  ];

  return (
    <ModalShell title={'Dar de baja: ' + data.nombre + ' (' + data.condicion + ')'} onClose={onClose} onSubmit={aplicar}>
      <p className="text-sm font-semibold text-center py-2 px-3 rounded-lg" style={{ color: 'var(--ink)', backgroundColor: 'var(--surface)' }}>
        Total: {data.cantidad_disponible} de {data.cantidad_total}
      </p>
      <Field label="Motivo" req>
        <div className="space-y-1">
          {MOTIVOS.map(m => (
            <label key={m.id} className="flex items-center gap-2 py-1 px-2 rounded-lg text-xs cursor-pointer transition-colors duration-150 hover:bg-black/5"
              style={{ backgroundColor: motivo === m.id ? m.color + '15' : 'transparent', color: motivo === m.id ? m.color : 'var(--ink)' }}>
              <input type="radio" name="motivo" value={m.id} checked={motivo === m.id}
                onChange={() => setMotivo(m.id)} className="accent-current" />
              {m.label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Cantidad" req>
        <input type="number" min="1" max={data.cantidad_disponible} value={cant} onChange={(e) => setCant(e.target.value)} className={inputCls}
          style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } }} />
      </Field>
    </ModalShell>
  );
}

function HistorialGranelModal({ data, onUndo, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.getAuditGranel(data.id).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [data.id]);

  const filtradas = entries.filter(e => e.accion !== 'undo');

  const ACCIONES = {
    compra:     { label: 'Compra',     color: 'var(--success)' },
    baja:       { label: 'Baja',       color: 'var(--muted)' },
    perdido:    { label: 'Perdido',    color: 'var(--danger)' },
    dañado:     { label: 'Dañado',     color: 'oklch(0.55 0.13 70)' },
    vendido:    { label: 'Vendido',    color: 'var(--info)' },
    reparacion: { label: 'Reparación', color: 'oklch(0.45 0.08 140)' },
    ajuste:     { label: 'Ajuste',     color: 'var(--muted)' },
  };

  const masReciente = filtradas.length > 0 && !filtradas[0].revertido ? filtradas[0] : null;

  const handleUndo = () => {
    if (!masReciente) return;
    onUndo(masReciente.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="flex flex-col w-full max-w-sm max-h-[80vh] rounded-xl p-5" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header fijo */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Historial: {data.nombre} ({data.condicion})</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }}><X size={15} /></button>
        </div>

        {/* Lista scrolleable */}
        <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Cargando...</p>
          ) : filtradas.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Sin modificaciones registradas.</p>
          ) : filtradas.map((e) => {
            const acc = ACCIONES[e.accion] || { label: e.accion, color: 'var(--muted)' };
            const diff = e.accion === 'compra' || e.accion === 'ajuste'
              ? '+' + e.cantidad
              : '-' + e.cantidad;
            return (
              <div key={e.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs"
                style={{ backgroundColor: e.revertido ? 'oklch(0.85 0 0 / 0.3)' : 'transparent', color: e.revertido ? 'var(--faint)' : 'var(--ink)' }}>
                <span className="w-14 shrink-0 text-[10px] font-mono" style={{ color: 'var(--faint)' }}>
                  {e.timestamp?.slice(11, 16) || '--:--'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                  style={{ backgroundColor: acc.color + '20', color: acc.color }}>{acc.label}</span>
                <span className="font-mono font-medium w-10 text-right shrink-0" style={{ color: acc.color }}>{diff}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--faint)' }}>
                  Disp {e.prev_total - e.prev_alquilada - e.prev_danada - e.prev_perdida - e.prev_vendida - e.prev_baja}
                  {'→'}
                  {e.new_total - e.new_alquilada - e.new_danada - e.new_perdida - e.new_vendida - e.new_baja}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer fijo con deshacer */}
        {masReciente && (
          <div className="shrink-0 pt-3">
            <Button variant="danger" size="sm" className="w-full" onClick={handleUndo}>
              Deshacer última modificación
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, req, children }) => (
  <div>
    <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}{req ? ' *' : ''}</label>
    {children}
  </div>
);

/* Campo de imagen de referencia:
   - rutaInicial: ruta de una imagen ya guardada (se carga y muestra)
   - onCambio: (dataUrl | null) — null indica que el usuario quitó la imagen */
function ImagenField({ rutaInicial, onCambio }) {
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!rutaInicial) { setPreview(null); return undefined; }
    let vivo = true;
    setCargando(true);
    window.api.leerImagen(rutaInicial)
      .then((d) => { if (vivo) setPreview(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [rutaInicial]);

  const seleccionar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPreview(dataUrl);
      onCambio(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const quitar = () => { setPreview(null); onCambio(null); };

  return (
    <div>
      <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--muted)' }}>
        Imagen de referencia
      </label>
      {preview ? (
        <div className="flex items-center gap-2">
          <img src={preview} alt="Vista previa" className="w-14 h-14 object-cover rounded-lg border shrink-0"
            style={{ borderColor: 'var(--border)' }} />
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="h-6 px-2 rounded text-[10px] font-medium text-white transition-colors duration-150"
              style={{ backgroundColor: 'var(--primary)' }}>Cambiar</button>
            <button type="button" onClick={quitar}
              className="h-6 px-2 rounded text-[10px] font-medium transition-colors duration-150"
              style={{ color: 'var(--danger)', backgroundColor: 'oklch(0.94 0.02 25)' }}>Quitar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full h-9 rounded-lg border border-dashed text-xs font-medium transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5"
          style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>
          <ImagePlus size={13} /> {cargando ? 'Cargando...' : 'Subir imagen'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={seleccionar} />
    </div>
  );
}

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
  const [f, setF] = useState({ nombre: '', precio_dia: '', precio_minimo: '', precio_mes: '', precio_venta: '', cantidad: '1' });
  const [err, setErr] = useState('');
  const [imagenEstado, setImagenEstado] = useState(null);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(''); };

  const submit = () => {
    if (!f.nombre.trim()) return setErr('Ingrese el nombre de la herramienta.');
    if (!f.precio_dia || parseFloat(f.precio_dia) < 0) return setErr('Ingrese un precio válido.');
    onSave({
      nombre: f.nombre.trim(),
      precio_dia: parseFloat(f.precio_dia) || 0,
      precio_minimo: f.precio_minimo !== '' ? parseFloat(f.precio_minimo) : undefined,
      precio_mes: f.precio_mes !== '' ? parseFloat(f.precio_mes) : undefined,
      precio_venta: f.precio_venta !== '' ? parseFloat(f.precio_venta) : undefined,
      cantidad: parseInt(f.cantidad, 10) || 1,
      imagenBase64: imagenEstado || undefined,
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
      <div className="text-[10px] uppercase tracking-wider font-semibold mt-3 mb-2" style={{ color: 'var(--muted)' }}>Precios adicionales (opcional)</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Mínimo S/">
          <input type="number" step="0.01" min="0" value={f.precio_minimo} onChange={(e) => set('precio_minimo', e.target.value)} className={inputCls} placeholder="Casero" style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Mensual S/">
          <input type="number" step="0.01" min="0" value={f.precio_mes} onChange={(e) => set('precio_mes', e.target.value)} className={inputCls} placeholder="30 días" style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Venta S/">
          <input type="number" step="0.01" min="0" value={f.precio_venta} onChange={(e) => set('precio_venta', e.target.value)} className={inputCls} placeholder="Vender" style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
      </div>
      <ImagenField onCambio={setImagenEstado} />
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
  const [f, setF] = useState({
    nombre: familia.nombre || '',
    precio_dia: familia.precio_dia ?? '',
    precio_minimo: familia.precio_minimo ?? '',
    precio_mes: familia.precio_mes ?? '',
    precio_venta: familia.precio_venta ?? '',
  });
  const [imagenEstado, setImagenEstado] = useState(undefined);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => onSave(familia.id_categoria, {
    ...f,
    precio_dia: parseFloat(f.precio_dia) || 0,
    precio_minimo: f.precio_minimo !== '' ? parseFloat(f.precio_minimo) : undefined,
    precio_mes: f.precio_mes !== '' ? parseFloat(f.precio_mes) : undefined,
    precio_venta: f.precio_venta !== '' ? parseFloat(f.precio_venta) : undefined,
  }, familia.nombre, { imagen: imagenEstado });
  return (
    <ModalShell title={'Editar ' + familia.nombre} onClose={onClose} onSubmit={submit}>
      <Field label="Nombre">
        <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Precio/día S/">
          <input type="number" step="0.01" min="0" value={f.precio_dia} onChange={(e) => set('precio_dia', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Mínimo S/">
          <input type="number" step="0.01" min="0" value={f.precio_minimo} onChange={(e) => set('precio_minimo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Mensual S/">
          <input type="number" step="0.01" min="0" value={f.precio_mes} onChange={(e) => set('precio_mes', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Venta S/">
          <input type="number" step="0.01" min="0" value={f.precio_venta} onChange={(e) => set('precio_venta', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        </Field>
      </div>
      {familia.total > 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Los cambios se aplican a las {familia.total} herramienta{familia.total !== 1 ? 's' : ''} de esta familia.</p>
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Sin unidades. Los cambios se aplicarán a las nuevas unidades que agregue.</p>
      )}
      <ImagenField rutaInicial={familia.imagen_path} onCambio={setImagenEstado} />
    </ModalShell>
  );
}

function ModalCrearGranel({ onSave, onClose }) {
  const [f, setF] = useState({ nombre: '', precio_nuevo: '', precio_minimo_nuevo: '', precio_mes_nuevo: '', precio_venta_nuevo: '', precio_usado: '', precio_minimo_usado: '', precio_mes_usado: '', precio_venta_usado: '' });
  const [imagenEstado, setImagenEstado] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.nombre.trim()) return;
    onSave({
      nombre: f.nombre.trim(),
      precio_nuevo: parseFloat(f.precio_nuevo) || 0,
      precio_minimo_nuevo: f.precio_minimo_nuevo !== '' ? parseFloat(f.precio_minimo_nuevo) : undefined,
      precio_mes_nuevo: f.precio_mes_nuevo !== '' ? parseFloat(f.precio_mes_nuevo) : undefined,
      precio_venta_nuevo: f.precio_venta_nuevo !== '' ? parseFloat(f.precio_venta_nuevo) : undefined,
      precio_usado: parseFloat(f.precio_usado) || 0,
      precio_minimo_usado: f.precio_minimo_usado !== '' ? parseFloat(f.precio_minimo_usado) : undefined,
      precio_mes_usado: f.precio_mes_usado !== '' ? parseFloat(f.precio_mes_usado) : undefined,
      precio_venta_usado: f.precio_venta_usado !== '' ? parseFloat(f.precio_venta_usado) : undefined,
      imagenBase64: imagenEstado || undefined,
    });
  };
  return (
    <ModalShell title="Nuevo material" onClose={onClose} onSubmit={submit}>
      <Field label="Nombre" req><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} placeholder="Ej: Tabla 3m" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--success)' }}>Nuevo</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_nuevo} onChange={(e) => set('precio_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mínimo S/"><input type="number" step="0.01" min="0" value={f.precio_minimo_nuevo} onChange={(e) => set('precio_minimo_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mensual S/"><input type="number" step="0.01" min="0" value={f.precio_mes_nuevo} onChange={(e) => set('precio_mes_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Venta S/"><input type="number" step="0.01" min="0" value={f.precio_venta_nuevo} onChange={(e) => set('precio_venta_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--warning)' }}>Usado</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_usado} onChange={(e) => set('precio_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mínimo S/"><input type="number" step="0.01" min="0" value={f.precio_minimo_usado} onChange={(e) => set('precio_minimo_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mensual S/"><input type="number" step="0.01" min="0" value={f.precio_mes_usado} onChange={(e) => set('precio_mes_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Venta S/"><input type="number" step="0.01" min="0" value={f.precio_venta_usado} onChange={(e) => set('precio_venta_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
      </div>
      <ImagenField onCambio={setImagenEstado} />
    </ModalShell>
  );
}

function ModalEditarGranel({ data, onSave, onClose }) {
  const nuevo = data.variantes?.find(v => v.condicion === 'nuevo') || {};
  const usado = data.variantes?.find(v => v.condicion === 'usado') || {};
  const imagenActual = nuevo.imagen_path || usado.imagen_path || null;
  const [f, setF] = useState({
    nombre: data.nombre || '',
    precio_nuevo: nuevo.precio_dia ?? '',
    precio_minimo_nuevo: nuevo.precio_minimo ?? '',
    precio_mes_nuevo: nuevo.precio_mes ?? '',
    precio_venta_nuevo: nuevo.precio_venta ?? '',
    precio_usado: usado.precio_dia ?? '',
    precio_minimo_usado: usado.precio_minimo ?? '',
    precio_mes_usado: usado.precio_mes ?? '',
    precio_venta_usado: usado.precio_venta ?? '',
  });
  const [imagenEstado, setImagenEstado] = useState(undefined);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => onSave(data.nombre, {
    nombre: f.nombre.trim(),
    precio_nuevo: parseFloat(f.precio_nuevo) || 0,
    precio_minimo_nuevo: f.precio_minimo_nuevo !== '' ? parseFloat(f.precio_minimo_nuevo) : undefined,
    precio_mes_nuevo: f.precio_mes_nuevo !== '' ? parseFloat(f.precio_mes_nuevo) : undefined,
    precio_venta_nuevo: f.precio_venta_nuevo !== '' ? parseFloat(f.precio_venta_nuevo) : undefined,
    precio_usado: parseFloat(f.precio_usado) || 0,
    precio_minimo_usado: f.precio_minimo_usado !== '' ? parseFloat(f.precio_minimo_usado) : undefined,
    precio_mes_usado: f.precio_mes_usado !== '' ? parseFloat(f.precio_mes_usado) : undefined,
    precio_venta_usado: f.precio_venta_usado !== '' ? parseFloat(f.precio_venta_usado) : undefined,
  }, { imagen: imagenEstado });
  return (
    <ModalShell title="Editar material" onClose={onClose} onSubmit={submit}>
      <Field label="Nombre" req><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--success)' }}>Nuevo</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_nuevo} onChange={(e) => set('precio_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mínimo S/"><input type="number" step="0.01" min="0" value={f.precio_minimo_nuevo} onChange={(e) => set('precio_minimo_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mensual S/"><input type="number" step="0.01" min="0" value={f.precio_mes_nuevo} onChange={(e) => set('precio_mes_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Venta S/"><input type="number" step="0.01" min="0" value={f.precio_venta_nuevo} onChange={(e) => set('precio_venta_nuevo', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--warning)' }}>Usado</label>
          <Field label="Precio/día"><input type="number" step="0.01" min="0" value={f.precio_usado} onChange={(e) => set('precio_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mínimo S/"><input type="number" step="0.01" min="0" value={f.precio_minimo_usado} onChange={(e) => set('precio_minimo_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Mensual S/"><input type="number" step="0.01" min="0" value={f.precio_mes_usado} onChange={(e) => set('precio_mes_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
          <Field label="Venta S/"><input type="number" step="0.01" min="0" value={f.precio_venta_usado} onChange={(e) => set('precio_venta_usado', e.target.value)} className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} /></Field>
        </div>
      </div>
      <ImagenField rutaInicial={imagenActual} onCambio={setImagenEstado} />
    </ModalShell>
  );
}

/* ================================================================
   DAÑOS PREDEFINIDOS — gestión (familia / material)
   ================================================================ */

function ModalDaños({ title, tipoItem, refKey, onClose }) {
  const [daños, setDaños] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [costo, setCosto] = useState('');
  const nombreRef = useRef(null);
  const toast = useToast();

  const cargar = async () => {
    try {
      const lista = await window.api.getDañosPredefinidos(tipoItem, refKey);
      setDaños(lista);
    } catch (e) {
      toast.show(e.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [tipoItem, refKey]);

  const agregar = async () => {
    if (!nombre.trim()) return;
    try {
      await window.api.guardarDañoPredefinido({
        tipo_item: tipoItem,
        ...(tipoItem === 'individual' ? { id_categoria: refKey } : { nombre_granel: refKey }),
        nombre: nombre.trim().replace(/\s+/g, ' '),
        costo_sugerido: parseFloat(costo) || 0,
      });
      setNombre('');
      setCosto('');
      if (nombreRef.current) nombreRef.current.style.height = 'auto';
      cargar();
    } catch (e) {
      toast.show(e.message, 'error');
    }
  };

  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 112) + 'px';
  };

  const quitar = async (id) => {
    try {
      await window.api.eliminarDañoPredefinido(id);
      cargar();
    } catch (e) {
      toast.show(e.message, 'error');
    }
  };

  return (
    <>
    <style>{`
      .modal-danos-nospin::-webkit-inner-spin-button,
      .modal-danos-nospin::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      .modal-danos-nospin { -moz-appearance: textfield !important; }
    `}</style>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Se mostrarán al marcar un ítem como dañado en una devolución, con su costo sugerido.
        </p>
        {cargando ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Cargando…</p>
        ) : daños.length === 0 ? (
          <p className="text-xs py-1" style={{ color: 'var(--faint)' }}>Sin daños definidos todavía.</p>
        ) : (
          <div className="space-y-2">
            {daños.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>{d.nombre}</span>
                <span className="font-mono text-sm shrink-0" style={{ color: 'var(--primary)' }}>S/ {d.costo_sugerido.toFixed(2)}</span>
                <button onClick={() => quitar(d.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90 shrink-0" style={{ color: 'var(--muted)' }} title="Quitar"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2.5 pt-1 items-start">
          <textarea ref={nombreRef} value={nombre}
            onChange={(e) => { setNombre(e.target.value); autoResize(e.target); }}
            placeholder="Daño (ej: Disco TCT roto)"
            rows={1}
            className="flex-1 min-h-10 max-h-28 px-3 py-2 rounded-lg text-sm border leading-5 outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none overflow-y-auto"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar(); } }}
            style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          <input type="number" step="0.01" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="S/ 0.00"
            className="w-36 shrink-0 h-10 px-3 rounded-lg text-sm border text-center font-mono outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent modal-danos-nospin"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
            style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
          <button onClick={agregar} className="h-10 px-4 shrink-0 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold active:scale-90 transition-all duration-150"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)', border: 'none' }} title="Agregar"><Plus size={15} />Añadir</button>
        </div>
      </div>
    </div>
    </>
  );
}

function ModalDañosFamilia({ familia, onClose }) {
  return <ModalDaños title={'Daños: ' + (familia.nombre || familia.id_categoria)} tipoItem="individual" refKey={familia.id_categoria} onClose={onClose} />;
}

function ModalDañosGranel({ data, onClose }) {
  return <ModalDaños title={'Daños: ' + data.nombre} tipoItem="granel" refKey={data.nombre} onClose={onClose} />;
}
