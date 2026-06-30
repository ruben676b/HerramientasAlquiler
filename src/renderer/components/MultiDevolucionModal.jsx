import { X, CheckCircle2, Circle, AlertTriangle, Clock, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useDevoluciones } from '../contexts/DevolucionesContext';
import { useToast } from './Toast';
import Button from './ui/button';

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
        <div className="w-[240px] shrink-0 border-r flex flex-col"
          style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--sidebar-ink)' }}>Devoluciones</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: 'oklch(0.55 0.08 240 / 0.15)', color: 'oklch(0.55 0.08 240)' }}>
              {pendientes.length}/{5}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {pendientes.map(d => (
              <button key={d.id} onClick={() => setActiveId(d.id)}
                className="w-full text-left px-3 py-2.5 transition-colors duration-150 border-l-[3px] group relative"
                style={{
                  backgroundColor: activeId === d.id ? 'var(--sidebar-active)' : 'transparent',
                  borderLeftColor: activeId === d.id ? (d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)') : 'transparent',
                }}>
                <div className="flex items-center gap-2">
                  <Circle size={8} fill={d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)'} stroke="none" />
                  <span className="text-[12px] font-medium truncate pr-4"
                    style={{ color: activeId === d.id ? (d.dias_atraso > 0 ? 'var(--danger)' : 'oklch(0.55 0.08 240)') : 'var(--sidebar-muted)' }}>
                    {d.cliente_nombre}
                  </span>
                </div>
                <div className="text-[10px] ml-4 mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>
                  {d.dias_atraso > 0 ? <span style={{ color: 'var(--danger)' }}>{d.dias_atraso} dia{d.dias_atraso !== 1 ? 's' : ''} atraso</span> : <span>Al dia</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeDevolucion(d.id); }}
                  className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-50 dark:hover:bg-red-950"
                  style={{ color: 'var(--sidebar-muted)' }}><X size={11} /></button>
              </button>
            ))}

            {pendientes.length === 0 && (
              <div className="px-3 py-8 text-center">
                <RotateCcw size={24} className="mx-auto mb-2" style={{ color: 'var(--sidebar-muted)' }} />
                <p className="text-[11px]" style={{ color: 'var(--sidebar-muted)' }}>
                  Use "Devolver" en Alquileres para iniciar
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Panel principal */}
        <div className="flex-1 flex flex-col min-w-0">
          {active ? (
            <DevolucionForm devolucion={active} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <RotateCcw size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {pendientes.length === 0 ? 'Use "Devolver" en Alquileres para iniciar una devolucion' : 'Seleccione una devolucion'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ESTADOS_OPCIONES = [
  { id: 'bien', label: 'Bien', icon: CheckCircle, bg: 'oklch(0.93 0.05 160)', ink: 'var(--success)' },
  { id: 'danado', label: 'Dañado', icon: AlertTriangle, bg: 'oklch(0.93 0.05 75)', ink: 'var(--warning)' },
  { id: 'no devuelto', label: 'No devuelto', icon: XCircle, bg: 'oklch(0.93 0.04 25)', ink: 'var(--danger)' },
];

function DevolucionForm({ devolucion }) {
  const { closeDialog, markCompletada } = useDevoluciones();
  const toast = useToast();
  const [estados, setEstados] = useState({});
  const [notas, setNotas] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [error, setError] = useState('');

  const setEstado = (idx, e) => setEstados(p => ({ ...p, [idx]: e }));
  const setNota = (idx, v) => setNotas(p => ({ ...p, [idx]: v }));
  const setCantidad = (idx, v) => {
    const c = parseInt(v, 10);
    if (!isNaN(c) && c >= 0) setCantidades(p => ({ ...p, [idx]: c }));
    else if (v === '') setCantidades(p => ({ ...p, [idx]: '' }));
  };

  const confirmar = async () => {
    if (!window.api) return;
    setError('');

    const itemsDevueltos = devolucion.items.map((item, idx) => ({
      id_detalle: item.id,
      estado_devolucion: estados[idx] || 'bien',
    }));

    const todosOk = devolucion.items.every((_, idx) => estados[idx]);
    if (!todosOk) return setError('Seleccione el estado de todos los items.');

    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await window.api.registrarDevolucion({
        idContrato: devolucion.contrato_id,
        fechaDevolucionReal: hoy,
        itemsDevueltos,
        observaciones: notas,
      });
      markCompletada(devolucion.id);
      toast('Devolucion registrada correctamente');
    } catch (e) {
      setError(e.message || 'Error al registrar devolucion.');
    }
  };

  const cuentaDanados = Object.values(estados).filter(e => e === 'danado').length;
  const cuentaNoDevueltos = Object.values(estados).filter(e => e === 'no devuelto').length;
  const totalMora = devolucion.items.reduce((a, item, idx) => {
    if (devolucion.dias_atraso > 0 && (estados[idx] || 'bien') !== 'no devuelto') {
      return a + devolucion.dias_atraso * (item.mora_dia_aplicada || 0) * item.cantidad;
    }
    return a;
  }, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Devolucion</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{devolucion.cliente_nombre} · DNI {devolucion.cliente_dni || '—'}</p>
        </div>
        <button onClick={closeDialog} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {error && (
          <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
        )}

        {devolucion.dias_atraso > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: 'oklch(0.95 0.015 25)', color: 'var(--danger)' }}>
            <AlertTriangle size={13} />
            <span>{devolucion.dias_atraso} dia{devolucion.dias_atraso !== 1 ? 's' : ''} de atraso. Mora: S/ {totalMora.toFixed(2)}</span>
          </div>
        )}

        <div className="space-y-3">
          {devolucion.items.map((item, idx) => {
            const est = estados[idx] || 'bien';
            const esGranel = item.id_item_granel;
            return (
              <div key={idx} className="rounded-xl border p-4 text-xs space-y-2"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                {/* Header del ítem */}
                <div className="flex items-center gap-2">
                  {item.item_codigo && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
                      style={{ backgroundColor: 'oklch(0.93 0.04 240)', color: 'var(--info)' }}>
                      {item.item_codigo}
                    </span>
                  )}
                  {item.item_condicion && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: item.item_condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)', color: item.item_condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)' }}>
                      {item.item_condicion}
                    </span>
                  )}
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                  <span className="text-[11px]" style={{ color: 'var(--muted)' }}>x{item.cantidad}</span>
                  <span className="font-mono ml-auto text-[11px]" style={{ color: 'var(--muted)' }}>S/ {item.precio_dia_aplicado.toFixed(2)}/dia</span>
                </div>

                {/* Cantidad devuelta (granel) */}
                {esGranel && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--muted)' }}>Cantidad devuelta:</span>
                    <input type="number" min="1" max={item.cantidad}
                      value={cantidades[idx] ?? item.cantidad}
                      onChange={e => setCantidad(idx, e.target.value)}
                      className="w-16 h-7 px-1.5 rounded text-xs text-center border"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--faint)' }}>de {item.cantidad}</span>
                  </div>
                )}

                {/* Botones de estado */}
                <div className="flex gap-1.5">
                  {ESTADOS_OPCIONES.map(op => {
                    const sel = est === op.id;
                    const Icon = op.icon;
                    return (
                      <button key={op.id} onClick={() => setEstado(idx, op.id)}
                        className="flex items-center gap-1 flex-1 h-8 rounded-lg text-[11px] font-medium transition-all duration-150"
                        style={{
                          backgroundColor: sel ? op.bg : 'transparent',
                          color: sel ? op.ink : 'var(--muted)',
                          border: sel ? 'none' : '1px solid var(--border)',
                        }}>
                        <Icon size={12} /> {op.label}
                      </button>
                    );
                  })}
                </div>

                {/* Nota de observación */}
                {est === 'danado' && (
                  <div>
                    <textarea
                      placeholder="Describa el problema (ej: cable pelado, interruptor suelto)..."
                      rows={2}
                      value={notas[idx] || ''}
                      onChange={e => setNota(idx, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] border outline-none resize-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Resumen antes de confirmar */}
        {Object.keys(estados).length > 0 && (
          <div className="rounded-xl border p-3 text-xs space-y-1"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
            <p className="font-medium" style={{ color: 'var(--ink)' }}>Resumen</p>
            <p style={{ color: 'var(--muted)' }}>
              {devolucion.items.length - cuentaDanados - cuentaNoDevueltos} bien, {cuentaDanados} dañado{cuentaDanados !== 1 ? 's' : ''}{cuentaNoDevueltos > 0 ? `, ${cuentaNoDevueltos} no devuelto${cuentaNoDevueltos !== 1 ? 's' : ''}` : ''}
              {totalMora > 0 && <span> · Mora: <span style={{ color: 'var(--danger)' }}>S/ {totalMora.toFixed(2)}</span></span>}
            </p>
            {cuentaNoDevueltos > 0 && (
              <p className="flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={12} /> ATENCION: {cuentaNoDevueltos} item{cuentaNoDevueltos !== 1 ? 's' : ''} no devuelto{cuentaNoDevueltos !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button onClick={closeDialog}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
          style={{ color: 'var(--muted)' }}>Cancelar</button>
        <Button variant="primary" onClick={confirmar} className="text-sm">
          <CheckCircle2 size={14} /> Confirmar devolucion
        </Button>
      </div>
    </div>
  );
}
