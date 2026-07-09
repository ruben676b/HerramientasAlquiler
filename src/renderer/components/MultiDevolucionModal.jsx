import { X, CheckCircle2, Circle, AlertTriangle, Clock, RotateCcw, CheckCircle, XCircle, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useDevoluciones } from '../contexts/DevolucionesContext';
import { useToast } from './Toast';

const ESTADOS_OPCIONES = [
  { id: 'bien', label: 'Bien', icon: CheckCircle, bg: 'oklch(0.50 0.13 155)', ink: '#fff', ligero: 'oklch(0.93 0.05 160)' },
  { id: 'dañado', label: 'Dañado', icon: AlertTriangle, bg: 'oklch(0.55 0.13 70)', ink: '#fff', ligero: 'oklch(0.93 0.05 75)' },
  { id: 'no devuelto', label: 'No devuelto', icon: XCircle, bg: 'oklch(0.40 0 0)', ink: '#fff', ligero: 'oklch(0.93 0.04 25)' },
];

export default function MultiDevolucionModal() {
  const {
    devoluciones, isOpen, activeId, closeDialog,
    setActiveId, removeDevolucion, markCompletada,
  } = useDevoluciones();

  if (!isOpen) return null;

  const pendientes = devoluciones.filter(d => !d.completada);
  const active = pendientes.find(d => d.id === activeId);

  return (
    <div className="fixed inset-0 z-50 flex" style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }} onClick={closeDialog}>
      <div className="m-auto w-[98vw] max-w-[1200px] h-[92vh] rounded-2xl flex overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button onClick={closeDialog} className="absolute top-3 right-3 z-50 p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--muted)' }}><X size={18} /></button>

        {/* Sidebar */}
        <div className="w-[200px] shrink-0 border-r flex flex-col"
          style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--sidebar-ink)' }}>Devoluciones</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.15)', color: 'oklch(0.55 0.08 240)' }}>
              {pendientes.length}/{5}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {pendientes.map(d => (
              <button key={d.id} onClick={() => setActiveId(d.id)}
                className="w-full text-left px-3 py-2 transition-colors duration-150 border-l-[3px] group relative"
                style={{
                  backgroundColor: activeId === d.id ? 'var(--sidebar-active)' : 'transparent',
                  borderLeftColor: activeId === d.id ? (d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)') : 'transparent',
                }}>
                <div className="flex items-center gap-2">
                  <Circle size={7} fill={d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)'} stroke="none" />
                  <span className="text-[12px] font-medium truncate" style={{ color: activeId === d.id ? (d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)') : 'var(--sidebar-muted)' }}>
                    {d.cliente_nombre}
                  </span>
                </div>
                <div className="text-[10px] ml-4 mt-0.5 space-x-1">
                  {d.dias_atraso > 0 ? <span style={{ color: 'var(--danger)' }}>{d.dias_atraso} día{d.dias_atraso !== 1 ? 's' : ''} atraso</span> : <span style={{ color: 'var(--muted)' }}>Sin atraso</span>}
                  {d.total_pagado > 0 && (
                    <span style={{ color: 'var(--danger)' }}>· Debe: S/ {((d.subtotal_diario || 0) * Math.max(1, Math.ceil((new Date(d.fecha_pactada + 'T00:00:00') - new Date(d.fecha_salida + 'T00:00:00')) / 86400000) + 1) + (d.dias_atraso || 0) * (d.subtotal_diario || 0) - (d.total_pagado || 0)).toFixed(0)}</span>
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeDevolucion(d.id); }}
                  className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950"
                  style={{ color: 'var(--sidebar-muted)' }}><X size={10} /></button>
              </button>
            ))}
            {pendientes.length === 0 && (
              <div className="px-3 py-8 text-center">
                <RotateCcw size={24} className="mx-auto mb-2" style={{ color: 'var(--sidebar-muted)' }} />
                <p className="text-[11px]" style={{ color: 'var(--sidebar-muted)' }}>Use "Devolver" en Alquileres</p>
              </div>
            )}
          </div>
        </div>

        {/* Panel principal */}
        <div className="flex-1 flex flex-col min-w-0">
          {active ? (
            <DevolucionForm key={active.id} devolucion={active} onCompletada={markCompletada} closeDialog={closeDialog} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {pendientes.length === 0 ? 'Use "Devolver" en Alquileres para iniciar una devolución' : 'Seleccione una devolución'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DevolucionForm({ devolucion, onCompletada, closeDialog }) {
  const toast = useToast();
  const [estados, setEstados] = useState({});
  const [notas, setNotas] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [costosRep, setCostosRep] = useState({});
  const [error, setError] = useState('');
  const [cobrando, setCobrando] = useState(false);

  const setEstado = (idx, e) => setEstados(p => ({ ...p, [idx]: e }));
  const setNota = (idx, v) => setNotas(p => ({ ...p, [idx]: v }));
  const setCantidad = (idx, v) => setCantidades(p => ({ ...p, [idx]: v }));
  const setCosto = (idx, v) => setCostosRep(p => ({ ...p, [idx]: v }));

  // Cálculos de caja en tiempo real
  const dias = Math.max(1, Math.ceil(
    (new Date(devolucion.fecha_pactada + 'T00:00:00') - new Date(devolucion.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);
  const montoBase = (devolucion.subtotal_diario || 0) * dias;

  // Sumar atraso de los ítems que se están marcando como devueltos (bien o dañado)
  const montoAtrasoItems = devolucion.items.reduce((a, item, idx) => {
    const est = estados[idx];
    if (est && est !== 'no devuelto') {
      return a + (item.monto_atraso_item || 0);
    }
    return a;
  }, 0);
  // Fallback: si no hay atraso por ítem pero el contrato tiene dias_atraso, usar cálculo global
  const montoAtraso = montoAtrasoItems > 0 ? montoAtrasoItems : (devolucion.dias_atraso || 0) * (devolucion.subtotal_diario || 0);

  // Sumar costos de reparación de los ítems marcados como dañado
  const totalDanos = Object.entries(costosRep).reduce((a, [idx, v]) => {
    if (estados[idx] === 'dañado' && v > 0) return a + parseFloat(v);
    return a;
  }, 0);

  const total = montoBase + montoAtraso + totalDanos + (devolucion.deposito_monto || 0);
  const saldoPendiente = Math.max(0, total - (devolucion.total_pagado || 0));

  // Preparar items para el backend
  const prepararItems = () => {
    const itemsDevueltos = [];
    const observaciones = {};

    Object.entries(estados).forEach(([idx, estado]) => {
      if (!estado) return;
      const item = devolucion.items[idx];
      itemsDevueltos.push({
        id_detalle: item.id,
        estado_devolucion: estado,
        cantidad_devuelta: item.id_item_granel
          ? (parseInt(cantidades[idx]) || item.cantidad)
          : undefined,
        costo_reparacion: estado === 'dañado' ? (parseFloat(costosRep[idx]) || 0) : undefined,
      });
      if (notas[idx]) observaciones[item.id] = notas[idx];
    });

    return { itemsDevueltos, observaciones };
  };

  const confirmar = async (conCobro) => {
    if (!window.api) return;
    setError('');

    const { itemsDevueltos, observaciones } = prepararItems();
    if (itemsDevueltos.length === 0) {
      return setError('Seleccione al menos un ítem para devolver.');
    }

    setCobrando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const resultado = await window.api.registrarDevolucion({
        idContrato: devolucion.contrato_id,
        fechaDevolucionReal: hoy,
        itemsDevueltos,
        observaciones,
      });

      // Si se eligió "Cobrar y cerrar", registrar el pago automático
      if (conCobro && saldoPendiente > 0) {
        await window.api.registrarPago({
          idContrato: devolucion.contrato_id,
          monto: saldoPendiente,
          metodo: 'efectivo',
        });
        toast('Pago de S/ ' + saldoPendiente.toFixed(2) + ' registrado automáticamente');
      }

      onCompletada(devolucion.id);

      if (resultado.completado) {
        toast('Devolución completada' + (conCobro ? ' y cobrada' : ''));
      } else {
        toast('Devolución parcial: faltan ' + resultado.pendientes + ' ítem(s) por devolver.', 'warning');
      }
    } catch (e) {
      setError(e.message || 'Error al registrar devolución.');
    } finally {
      setCobrando(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Devolución</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {devolucion.cliente_nombre} · DNI {devolucion.cliente_dni || '—'} · {dias} día{dias !== 1 ? 's' : ''} de alquiler
          </p>
        </div>
        <button onClick={closeDialog} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="shrink-0 mx-5 mt-3 px-3 py-2 rounded-lg text-xs"
          style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
      )}

      {/* Cuerpo: dos columnas */}
      <div className="flex-1 flex min-h-0">
        {/* Columna izquierda: Ítems (60%) */}
        <div className="w-[60%] overflow-y-auto px-5 py-3 space-y-3">
          {devolucion.items.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--faint)' }}>Sin ítems registrados</p>
          ) : (
            devolucion.items.map((item, idx) => {
              const est = estados[idx] || null;
              const esGranel = !!item.id_item_granel;
              return (
                <div key={idx}
                  className="rounded-lg border px-3 py-2 text-xs transition-all duration-150"
                  style={{
                    borderColor: est === 'no devuelto' ? 'var(--border)' : (est ? ESTADOS_OPCIONES.find(o => o.id === est)?.bg + '60' : 'var(--border)'),
                    backgroundColor: est === 'no devuelto' ? 'oklch(0.97 0 0)' : 'var(--surface)',
                    opacity: est === 'no devuelto' ? 0.6 : 1,
                  }}>
                  {/* Fila única compacta */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Badge */}
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                      style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                      {esGranel ? 'x' + item.cantidad : item.item_codigo}
                    </span>
                    {/* Nombre */}
                    <span className="font-medium text-[13px] truncate" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                    {/* Info secundaria */}
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--faint)' }}>
                      S/ {item.precio_dia_aplicado.toFixed(2)}/día{esGranel ? ' c/u' : ''}
                    </span>
                    {/* Etiqueta de atraso por ítem */}
                    {(item.dias_atraso_item || 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>
                        &#9888; +{item.dias_atraso_item} día{item.dias_atraso_item !== 1 ? 's' : ''} (+S/ {item.monto_atraso_item.toFixed(0)})
                      </span>
                    )}
                    {/* Selector cantidad granel */}
                    {esGranel && (
                      <span className="flex items-center gap-0.5 ml-auto text-[10px]" style={{ color: 'var(--muted)' }}>
                        <button onClick={() => setCantidad(idx, Math.max(0, (parseInt(cantidades[idx]) || item.cantidad) - 1))}
                          className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Minus size={10} /></button>
                        <span className="w-6 text-center font-mono font-semibold" style={{ color: 'var(--ink)' }}>{cantidades[idx] ?? item.cantidad}</span>
                        <button onClick={() => setCantidad(idx, Math.min(item.cantidad, (parseInt(cantidades[idx]) || item.cantidad) + 1))}
                          className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Plus size={10} /></button>
                        <span className="ml-0.5" style={{ color: 'var(--faint)' }}>/ {item.cantidad}</span>
                      </span>
                    )}
                    {/* Botones de estado — segmented control */}
                    <span className="flex gap-px rounded-md overflow-hidden border ml-auto shrink-0"
                      style={{ borderColor: 'var(--border)' }}>
                      {ESTADOS_OPCIONES.map(op => {
                        const sel = est === op.id;
                        return (
                          <button key={op.id} onClick={() => setEstado(idx, op.id === est ? null : op.id)}
                            className="px-2 h-7 text-[10px] font-medium transition-all duration-100 flex items-center gap-1"
                            style={{
                              backgroundColor: sel ? op.bg : 'var(--bg)',
                              color: sel ? op.ink : 'var(--muted)',
                            }}>
                            <op.icon size={10} /> {op.label}
                          </button>
                        );
                      })}
                    </span>
                  </div>

                  {/* Expandido: Dañado => costo + nota */}
                  {est === 'dañado' && (
                    <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>Costo reparación: S/</span>
                      <input type="number" step="0.01" min="0"
                        value={costosRep[idx] ?? ''}
                        placeholder="0"
                        onChange={e => setCosto(idx, e.target.value)}
                        className="w-16 h-6 px-1 rounded text-[10px] border text-center font-mono"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                      <input
                        placeholder="Nota del daño..."
                        value={notas[idx] || ''}
                        onChange={e => setNota(idx, e.target.value)}
                        className="flex-1 h-6 px-1.5 rounded text-[10px] border"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Columna derecha: Caja en tiempo real (40%) */}
        <div className="w-[40%] p-5 space-y-4 overflow-y-auto"
          style={{ borderLeft: '0.5px solid var(--border)', backgroundColor: 'var(--surface)' }}>

          <h3 className="text-[11px] uppercase tracking-wider font-semibold"
            style={{ color: 'var(--muted)' }}>Resumen de devolución</h3>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <span style={{ color: 'var(--muted)' }}>Alquiler base ({dias} día{dias !== 1 ? 's' : ''})</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
            </div>
            {montoAtraso > 0 && (
              <div className="flex justify-between items-baseline">
                <span style={{ color: 'var(--danger)' }}>Recargo por atraso</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {montoAtraso.toFixed(2)}</span>
              </div>
            )}
            {totalDanos > 0 && (
              <div className="flex justify-between items-baseline">
                <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>+ S/ {totalDanos.toFixed(2)}</span>
              </div>
            )}
            <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
            <div className="flex justify-between items-baseline font-semibold">
              <span style={{ color: 'var(--ink)' }}>TOTAL A PAGAR</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span style={{ color: 'var(--muted)' }}>Pagado anteriormente</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {(devolucion.total_pagado || 0).toFixed(2)}</span>
            </div>
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-base font-bold" style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
              <span className="font-mono tabular-nums font-bold text-base" style={{ color: saldoPendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                S/ {saldoPendiente.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Botones de cierre */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => confirmar(true)}
              disabled={cobrando}
              className="w-full h-10 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { if (!cobrando) e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}>
              <CheckCircle2 size={16} /> Cobrar y cerrar devolución
            </button>
            <button
              onClick={() => confirmar(false)}
              disabled={cobrando}
              className="w-full h-9 rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ backgroundColor: 'transparent', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              Solo devolución (falta pago)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
