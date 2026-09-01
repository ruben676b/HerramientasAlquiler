import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Search, Plus, Trash2, Wrench, Package, AlertTriangle, CheckCircle2, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import Button from './ui/button';
import { SEMANTIC } from '../lib/constants';

/* ================================================================
   KIT EDITOR MODAL — Crear / editar kits con componentes
   (herramientas individuales + materiales a granel)
   Buscador unificado estilo Mostrador: clic agrega a la lista
   ================================================================ */

const inputCls = 'w-full h-9 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';

const Field = ({ label, req, children, className }) => (
  <label className={cn('block space-y-1', className)}>
    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
      {label}{req && <span style={{ color: 'var(--danger)' }}> *</span>}
    </span>
    {children}
  </label>
);

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

export default function KitEditorModal({ kitId, onSave, onClose }) {
  const [f, setF] = useState({ nombre: '', descripcion: '', precio_dia: '', precio_minimo: '', precio_mes: '', precio_venta: '' });
  const [componentes, setComponentes] = useState([]);
  const [herr, setHerr] = useState([]);
  const [granel, setGranel] = useState([]);
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(true);

  // Buscador unificado
  const [busqueda, setBusqueda] = useState('');
  const [busqFoco, setBusqFoco] = useState(false);
  const [busqIndex, setBusqIndex] = useState(-1);
  const busqRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [familias, g] = await Promise.all([
          window.api.getHerramientasPorCategoria(),
          window.api.getGranelFull(),
        ]);
        const flatH = [];
        for (const fam of familias || []) {
          for (const h of fam.herramientas || []) {
            flatH.push({ id: h.id, nombre: h.nombre, estado: h.estado });
          }
        }
        flatH.sort((a, b) => (a.estado === 'disponible' ? -1 : 1) - (b.estado === 'disponible' ? -1 : 1) || a.nombre.localeCompare(b.nombre));
        const flatG = [];
        for (const m of g || []) {
          for (const v of m.variantes || []) {
            flatG.push({ id: v.id, nombre: m.nombre, condicion: v.condicion, cantidad_disponible: v.cantidad_disponible });
          }
        }
        setHerr(flatH);
        setGranel(flatG);

        if (kitId) {
          const kit = await window.api.getKit(kitId);
          if (kit) {
            setF({
              nombre: kit.nombre || '',
              descripcion: kit.descripcion || '',
              precio_dia: kit.precio_dia ?? '',
              precio_minimo: kit.precio_minimo ?? '',
              precio_mes: kit.precio_mes ?? '',
              precio_venta: kit.precio_venta ?? '',
            });
            setComponentes((kit.componentes || []).map(c => ({
              key: uuid(),
              tipo_item: c.tipo_item,
              id_item: c.tipo_item === 'granel' ? c.id_item_granel : c.id_herramienta,
              nombre: c.tipo_item === 'granel' ? c.nombre : (c.nombre + '  ·  ' + c.id_herramienta),
              condicion: c.condicion,
              cantidad: c.cantidad,
              stock: c.tipo_item === 'granel' ? (c.cantidad_disponible || 0) : (c.estado_herramienta === 'disponible' ? 1 : 0),
              disponible: c.tipo_item === 'individual' ? c.estado_herramienta === 'disponible' : (c.cantidad_disponible || 0) > 0,
            })));
          }
        }
      } catch (e) {
        setErr(e.message || 'Error cargando datos');
      } finally {
        setCargando(false);
      }
    })();
  }, [kitId]);

  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setErr(''); };

  const buscarRank = (q, nombre, id) => {
    const n = (nombre || '').toLowerCase();
    const i = (id || '').toLowerCase();
    if (n.startsWith(q)) return 0;
    if (i.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    if (i.includes(q)) return 3;
    return 4;
  };

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    const h = herr
      .filter(x => x.nombre.toLowerCase().includes(q) || x.id.toLowerCase().includes(q))
      .map(x => ({
        ...x, _tipo: 'herramienta',
        _enLista: componentes.some(c => c.tipo_item === 'individual' && c.id_item === x.id),
        _rank: buscarRank(q, x.nombre, x.id),
        _disp: x.estado === 'disponible' ? 0 : 1,
      }));
    const g = granel
      .filter(x => x.nombre.toLowerCase().includes(q))
      .map(x => ({
        ...x, _tipo: 'granel',
        _enLista: componentes.some(c => c.tipo_item === 'granel' && c.id_item === x.id),
        _rank: buscarRank(q, x.nombre, ''),
        _disp: 0,
      }));
    return [...h, ...g]
      .sort((a, b) => a._rank - b._rank || a._disp - b._disp || (a.nombre || '').localeCompare(b.nombre || ''))
      .slice(0, 50);
  }, [busqueda, herr, granel, componentes]);

  const agregar = (r) => {
    if (r._enLista) return;
    if (r._tipo === 'herramienta') {
      setComponentes(p => [...p, {
        key: uuid(),
        tipo_item: 'individual',
        id_item: r.id,
        nombre: r.nombre + '  ·  ' + r.id,
        condicion: null,
        cantidad: 1,
        stock: r.estado === 'disponible' ? 1 : 0,
        disponible: r.estado === 'disponible',
      }]);
    } else {
      setComponentes(p => [...p, {
        key: uuid(),
        tipo_item: 'granel',
        id_item: r.id,
        nombre: r.nombre,
        condicion: r.condicion,
        cantidad: 1,
        stock: r.cantidad_disponible,
        disponible: r.cantidad_disponible > 0,
      }]);
    }
  };

  const cambiarCantidad = (key, delta) => {
    setComponentes(p => p.map(c => (c.key === key ? { ...c, cantidad: Math.max(1, (parseInt(c.cantidad, 10) || 1) + delta) } : c)));
  };

  const quitar = (key) => setComponentes(p => p.filter(c => c.key !== key));

  const submit = () => {
    if (!f.nombre.trim()) return setErr('Ingrese el nombre del kit.');
    const pd = parseFloat(f.precio_dia);
    if (isNaN(pd) || pd < 0) return setErr('Ingrese un precio diario válido.');
    if (componentes.length === 0) return setErr('El kit debe tener al menos un componente.');
    for (const c of componentes) {
      if (c.tipo_item === 'granel' && (!c.cantidad || c.cantidad < 1)) return setErr('La cantidad de material debe ser al menos 1.');
      if (c.tipo_item === 'individual' && !c.disponible) return setErr('El componente "' + c.nombre + '" no está disponible actualmente.');
    }
    onSave({
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      precio_dia: pd,
      precio_minimo: f.precio_minimo !== '' ? parseFloat(f.precio_minimo) : null,
      precio_mes: f.precio_mes !== '' ? parseFloat(f.precio_mes) : null,
      precio_venta: f.precio_venta !== '' ? parseFloat(f.precio_venta) : null,
      componentes: componentes.map(c => ({
        tipo_item: c.tipo_item,
        id_item_granel: c.tipo_item === 'granel' ? c.id_item : null,
        id_herramienta: c.tipo_item === 'individual' ? c.id_item : null,
        cantidad: c.tipo_item === 'granel' ? (parseInt(c.cantidad, 10) || 1) : 1,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{kitId ? 'Editar kit' : 'Nuevo kit'}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 active:scale-90" style={{ color: 'var(--muted)' }}><X size={15} /></button>
        </div>

        {cargando ? (
          <p className="text-sm py-10 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
        ) : (
          <div className="space-y-3">
            {/* Datos básicos */}
            <Field label="Nombre" req>
              <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} placeholder="Ej: Kit Andamio 3m" autoFocus
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            </Field>
            <Field label="Descripción">
              <input value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} className={inputCls} placeholder="Opcional"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              <Field label="Precio/día" req>
                <input type="number" step="0.01" min="0" value={f.precio_dia} onChange={(e) => set('precio_dia', e.target.value)} className={inputCls}
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
              <Field label="Mínimo">
                <input type="number" step="0.01" min="0" value={f.precio_minimo} onChange={(e) => set('precio_minimo', e.target.value)} className={inputCls} placeholder="Casero"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
              <Field label="Mensual">
                <input type="number" step="0.01" min="0" value={f.precio_mes} onChange={(e) => set('precio_mes', e.target.value)} className={inputCls} placeholder="30 días"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
              <Field label="Venta">
                <input type="number" step="0.01" min="0" value={f.precio_venta} onChange={(e) => set('precio_venta', e.target.value)} className={inputCls}
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
            </div>

            {/* Componentes: buscador unificado */}
            <div className="pt-1">
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Componentes ({componentes.length})</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
              Busque y agregue lo que compone el kit. "Por kit" indica cuántas unidades de cada material lleva. Ej: andamio = 4 patas + 2 cruzetas + 1 plataforma.
            </p>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
              <input type="text" placeholder="Buscar herramienta o material..." value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setBusqIndex(-1); }}
                onFocus={() => setBusqFoco(true)}
                onBlur={() => setTimeout(() => setBusqFoco(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setBusqIndex(i => Math.min(i + 1, resultados.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setBusqIndex(i => Math.max(i - 1, -1)); }
                  if (e.key === 'Enter' && busqIndex >= 0 && resultados[busqIndex]) {
                    agregar(resultados[busqIndex]);
                    setBusqIndex(-1);
                  }
                  if (e.key === 'Escape') { setBusqueda(''); setBusqIndex(-1); setBusqFoco(false); e.currentTarget.blur(); }
                }}
                ref={busqRef}
                className="w-full h-9 pl-8 pr-8 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5" style={{ color: 'var(--faint)' }}>✕</button>
              )}
              {busqFoco && busqueda.trim() && resultados.length > 0 && (
                <div className="fixed z-[100] bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg max-h-80 overflow-y-auto"
                  style={{ top: (busqRef.current?.getBoundingClientRect().bottom || 0) + 4, left: busqRef.current?.getBoundingClientRect().left || 0, width: busqRef.current?.getBoundingClientRect().width || 300 }}>
                  {resultados.map((r, idx) => {
                    const esHerr = r._tipo === 'herramienta';
                    const enLista = r._enLista;
                    const sinStock = esHerr ? r.estado !== 'disponible' : r.cantidad_disponible < 1;
                    const disponible = !enLista && (esHerr ? r.estado === 'disponible' : true);
                    const destacado = idx === busqIndex;
                    return (
                      <button key={(esHerr ? 'h' : 'g') + r.id} type="button" disabled={enLista || (esHerr && r.estado !== 'disponible')}
                        title={enLista ? 'Ya está en el kit — ajuste la cantidad con +/−' : (esHerr && r.estado !== 'disponible' ? r.estado : undefined)}
                        onClick={() => { agregar(r); }}
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
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold shrink-0" style={{
                          backgroundColor: enLista ? 'oklch(0.93 0.04 240)' : (sinStock ? 'oklch(0.93 0.05 25)' : 'oklch(0.93 0.07 160)'),
                          color: enLista ? 'var(--info)' : (sinStock ? 'oklch(0.40 0.15 25)' : 'oklch(0.40 0.10 160)'),
                        }}>
                          {enLista ? 'Agregado' : (esHerr ? (r.estado === 'disponible' ? 'Disp.' : r.estado) : (r.cantidad_disponible > 0 ? r.cantidad_disponible + ' disp.' : 'Sin stock'))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lista de componentes agregados */}
            <div className="space-y-2">
              {componentes.length === 0 && (
                <p className="text-xs px-2 py-3 rounded-lg text-center" style={{ color: 'var(--faint)', backgroundColor: 'var(--surface)' }}>
                  Busque y agregue herramientas o materiales que compongan el kit
                </p>
              )}
              {componentes.map((c) => {
                const esGranel = c.tipo_item === 'granel';
                const cant = parseInt(c.cantidad, 10) || 1;
                const sinStock = esGranel ? c.stock < cant : !c.disponible;
                const cb = esGranel && c.condicion ? SEMANTIC[c.condicion] : null;
                return (
                  <div key={c.key} className="rounded-lg px-3 py-2 flex items-center gap-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
                    {esGranel ? <Package size={14} style={{ color: 'var(--muted)' }} /> : <Wrench size={14} style={{ color: 'var(--muted)' }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>{c.nombre}</span>
                        {cb && <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0" style={{ backgroundColor: cb.soft, color: cb.variable }}>{c.condicion}</span>}
                      </div>
                      {esGranel ? (
                        <p className="text-[10px] mt-0.5" style={{ color: sinStock ? 'var(--danger)' : 'var(--faint)' }}>
                          {sinStock ? 'Solo hay ' + (c.stock ?? 0) + ' en stock' : 'stock: ' + (c.stock ?? 0)}
                        </p>
                      ) : (
                        <p className="text-[10px] mt-0.5" style={{ color: c.disponible ? 'var(--faint)' : 'var(--danger)' }}>
                          {c.disponible ? 'unidad física' : 'No disponible actualmente'}
                        </p>
                      )}
                    </div>
                    {esGranel ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => cambiarCantidad(c.key, -1)} disabled={cant <= 1}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition-colors duration-150 disabled:opacity-30"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}><Minus size={12} /></button>
                        <div className="text-center">
                          <div className="text-sm font-mono leading-none" style={{ color: 'var(--ink)' }}>{cant}</div>
                          <div className="text-[9px] mt-0.5" style={{ color: 'var(--faint)' }}>por kit</div>
                        </div>
                        <button type="button" onClick={() => cambiarCantidad(c.key, 1)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition-colors duration-150"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}><Plus size={12} /></button>
                      </div>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: 'var(--bg)', color: 'var(--faint)' }}>1 und.</span>
                    )}
                    <button type="button" onClick={() => quitar(c.key)} className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 active:scale-90 shrink-0" style={{ color: 'var(--muted)' }} title="Quitar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Indicador en vivo: kits armables con el stock actual */}
            {(() => {
              if (componentes.length === 0) return null;
              const armables = componentes.reduce((min, c) => {
                if (c.tipo_item === 'granel') {
                  const cant = parseInt(c.cantidad, 10) || 1;
                  return Math.min(min, Math.floor((c.stock || 0) / cant));
                }
                return Math.min(min, c.disponible ? 1 : 0);
              }, Infinity);
              const sinStock = armables < 1;
              const estilo = sinStock ? SEMANTIC.malogrado : SEMANTIC.disponible;
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium" style={{ backgroundColor: estilo.soft, color: estilo.variable }}>
                  {sinStock ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                  {sinStock
                    ? 'No puede armar ningún kit con el stock actual — revise los componentes'
                    : 'Puede armar ' + armables + (armables !== 1 ? ' kits' : ' kit') + ' con el stock actual'}
                </div>
              );
            })()}

            {err && <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>{err}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Cancelar</button>
              <Button onClick={submit} variant="primary" size="sm" className="flex-1">{kitId ? 'Guardar cambios' : 'Crear kit'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
