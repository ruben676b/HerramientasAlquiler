import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { useToast } from './Toast';
import DescripcionPopover from './DescripcionPopover';
import DatePicker from './DatePicker';
import { fmtLocalDate, contarHabiles, desglosarMensual, sumarMesCalendario } from '../lib/duracion';

export default function AgregarItemModal({ idContrato, onClose, onAdded }) {
  const toast = useToast();
  const [todasHerramientas, setTodasHerramientas] = useState([]);
  const [granelCat, setGranelCat] = useState([]);
  const [kitsCat, setKitsCat] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [foco, setFoco] = useState(false);
  const [index, setIndex] = useState(-1);
  const busquedaRef = useRef(null);
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [totalEditando, setTotalEditando] = useState({});
  const [cantEditando, setCantEditando] = useState({});
  const inputTotalRefs = useRef({});
  const inputCantRefs = useRef({});

  useEffect(() => {
    if (!window.api) return;
    Promise.all([
      window.api.getHerramientas({}),
      window.api.getGranel(),
      window.api.getKits ? window.api.getKits() : Promise.resolve([]),
    ]).then(([h, g, k]) => {
      setTodasHerramientas(h);
      setGranelCat(g);
      setKitsCat(k);
    }).catch(() => {});
  }, []);

  const resultados = useMemo(() => {
    if (!busqueda) return [];
    const q = busqueda.toLowerCase();
    const herr = todasHerramientas
      .filter(h => (h.id || '').toLowerCase().includes(q) || (h.nombre || '').toLowerCase().includes(q) || (h.id || '').replace('-', '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.estado === 'disponible' && b.estado !== 'disponible') return -1;
        if (b.estado === 'disponible' && a.estado !== 'disponible') return 1;
        return 0;
      })
      .slice(0, 8)
      .map(h => ({ ...h, _tipo: 'herramienta', _enLista: items.some(i => i.id_herramienta === h.id) }));
    const gran = granelCat
      .filter(g => (g.nombre || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(g => ({ ...g, _tipo: 'granel', _enLista: !!items.find(i => i.id_item_granel === g.id), _dispEfectivo: g.cantidad_disponible }));
    const kits = kitsCat
      .filter(k => (k.nombre || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(k => ({ ...k, _tipo: 'kit', _enLista: !!items.find(i => i.id_kit === k.id), _dispEfectivo: k.disponibilidad || 0 }));
    return [...herr, ...gran, ...kits];
  }, [busqueda, todasHerramientas, granelCat, kitsCat, items]);

  const agregar = (r) => {
    if (r._tipo === 'herramienta') {
      if (items.some(i => i.id_herramienta === r.id)) { toast(r.id + ' ya está agregada', 'warning'); return; }
      if (r.estado !== 'disponible') return;
      setItems([...items, { tipo: 'individual', id_herramienta: r.id, nombre: r.nombre, descripcion: r.descripcion, precio_dia: r.precio_dia, precio_minimo: r.precio_minimo, precio_mes: r.precio_mes, cantidad: 1, fecha_salida_item: fmtLocalDate(new Date()), fecha_devolucion_item: fmtLocalDate(new Date()), tarifa: 'dia' }]);
    } else if (r._tipo === 'granel') {
      if (r.cantidad_disponible < 1) return setError('Stock insuficiente.');
      const existente = items.find(i => i.id_item_granel === r.id);
      if (existente) {
        setItems(items.map(i => i.id_item_granel === r.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      } else {
        setItems([...items, { tipo: 'granel', id_item_granel: r.id, nombre: r.nombre, descripcion: r.descripcion, condicion: r.condicion, precio_dia: r.precio_dia, precio_minimo: r.precio_minimo, precio_mes: r.precio_mes, cantidad: 1, fecha_salida_item: fmtLocalDate(new Date()), fecha_devolucion_item: fmtLocalDate(new Date()), tarifa: 'dia' }]);
      }
    } else if (r._tipo === 'kit') {
      if ((r.disponibilidad || 0) < 1) return setError('Stock insuficiente para el kit ' + r.nombre + '.');
      const existente = items.find(i => i.id_kit === r.id);
      if (existente) {
        setItems(items.map(i => i.id_kit === r.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      } else {
        setItems([...items, { tipo: 'kit', id_kit: r.id, nombre: r.nombre, descripcion: r.descripcion, precio_dia: r.precio_dia, precio_minimo: r.precio_minimo, precio_mes: r.precio_mes, cantidad: 1, fecha_salida_item: fmtLocalDate(new Date()), fecha_devolucion_item: fmtLocalDate(new Date()), tarifa: 'dia', _componentes: r.componentes || [], _disponibilidad: r.disponibilidad || 0 }]);
      }
    }
    setBusqueda('');
  };

  const quitarItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const cambiarFechaItem = (idx, fecha) => setItems(items.map((item, i) => i === idx ? { ...item, fecha_devolucion_item: fecha, total_editado: undefined } : item));
  const cambiarFechaSalidaItem = (idx, fecha) => setItems(items.map((item, i) => i === idx ? { ...item, fecha_salida_item: fecha || null, total_editado: undefined } : item));
  const cambiarCantidad = (idx, delta) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const nueva = Math.max(1, item.cantidad + delta);
      return { ...item, cantidad: nueva, total_editado: undefined };
    }));
  };
  const setTarifaItem = (idx, tarifa) => setItems(items.map((it, i) => i === idx ? { ...it, tarifa, total_editado: undefined } : it));
  const iniciarEdicionTotal = (idx) => { setTotalEditando(p => ({ ...p, [idx]: true })); setTimeout(() => inputTotalRefs.current[idx]?.select(), 60); };
  const finalizarEdicionTotal = (idx, raw) => {
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) { setItems(items.map((item, i) => i === idx ? { ...item, total_editado: val } : item)); }
    else { setItems(items.map((item, i) => i === idx ? { ...item, total_editado: undefined } : item)); }
    setTotalEditando(p => ({ ...p, [idx]: false }));
  };

  const itemsConDias = useMemo(() => {
    return items.map(item => {
      const salidaDate = item.fecha_salida_item || fmtLocalDate(new Date());
      const devDate = item.fecha_devolucion_item || fmtLocalDate(new Date());
      const tarifa = item.tarifa || 'dia';
      const diasItem = Math.max(1, Math.ceil((new Date(devDate + 'T00:00:00') - new Date(salidaDate + 'T00:00:00')) / 86400000) + 1);
      const diasHabilesItem = contarHabiles(salidaDate, devDate);
      let subCalc;
      let mesesItem = 0;
      let diasExtraItem = 0;
      if (tarifa === 'mes' && item.precio_mes != null) {
        const desg = desglosarMensual(salidaDate, devDate);
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
  }, [items]);

  const infoTarifa = (item) => {
    if (item.tarifa === 'mes' && item.precio_mes != null) return { precio: item.precio_mes, label: '/mes' };
    if (item.tarifa === 'minimo' && item.precio_minimo != null) return { precio: item.precio_minimo, label: '/día' };
    return { precio: item.precio_dia || 0, label: '/día' };
  };

  const totalAgregar = itemsConDias.reduce((a, item) => a + (item.total_editado != null ? item.total_editado : item.sub_calc), 0);

  const guardar = async () => {
    if (items.length === 0) return setError('Agregue al menos un ítem.');
    if (!window.api) return;
    setGuardando(true);
    setError('');
    try {
      const itemsData = itemsConDias.map(item => ({
        tipo_item: item.tipo,
        id_herramienta: item.id_herramienta || undefined,
        id_item_granel: item.id_item_granel || undefined,
        id_kit: item.id_kit || undefined,
        cantidad: item.cantidad || 1,
        fecha_salida_item: item.fecha_salida_item || undefined,
        fecha_devolucion_pactada_item: item.fecha_devolucion_item || undefined,
        tarifa_aplicada: item.tarifa || 'dia',
        precio_aplicado: infoTarifa(item).precio,
        total_item_snapshot: item.total_editado != null ? item.total_editado : item.sub_calc,
      }));
      await window.api.agregarItemContrato(idContrato, itemsData);
      toast(items.length + ' ítem' + (items.length !== 1 ? 's' : '') + ' agregado' + (items.length !== 1 ? 's' : '') + ' al contrato #' + idContrato);
      onAdded?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Error al agregar ítems.');
    } finally {
      setGuardando(false);
    }
  };

  const renderItemCard = (item, idx) => {
    const esGranel = !!item.id_item_granel;
    const esKit = !!item.id_kit;
    const tarifa = item.tarifa || 'dia';
    const refInfo = infoTarifa(item);
    const sub = item.total_editado != null ? item.total_editado : item.sub_calc;
    return (
      <div key={idx} className="px-3 py-2.5 rounded-xl transition-colors duration-150 group" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
        <div className="flex items-center gap-2">
          {item.id_herramienta ? (
            <span className="inline-flex px-2 py-0.5 rounded-lg font-mono text-xs font-bold shrink-0" style={{ backgroundColor: 'oklch(0.53 0.135 55 / 0.10)', color: 'var(--primary)' }}>{item.id_herramienta}</span>
          ) : esKit ? (
            <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium shrink-0" style={{ backgroundColor: 'oklch(0.50 0.11 155 / 0.12)', color: 'var(--success)' }}>Kit</span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium shrink-0" style={{ backgroundColor: item.condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)', color: item.condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)' }}>{item.condicion}</span>
          )}
          <span className="flex-1 flex items-center gap-1.5 min-w-0 text-sm font-medium" style={{ color: 'var(--ink)' }}>
            <span className="truncate">{item.nombre}</span>
            <DescripcionPopover text={item.descripcion} />
          </span>
          <button onClick={() => quitarItem(idx)} className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950 shrink-0" style={{ color: 'var(--muted)' }}><X size={14} /></button>
        </div>
        {(esGranel || esKit) && (
          <div className="flex items-center gap-2 mt-1.5 text-xs">
            <span style={{ color: 'var(--muted)' }}>Cantidad:</span>
            <button onClick={() => cambiarCantidad(idx, -1)} className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-black/5" style={{ color: 'var(--muted)' }}>&#8722;</button>
            {cantEditando[idx] ? (
              <input ref={el => inputCantRefs.current[idx] = el} type="number" min="1" defaultValue={item.cantidad}
                onBlur={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setItems(items.map((it, i) => i === idx ? { ...it, cantidad: v, total_editado: undefined } : it)); setCantEditando(p => ({ ...p, [idx]: false })); }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                className="w-10 h-5 px-0.5 rounded text-xs text-center font-mono border" style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} autoFocus />
            ) : (
              <span onClick={() => { setCantEditando(p => ({ ...p, [idx]: true })); setTimeout(() => inputCantRefs.current[idx]?.select(), 60); }}
                className="w-8 text-center font-mono text-sm font-semibold cursor-pointer px-0.5 rounded hover:bg-black/5" style={{ color: 'var(--ink)' }}>{item.cantidad}</span>
            )}
            <button onClick={() => cambiarCantidad(idx, 1)} className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold hover:bg-black/5" style={{ color: 'var(--muted)' }}>+</button>
          </div>
        )}
        {esKit && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(item._componentes || []).map((c, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--surface)', color: 'var(--faint)' }}>{(c.cantidad * (item.cantidad || 1)) + '× ' + c.nombre}</span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center gap-1">Desde: <DatePicker compacto value={item.fecha_salida_item} onChange={(f) => cambiarFechaSalidaItem(idx, f)} /></span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="flex items-center gap-1">Hasta: <DatePicker compacto value={item.fecha_devolucion_item} onChange={(f) => cambiarFechaItem(idx, f)} min={item.fecha_salida_item} /></span>
          <span className="font-medium" style={{ color: 'var(--info)' }}>
            {tarifa === 'mes' && item.precio_mes != null && item.meses_item >= 1
              ? (item.dias_extra_item === 0 ? `${item.meses_item} mes${item.meses_item !== 1 ? 'es' : ''}` : `${item.meses_item} mes${item.meses_item !== 1 ? 'es' : ''} + ${item.dias_extra_item} día${item.dias_extra_item !== 1 ? 's' : ''}`)
              : `${item.dias_habiles_item} día${item.dias_habiles_item !== 1 ? 's' : ''}`}
          </span>
          <span className="flex gap-px rounded overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
            <button onClick={() => { const nueva = sumarMesCalendario(item.fecha_devolucion_item, -1); if (nueva >= item.fecha_salida_item) cambiarFechaItem(idx, nueva); }}
              disabled={sumarMesCalendario(item.fecha_devolucion_item, -1) < item.fecha_salida_item}
              title={`Restar 1 mes → ${sumarMesCalendario(item.fecha_devolucion_item, -1)}`}
              className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
              style={{ backgroundColor: 'var(--bg)', color: sumarMesCalendario(item.fecha_devolucion_item, -1) < item.fecha_salida_item ? 'var(--faint)' : 'var(--ink)', cursor: sumarMesCalendario(item.fecha_devolucion_item, -1) < item.fecha_salida_item ? 'not-allowed' : 'pointer' }}>&minus;1 mes</button>
            <button onClick={() => cambiarFechaItem(idx, sumarMesCalendario(item.fecha_devolucion_item, 1))} title={`Sumar 1 mes → ${sumarMesCalendario(item.fecha_devolucion_item, 1)}`}
              className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>+1 mes</button>
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="flex gap-px rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setTarifaItem(idx, 'dia')} title="Precio normal por día" className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
              style={{ backgroundColor: tarifa === 'dia' ? 'oklch(0.53 0.135 55)' : 'var(--bg)', color: tarifa === 'dia' ? '#fff' : 'var(--muted)' }}>S/ {(item.precio_dia || 0).toFixed(2)}/día</button>
            {item.precio_minimo != null && (
              <button onClick={() => setTarifaItem(idx, 'minimo')} title="Precio mínimo por día" className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
                style={{ backgroundColor: tarifa === 'minimo' ? 'oklch(0.55 0.12 240)' : 'var(--bg)', color: tarifa === 'minimo' ? '#fff' : 'var(--muted)' }}>Min S/ {item.precio_minimo.toFixed(2)}</button>
            )}
            {item.precio_mes != null && (
              <button onClick={() => setTarifaItem(idx, 'mes')} title="Precio mensual" className="px-1.5 h-5 text-[9px] font-medium transition-all duration-100"
                style={{ backgroundColor: tarifa === 'mes' ? 'oklch(0.50 0.11 155)' : 'var(--bg)', color: tarifa === 'mes' ? '#fff' : 'var(--muted)' }}>S/ {item.precio_mes.toFixed(2)}/mes</button>
            )}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--faint)' }}>
            {refInfo.label === '/mes' ? (item.meses_item >= 1 && item.dias_extra_item > 0 ? '' : 'plana por mes') : (item.dias_habiles_item >= 20 && tarifa === 'dia' ? '≥ 20 días → prueba mensual' : 'por día')}
          </span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>Total:</span>
          {totalEditando[idx] ? (
            <input ref={el => inputTotalRefs.current[idx] = el} type="number" step="0.01" min="0" defaultValue={sub}
              onBlur={e => finalizarEdicionTotal(idx, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') finalizarEdicionTotal(idx, e.target.value); }}
              className="w-24 h-6 px-1 rounded text-xs border font-mono text-center"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--success)', outline: '2px solid var(--success)' }} autoFocus />
          ) : (
            <span onClick={() => iniciarEdicionTotal(idx)} className="font-mono font-bold text-sm cursor-pointer px-1.5 py-0.5 rounded hover:bg-black/5" style={{ color: 'var(--ink)' }}>S/ {sub.toFixed(2)}</span>
          )}
          {item.total_editado != null && (() => {
            const diff = item.total_editado - item.sub_calc;
            return diff !== 0 ? (
              <span className="flex items-center gap-1">
                <span className="text-[9px]" style={{ color: 'var(--danger)' }}>({diff < 0 ? '\u2013S/ ' + Math.abs(diff).toFixed(0) : '+S/ ' + diff.toFixed(0)})</span>
                <button onClick={() => setItems(prev => prev.map((it, i) => i === idx ? { ...it, total_editado: undefined } : it))}
                  className="text-[9px] px-1 py-0.5 rounded transition-all duration-100 hover:opacity-80" title="Restaurar cálculo automático"
                  style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>restaurar</button>
              </span>
            ) : null;
          })()}
          {tarifa === 'mes' && item.precio_mes != null && item.meses_item >= 1 && item.dias_extra_item > 0 && item.total_editado == null && (
            <span className="flex gap-1">
              <button onClick={() => setItems(items.map((it, i) => i === idx ? { ...it, total_editado: item.precio_mes * item.meses_item * item.cantidad } : it))}
                className="px-1.5 h-5 rounded text-[9px] font-medium transition-all duration-100"
                style={{ backgroundColor: 'oklch(0.50 0.11 155 / 0.12)', color: 'oklch(0.45 0.12 155)', border: '1px solid oklch(0.50 0.11 155 / 0.3)' }}
                title={`Cobrar solo ${item.meses_item} mes${item.meses_item !== 1 ? 'es' : ''} (ignorar ${item.dias_extra_item} día${item.dias_extra_item !== 1 ? 's' : ''} extra)`}>
                Solo {item.meses_item} mes{item.meses_item !== 1 ? 'es' : ''} (sin extra)
              </button>
              {item.dias_extra_item >= 20 && (
                <button onClick={() => setItems(items.map((it, i) => i === idx ? { ...it, total_editado: item.precio_mes * (item.meses_item + 1) * item.cantidad } : it))}
                  className="px-1.5 h-5 rounded text-[9px] font-medium transition-all duration-100"
                  style={{ backgroundColor: 'oklch(0.55 0.12 240 / 0.12)', color: 'oklch(0.50 0.13 240)', border: '1px solid oklch(0.55 0.12 240 / 0.3)' }}
                  title={`Incluir ${item.dias_extra_item} días extra como mes completo (${item.meses_item}+1 meses)`}>
                  Incluir como {item.meses_item + 1} meses
                </button>
              )}
            </span>
          )}
          {tarifa === 'mes' && item.precio_mes != null && item.meses_item === 0 && item.dias_habiles_item >= 20 && item.total_editado == null && (
            <button onClick={() => setItems(items.map((it, i) => i === idx ? { ...it, total_editado: item.precio_mes * item.cantidad } : it))}
              className="px-1.5 h-5 rounded text-[9px] font-medium transition-all duration-100"
              style={{ backgroundColor: 'oklch(0.50 0.11 155 / 0.12)', color: 'oklch(0.45 0.12 155)', border: '1px solid oklch(0.50 0.11 155 / 0.3)' }}
              title={`${item.dias_habiles_item} días hábiles → cobrar como 1 mes`}>
              Cobrar como 1 mes (S/ {item.precio_mes.toFixed(0)})
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Agregar herramientas al contrato #{idContrato}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Busque y agregue ítems adicionales</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors duration-150 hover:bg-black/5" style={{ color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
            <input type="text" placeholder="Buscar herramienta, material o kit..." value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setIndex(-1); }}
              onFocus={() => setFoco(true)}
              onBlur={() => setTimeout(() => setFoco(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, resultados.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, -1)); }
                if (e.key === 'Enter' && index >= 0 && resultados[index]) { agregar(resultados[index]); setIndex(-1); }
                if (e.key === 'Escape') { setBusqueda(''); setIndex(-1); setFoco(false); e.currentTarget.blur(); }
              }}
              ref={busquedaRef}
              className="w-full h-9 pl-8 pr-8 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5" style={{ color: 'var(--faint)' }}>✕</button>
            )}
            {foco && busqueda && resultados.length > 0 && (
              <div className="absolute z-[100] mt-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-lg max-h-72 overflow-y-auto w-full">
                {resultados.map((r, idx) => {
                  const esHerr = r._tipo === 'herramienta';
                  const disponible = esHerr ? r.estado === 'disponible' && !r._enLista : r._dispEfectivo > 0;
                  const destacado = idx === index;
                  return (
                    <button key={esHerr ? r.id : (r._tipo === 'kit' ? 'k' + r.id : 'g' + r.id)} disabled={!disponible}
                      onClick={() => { if (disponible) { agregar(r); setIndex(-1); } else { toast(esHerr ? r.estado : 'Sin stock', 'warning'); } }}
                      className="w-full text-left px-3 py-2 text-xs transition-colors duration-150 flex flex-col gap-1 disabled:opacity-40"
                      style={{ cursor: disponible ? 'pointer' : 'not-allowed', backgroundColor: destacado ? 'var(--surface)' : 'var(--bg)' }}>
                      <span className="flex items-center gap-3">
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
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold shrink-0" style={{
                          backgroundColor: r._enLista ? 'oklch(0.93 0.04 240)' : (disponible ? 'oklch(0.93 0.07 160)' : 'oklch(0.93 0.05 25)'),
                          color: r._enLista ? 'var(--info)' : (disponible ? 'oklch(0.40 0.10 160)' : 'oklch(0.40 0.15 25)'),
                        }}>{r._enLista ? 'Agregado' : (esHerr ? (r.estado === 'disponible' ? 'Disp.' : r.estado) : (r._dispEfectivo > 0 ? r._dispEfectivo + ' disp.' : 'Sin stock'))}</span>
                      </span>
                      {(() => {
    const precios = [
      { val: r.precio_dia, label: 'día', color: 'var(--primary)' },
      { val: r.precio_minimo, label: 'mínimo', color: 'var(--warning)' },
      { val: r.precio_mes, label: 'mes', color: 'var(--info)' },
      { val: r.precio_venta, label: 'venta', color: 'var(--success)' },
    ].filter(p => p.val != null);
                        return precios.length > 0 && (
                          <span className="flex items-center gap-x-3 gap-y-0.5 pl-[4.5rem] text-[10px]" style={{ color: 'var(--muted)' }}>
                            {precios.map(p => (
                              <span key={p.label} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                                <span style={{ color: p.color, fontWeight: 600, lineHeight: 1 }}>S/{p.val.toFixed(2)}</span>
                                <span>{p.label}</span>
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[80px]">
              <p className="text-xs" style={{ color: 'var(--faint)' }}>Busque y agregue herramientas o materiales al contrato</p>
            </div>
          ) : (
            [...itemsConDias].reverse().map((item, idx) => renderItemCard(item, idx))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</span>}
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
            {items.length > 0 && (
              <span className="font-mono font-bold text-sm" style={{ color: 'var(--ink)' }}>S/ {totalAgregar.toFixed(2)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 h-9 rounded-lg text-xs font-medium transition-colors duration-150" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Cancelar</button>
            <button onClick={guardar} disabled={items.length === 0 || guardando}
              className="px-4 h-9 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
              style={{ backgroundColor: items.length > 0 && !guardando ? 'oklch(0.50 0.11 155)' : 'var(--surface)', color: items.length > 0 && !guardando ? '#fff' : 'var(--muted)' }}>
              {guardando ? 'Guardando...' : 'Agregar ' + items.length + ' ítem' + (items.length !== 1 ? 's' : '')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
