import { useState, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, Minus, Plus } from 'lucide-react';
import { useToast } from './Toast';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()];
};

const ESTADOS_OPC = [
  { id: 'bien', label: 'Bien', icon: CheckCircle, bg: 'oklch(0.50 0.13 155)', ink: '#fff' },
  { id: 'dañado', label: 'Dañado', icon: AlertTriangle, bg: 'oklch(0.55 0.13 70)', ink: '#fff' },
];

export default function DevolucionInline({ contrato, onClose, onRecargar }) {
  const toast = useToast();
  const [estados, setEstados] = useState({});
  const [notas, setNotas] = useState({});
  const [costosRep, setCostosRep] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [morasEditadas, setMoraEditadas] = useState({});
  const [editandoMora, setEditandoMora] = useState({});
  const [editandoCant, setEditandoCant] = useState({});
  const inputCantRefs = useRef({});
  const [mostrarPago, setMostrarPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [pagoMonto, setPagoMonto] = useState('');
  const [error, setError] = useState('');
  const [cobrando, setCobrando] = useState(false);

  const c = contrato;
  const items = c.items || [];
  const pagos = c.pagos || [];
  const totalPagado = c.total_pagado || 0;
  const garantia = c.garantia_retenida || 0;

  const dias = Math.max(1, Math.ceil(
    (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);
  const montoBase = c.total_contrato ? c.total_contrato : ((c.subtotal_diario || 0) * dias);
  
  // Sumar mora sugerida de todos los ítems (usando mora editada si existe)
  const montoAtraso = items.reduce((sum, item, idx) => {
    const cantidad = parseInt(cantidades[idx]) || item.cantidad || 1;
    const sugerida = (item.dias_atraso_item || 0) * (item.precio_dia_aplicado || 0) * cantidad;
    return sum + (morasEditadas[idx] != null ? morasEditadas[idx] : sugerida);
  }, 0);

  const totalDanos = Object.entries(costosRep).reduce((a, [idx, v]) => {
    if (estados[idx] === 'dañado' && v > 0) return a + parseFloat(v);
    return a;
  }, 0);

  const total = montoBase + montoAtraso + totalDanos + (c.deposito_monto || 0);
  const pendiente = Math.max(0, total - totalPagado);
  const montoCobrar = Math.max(0, pendiente - garantia);
  const montoDevolver = pendiente <= garantia ? Math.abs(pendiente - garantia) : 0;

  const setEstado = (idx, e) => setEstados(p => ({ ...p, [idx]: e }));
  const setNota = (idx, v) => setNotas(p => ({ ...p, [idx]: v }));
  const setCosto = (idx, v) => setCostosRep(p => ({ ...p, [idx]: v }));
  const setCantidad = (idx, v) => setCantidades(p => ({ ...p, [idx]: v }));
  const setMora = (idx, v) => setMoraEditadas(p => ({ ...p, [idx]: v }));

  const prepararItems = () => {
    const itemsDevueltos = [];
    const observaciones = {};
    Object.entries(estados).forEach(([idx, estado]) => {
      if (!estado) return;
      const item = items[idx];
      if (!item) return;
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

  const confirmar = async (conCobro, montoCobro) => {
    if (!window.api) return;
    setError('');

    const { itemsDevueltos, observaciones } = prepararItems();
    if (itemsDevueltos.length === 0) return setError('Seleccione al menos un ítem para devolver.');

    setCobrando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const resultado = await window.api.registrarDevolucion({
        idContrato: c.id,
        fechaDevolucionReal: hoy,
        itemsDevueltos,
        observaciones,
      });

      // Cobro opcional
      if (conCobro && montoCobro > 0) {
        await window.api.registrarPago({
          idContrato: c.id,
          monto: montoCobro,
          metodo: metodoPago,
        });
      }

      // Usar garantía si aplica
      if (conCobro && garantia > 0 && pendiente > 0) {
        const usarGarantia = Math.min(pendiente, garantia);
        if (usarGarantia > 0) {
          toast('Garantía aplicada: S/ ' + usarGarantia.toFixed(2));
        }
      }

      if (conCobro) toast('Devolución completada' + (montoCobro > 0 ? ' y cobrada' : ''));
      else toast('Devolución registrada (sin cobro)', 'warning');

      onClose();
      onRecargar();
    } catch (e) {
      setError(e.message || 'Error al registrar devolución.');
    } finally {
      setCobrando(false);
    }
  };

  const confirmarConPago = () => {
    const m = parseFloat(pagoMonto) || montoCobrar;
    if (m > montoCobrar + garantia + totalDanos) return setError('El monto excede lo debido.');
    confirmar(true, m);
  };

  return (
    <><style>{`
      .dev-nospin::-webkit-inner-spin-button,
      .dev-nospin::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      .dev-nospin { -moz-appearance: textfield !important; }
    `}</style>
    <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      {/* Encabezado con botón cancelar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--danger)' }}>Modo devolución</p>
        <button onClick={onClose}
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium transition-all duration-150"
          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}>
          <X size={12} /> Cancelar
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>{error}</div>
      )}
      
      <div className="grid grid-cols-[3fr_2fr] gap-0 min-h-0">
        {/* COLUMNA IZQUIERDA: Items en devolución */}
        <div className="px-4 py-2 space-y-3">
          {items.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>Sin ítems registrados</p>
          ) : (
            items.map((item, idx) => {
              const est = estados[idx] || null;
              const esGranel = !!item.id_item_granel;
              const fechaPactadaItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
              const diasItem = item.dias_item || 0;
              const baseItem = (item.precio_dia_aplicado || 0) * diasItem * (item.cantidad || 1);
              const moraCalc = (item.dias_atraso_item || 0) * (item.precio_dia_aplicado || 0) * (item.cantidad || 1);
              const moraActual = morasEditadas[idx] != null ? morasEditadas[idx] : moraCalc;
              return (
                <div key={idx}
                  className="rounded-lg border px-3 py-2 text-xs transition-all duration-150"
                  style={{
                    borderColor: est ? ESTADOS_OPC.find(o => o.id === est)?.bg + '60' : 'var(--border)',
                    backgroundColor: 'var(--surface)',
                  }}>
                  {/* Fila 1: Badge + nombre + atraso badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                      style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                      {esGranel ? 'x' + (item.cantidad || 1) : item.item_codigo || item.id}
                    </span>
                    <span className="font-medium text-[13px] truncate flex-1" style={{ color: 'var(--ink)' }}>{item.item_nombre || item.nombre}</span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--faint)' }}>
                      S/ {item.precio_dia_aplicado?.toFixed(2)}/día{esGranel ? ' c/u' : ''}
                    </span>
                    {(item.dias_atraso_item || 0) > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ backgroundColor: 'oklch(0.95 0.03 25)', color: 'var(--danger)' }}>
                        &#9888; +{item.dias_atraso_item} día{item.dias_atraso_item !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {/* Fila 2: Fechas del ítem */}
                  <div className="text-[10px] mb-1" style={{ color: 'var(--muted)' }}>
                    Salida: {fmtFecha(c.fecha_salida)} &middot; Pactada: {fmtFecha(fechaPactadaItem)}
                    <span style={{ color: 'var(--muted)' }}> &middot; Base: {diasItem} día{diasItem !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Fila 3: Cantidad para granel */}
                  {esGranel && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Devolver:</span>
                      <button onClick={() => setCantidad(idx, Math.max(0, (parseInt(cantidades[idx]) || item.cantidad) - 1))}
                        className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Minus size={10} /></button>
                      {editandoCant[idx] ? (
                        <input
                          ref={el => inputCantRefs.current[idx] = el}
                          type="number" min="0" max={item.cantidad}
                          defaultValue={cantidades[idx] ?? item.cantidad}
                          onBlur={e => {
                            const v = Math.max(0, Math.min(item.cantidad, parseInt(e.target.value) || item.cantidad));
                            setCantidad(idx, v);
                            setEditandoCant(p => ({ ...p, [idx]: false }));
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                          className="w-10 h-5 px-0.5 rounded text-xs text-center font-mono border dev-nospin"
                          style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                          autoFocus
                        />
                      ) : (
                        <span onClick={() => { setEditandoCant(p => ({ ...p, [idx]: true })); setTimeout(() => inputCantRefs.current[idx]?.select(), 60); }}
                          className="w-8 text-center font-mono text-xs font-semibold cursor-pointer px-0.5 rounded hover:bg-black/5"
                          style={{ color: 'var(--ink)' }}>{cantidades[idx] ?? item.cantidad}</span>
                      )}
                      <button onClick={() => setCantidad(idx, Math.min(item.cantidad, (parseInt(cantidades[idx]) || item.cantidad) + 1))}
                        className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--muted)' }}><Plus size={10} /></button>
                      <span className="text-[9px]" style={{ color: 'var(--faint)' }}>de {item.cantidad}</span>
                    </div>
                  )}
                  {/* Fila 4: Base + Mora + Total */}
                  <hr style={{ borderColor: 'var(--border)', marginTop: 2, marginBottom: 4 }} />
                  <div className="flex justify-between items-center">
                    <div className="flex items-baseline gap-3">
                      <span style={{ color: 'var(--muted)' }}>Base <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {baseItem.toFixed(2)}</span></span>
                      {item.dias_atraso_item > 0 && (
                        <span className="flex items-center gap-1">
                          <span style={{ color: 'var(--danger)' }}>Mora </span>
                          {editandoMora[idx] ? (
                            <input type="number" step="0.01" min="0"
                              defaultValue={moraCalc}
                              onBlur={e => { setMora(idx, parseFloat(e.target.value) || 0); setEditandoMora(p => ({ ...p, [idx]: false })); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                              className="w-20 h-6 px-1 rounded text-xs border font-mono text-right dev-nospin"
                              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--danger)' }}
                              autoFocus
                            />
                          ) : (
                            <span onClick={() => setEditandoMora(p => ({ ...p, [idx]: true }))}
                              className="font-mono cursor-pointer px-1 rounded hover:bg-black/5"
                              style={{ color: 'var(--danger)' }}>
                              S/ {moraActual.toFixed(2)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                        S/ {(baseItem + moraActual).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  {/* Fila 5: Botones de estado */}
                  <div className="flex gap-1 mt-2 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                    {ESTADOS_OPC.map(op => {
                      const sel = est === op.id;
                      return (
                        <button key={op.id} onClick={() => setEstado(idx, op.id === est ? null : op.id)}
                          className="flex items-center gap-1 px-2.5 h-7 rounded text-[10px] font-medium transition-all duration-150"
                          style={{
                            backgroundColor: sel ? op.bg : 'var(--bg)',
                            color: sel ? op.ink : 'var(--muted)',
                            border: sel ? 'none' : '0.5px solid var(--border)',
                          }}>
                          <op.icon size={11} /> {op.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Dañado: costo + nota */}
                  {est === 'dañado' && (
                    <div className="flex items-center gap-2 mt-1.5 pt-1.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>Costo reparación: S/</span>
                      <input type="number" step="0.01" min="0" value={costosRep[idx] ?? ''}
                        placeholder="0" onChange={e => setCosto(idx, e.target.value)}
                        className="w-16 h-6 px-1 rounded text-xs border text-center font-mono dev-nospin"
                        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
                      <input placeholder="Nota del daño..." value={notas[idx] || ''}
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

        {/* COLUMNA DERECHA: Caja en devolución */}
        <div className="px-4 py-2 space-y-3" style={{ borderLeft: '0.5px solid var(--border)' }}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)' }}>Cierre de devolución</p>
          
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Alquiler base</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
            </div>
            
            {/* Mora total (suma de moras por ítem) */}
            {montoAtraso > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--danger)' }}>Recargo por atraso</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>
                  + S/ {montoAtraso.toFixed(2)}
                </span>
              </div>
            )}
            
            {/* Daños */}
            {totalDanos > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>+ S/ {totalDanos.toFixed(2)}</span>
              </div>
            )}
            
            <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
            
            <div className="flex justify-between font-semibold">
              <span style={{ color: 'var(--ink)' }}>TOTAL</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Pagado</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {totalPagado.toFixed(2)}</span>
            </div>
            
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
            
            <div className="flex justify-between font-bold">
              <span style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
              <span className="font-mono tabular-nums" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                S/ {pendiente.toFixed(2)}
              </span>
            </div>
            
            {garantia > 0 && (
              <div className="flex justify-between text-[11px]">
                <span style={{ color: 'var(--muted)' }}>Garant&iacute;a disponible</span>
                <span className="font-mono" style={{ color: 'var(--info)' }}>S/ {garantia.toFixed(2)}</span>
              </div>
            )}
          </div>
          
          {/* Botones de acción */}
          <div className="space-y-2 pt-1">
            <button onClick={() => setMostrarPago(!mostrarPago)}
              disabled={cobrando || pendiente <= 0}
              className="w-full h-9 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { if (!cobrando) e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}>
              {pendiente <= 0 ? 'Sin deuda pendiente' : (mostrarPago ? 'Cancelar pago' : 'Cobrar y cerrar devolución')}
            </button>
            
            {mostrarPago && pendiente > 0 && (
              <div className="rounded-lg border p-2.5 text-xs space-y-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                <div className="flex gap-1">
                  {[
                    { id: 'efectivo', color: 'oklch(0.55 0.13 155)', label: 'Efectivo' },
                    { id: 'yape', color: 'oklch(0.48 0.14 330)', label: 'Yape' },
                    { id: 'plin', color: 'oklch(0.55 0.12 240)', label: 'Plin' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setMetodoPago(m.id)}
                      className="flex-1 h-7 rounded text-[10px] font-medium transition-all duration-150"
                      style={{
                        backgroundColor: metodoPago === m.id ? m.color : 'var(--bg)',
                        color: metodoPago === m.id ? '#fff' : 'var(--muted)',
                        border: metodoPago === m.id ? 'none' : '0.5px solid var(--border)',
                      }}>{m.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--muted)' }}>Recibido S/</span>
                  <input type="number" step="1" min="0" value={pagoMonto}
                    placeholder={montoCobrar.toFixed(0)}
                    onChange={e => setPagoMonto(e.target.value)}
                    className="w-24 h-7 px-1 rounded text-[11px] border font-mono text-center"
                    style={{
                      backgroundColor: 'var(--bg)',
                      color: 'var(--ink)',
                      borderColor: 'var(--border)',
                      MozAppearance: 'textfield',
                    }} />
                  <button onClick={confirmarConPago}
                    disabled={cobrando}
                    className="flex-1 h-7 rounded text-[11px] font-semibold transition-all duration-150 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--success)', color: '#fff', border: 'none' }}>
                    {cobrando ? 'Procesando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
            
            <button onClick={() => confirmar(false, 0)}
              disabled={cobrando}
              className="w-full h-7 rounded text-[10px] font-medium transition-all duration-150 disabled:opacity-40"
              style={{ backgroundColor: 'transparent', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              Solo registrar devolución (sin cobro)
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
