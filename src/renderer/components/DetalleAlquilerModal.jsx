import { useState } from 'react';
import { X, Calendar, Package, CreditCard, Star, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import StarRating from './StarRating';

const ESTADO_STYLES = {
  'alquilado': { bg: 'oklch(0.93 0.04 240)', color: 'oklch(0.45 0.10 240)', label: 'Alquilado' },
  'reservado': { bg: 'oklch(0.93 0.04 280)', color: 'oklch(0.45 0.10 280)', label: 'Reservado' },
  'atrasado': { bg: 'oklch(0.93 0.04 25)', color: 'oklch(0.45 0.18 25)', label: 'Atrasado' },
  'devuelto': { bg: 'oklch(0.93 0.06 160)', color: 'oklch(0.40 0.12 160)', label: 'Devuelto' },
  'devolución incompleta': { bg: 'oklch(0.93 0.05 80)', color: 'oklch(0.50 0.13 80)', label: 'Dev. Incompleta' },
};

const DEVOLUCION_ICONS = {
  'bien': { icon: CheckCircle, color: 'oklch(0.50 0.13 155)' },
  'dañado': { icon: AlertTriangle, color: 'oklch(0.55 0.13 70)' },
  'no devuelto': { icon: XCircle, color: 'oklch(0.40 0 0)' },
  'pendiente': { icon: Clock, color: 'var(--muted)' },
};

export default function DetalleAlquilerModal({ contrato, onClose }) {
  if (!contrato) return null;

  const { contrato: c, items, pagos, calificacion, total_atraso, total_danos, total_perdidas, total_base, total_pagado, total_general } = contrato;
  const estadoStyle = ESTADO_STYLES[c.estado] || ESTADO_STYLES['alquilado'];

  const diasAlquiler = Math.max(1, Math.ceil(
    (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);

  const [editandoCalif, setEditandoCalif] = useState(false);
  const [editEstrellas, setEditEstrellas] = useState(calificacion?.estrellas || 0);
  const [editComentario, setEditComentario] = useState(calificacion?.comentario || '');
  const [guardandoCalif, setGuardandoCalif] = useState(false);
  const [califError, setCalifError] = useState('');

  const guardarCalificacion = async () => {
    if (editEstrellas === 0) { setCalifError('Seleccione al menos 1 estrella'); return; }
    if (!window.api) return;
    setGuardandoCalif(true);
    setCalifError('');
    try {
      await window.api.guardarCalificacion(c.id, editEstrellas, editComentario.trim());
      setEditandoCalif(false);
    } catch (e) {
      setCalifError(e.message || 'Error al guardar');
    } finally {
      setGuardandoCalif(false);
    }
  };

  const iniciarEdicion = () => {
    setEditEstrellas(calificacion?.estrellas || 0);
    setEditComentario(calificacion?.comentario || '');
    setEditandoCalif(true);
    setCalifError('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex" style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }} onClick={onClose}>
      <div
        className="m-auto w-[95vw] max-w-[700px] max-h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                Contrato #{c.id}
              </h2>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color }}
              >
                {estadoStyle.label}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {c.cliente_nombre} · DNI {c.cliente_dni || '—'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Fechas */}
          <div className="grid grid-cols-3 gap-3">
            <InfoCard icon={Calendar} label="Fecha salida" value={formatDate(c.fecha_salida)} />
            <InfoCard icon={Calendar} label="Devolución pactada" value={formatDate(c.fecha_devolucion_pactada)} />
            <InfoCard icon={Calendar} label="Devolución real" value={c.fecha_devolucion_real ? formatDate(c.fecha_devolucion_real) : '—'} />
          </div>

          {/* Items */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              <Package size={12} className="inline mr-1" style={{ verticalAlign: '-2px' }} />
              Herramientas / Items ({items.length})
            </h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface)' }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--muted)' }}>Item</th>
                    <th className="text-center px-2 py-2 font-medium" style={{ color: 'var(--muted)' }}>Cant.</th>
                    <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--muted)' }}>Precio/día</th>
                    <th className="text-center px-2 py-2 font-medium" style={{ color: 'var(--muted)' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const esGranel = !!item.id_item_granel;
                    const devStyle = !esGranel ? (DEVOLUCION_ICONS[item.estado_devolucion] || DEVOLUCION_ICONS['pendiente']) : null;
                    const DevIcon = devStyle?.icon;
                    return (
                      <tr key={idx} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {esGranel ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                style={{
                                  backgroundColor: item.item_condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                                  color: item.item_condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)',
                                }}>x{item.cantidad}</span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.5 rounded font-mono font-bold shrink-0"
                                style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                                {item.item_codigo}
                              </span>
                            )}
                            <span style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                          </div>
                        </td>
                        <td className="text-center px-2 py-2 font-mono" style={{ color: 'var(--ink)' }}>{item.cantidad}</td>
                        <td className="text-right px-2 py-2 font-mono" style={{ color: 'var(--ink)' }}>S/ {item.precio_dia_aplicado.toFixed(2)}</td>
                        <td className="text-center px-2 py-2">
                          {esGranel ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium flex-wrap justify-center">
                              {(item.granel_dev_bien || 0) > 0 && <span style={{ color: 'var(--success)' }}>{item.granel_dev_bien} bien</span>}
                              {(item.granel_dev_danada || 0) > 0 && <span style={{ color: 'oklch(0.55 0.13 70)' }}>{item.granel_dev_danada} dañ</span>}
                              {(item.granel_dev_perdida || 0) > 0 && <span style={{ color: 'var(--danger)' }}>{item.granel_dev_perdida} perd</span>}
                              {(item.granel_pendiente || 0) > 0
                                ? <span style={{ color: 'var(--muted)' }}>pend: {item.granel_pendiente}</span>
                                : <span className="font-medium" style={{ color: 'var(--success)' }}>Completo</span>
                              }
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                              <DevIcon size={11} style={{ color: devStyle.color }} />
                              <span style={{ color: devStyle.color }}>{item.estado_devolucion}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen financiero */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--muted)' }}>Financiero</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Base ({diasAlquiler} días)</span>
                  <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {total_base.toFixed(2)}</span>
                </div>
                {total_atraso > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--danger)' }}>Recargo por atraso</span>
                    <span className="font-mono" style={{ color: 'var(--danger)' }}>+ S/ {total_atraso.toFixed(2)}</span>
                  </div>
                )}
                {total_danos > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--warning)' }}>Cobro por daños</span>
                    <span className="font-mono" style={{ color: 'var(--warning)' }}>+ S/ {total_danos.toFixed(2)}</span>
                  </div>
                )}
                {total_perdidas > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--danger)' }}>Cobro por pérdidas</span>
                    <span className="font-mono" style={{ color: 'var(--danger)' }}>+ S/ {total_perdidas.toFixed(2)}</span>
                  </div>
                )}
                {c.deposito_monto > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Depósito</span>
                    <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {c.deposito_monto.toFixed(2)}</span>
                  </div>
                )}
                <hr style={{ borderColor: 'var(--border)', marginTop: 2, marginBottom: 2 }} />
                <div className="flex justify-between font-semibold">
                  <span style={{ color: 'var(--ink)' }}>Total</span>
                  <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {total_general.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="font-semibold" style={{ color: 'var(--success)' }}>Pagado</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--success)' }}>&minus; S/ {total_pagado.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Pagos */}
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                <CreditCard size={11} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
                Pagos ({pagos.length})
              </p>
              <div className="space-y-1 text-xs max-h-[100px] overflow-y-auto">
                {pagos.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--faint)' }}>Sin pagos registrados</p>
                ) : pagos.map((pago, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span style={{ color: 'var(--muted)' }}>
                      {pago.metodo} · {formatDate(pago.fecha_pago)}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--ink)' }}>S/ {pago.monto.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Calificación */}
          <div className="rounded-lg p-3" style={{ backgroundColor: 'oklch(0.97 0.02 80)', border: '1px solid oklch(0.90 0.04 80)' }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'oklch(0.50 0.13 80)' }}>
              <Star size={11} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
              Calificación del cliente
            </p>

            {editandoCalif ? (
              <div className="space-y-2">
                <div className="flex justify-center">
                  <StarRating value={editEstrellas} onChange={setEditEstrellas} size={22} />
                </div>
                {editEstrellas > 0 && (
                  <p className="text-[11px] text-center font-medium" style={{ color: 'oklch(0.50 0.13 80)' }}>
                    {['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'][editEstrellas]}
                  </p>
                )}
                <textarea
                  value={editComentario}
                  onChange={e => setEditComentario(e.target.value)}
                  placeholder="Comentario opcional..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs resize-none outline-none focus:ring-2"
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                />
                {califError && (
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>{califError}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setEditandoCalif(false)}
                    className="flex-1 h-7 rounded text-[10px] font-medium transition-all"
                    style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}>
                    Cancelar
                  </button>
                  <button onClick={guardarCalificacion} disabled={guardandoCalif}
                    className="flex-1 h-7 rounded text-[10px] font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: 'oklch(0.55 0.13 240)', color: '#fff', border: 'none' }}>
                    {guardandoCalif ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : calificacion ? (
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StarRating value={calificacion.estrellas} readonly size={16} />
                    <span className="text-xs font-semibold" style={{ color: 'oklch(0.50 0.13 80)' }}>
                      {calificacion.estrellas}/5
                    </span>
                  </div>
                  <button onClick={iniciarEdicion}
                    className="px-2 h-6 rounded text-[10px] font-medium transition-all"
                    style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}>
                    Editar
                  </button>
                </div>
                {calificacion.comentario && (
                  <p className="text-xs mt-1.5 italic" style={{ color: 'oklch(0.40 0.08 80)' }}>
                    "{calificacion.comentario}"
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>Aún no se ha calificado a este cliente</p>
                <button onClick={iniciarEdicion}
                  className="px-3 h-7 rounded-lg text-xs font-semibold transition-all active:scale-[0.97]"
                  style={{ backgroundColor: 'oklch(0.62 0.17 80 / 0.12)', color: 'oklch(0.52 0.17 80)', border: '0.5px solid oklch(0.62 0.17 80 / 0.3)' }}>
                  <Star size={11} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
                  Calificar
                </button>
              </div>
            )}
          </div>

          {/* Notas */}
          {c.notas && (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              <strong>Notas:</strong> {c.notas}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-medium mb-0.5 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
        <Icon size={10} /> {label}
      </p>
      <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
