import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, ChevronDown, ChevronRight, Calendar, Clock,
  XCircle, X, CheckCircle, AlertTriangle, FileText, ArrowRight,
} from 'lucide-react';
import { SEMANTIC } from '../lib/constants';
import Button from '../components/ui/button';
import { useSessions } from '../contexts/SessionsContext';
import { useDevoluciones } from '../contexts/DevolucionesContext';
import { useToast } from '../components/Toast';
import PagoParcialModal from '../components/PagoParcialModal';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
};
const fmtFechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()];
};

export default function Alquileres() {
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [error, setError] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pagoModalContrato, setPagoModalContrato] = useState(null);
  const [historialAbierto, setHistorialAbierto] = useState(null);
  const searchRef = useRef(null);
  const { openDialog } = useSessions();
  const { openDialog: openDevolucion } = useDevoluciones();
  const toast = useToast();

  const cargar = async () => {
    if (!window.api) return;
    setCargando(true);
    try {
      const c = await window.api.getContratos({ busqueda, estado: estadoFiltro });
      setContratos(c);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const recargar = async () => {
    if (!window.api) return;
    try {
      const c = await window.api.getContratos({ busqueda, estado: estadoFiltro });
      setContratos(c);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { cargar(); }, [busqueda, estadoFiltro]);

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const conteo = useMemo(() => {
    const c = {};
    ['atrasado','alquilado','devuelto','devolucion incompleta'].forEach(e => {
      c[e] = contratos.filter(x => x.estado === e).length;
    });
    c[''] = contratos.length;
    return c;
  }, [contratos]);

  const atrasados = contratos.filter(c => c.estado === 'atrasado' || c.dias_atraso > 0);

  const toggleExpand = (id) => setExpandido(prev => prev === id ? null : id);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {atrasados.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
          style={{ backgroundColor: 'oklch(0.95 0.015 25)', color: 'var(--danger)', border: '0.5px solid var(--danger)' }}>
          <AlertTriangle size={15} />
          <span>{atrasados.length} alquiler{atrasados.length !== 1 ? 'es' : ''} con devolucion vencida</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium" style={{ color: 'var(--ink)' }}>Alquileres</h1>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" style={{ backgroundColor: 'var(--success)', border: 'none' }}
            onClick={() => openDialog('alquiler')}><Plus size={14} /> Alquilar</Button>
          <Button variant="primary" size="sm" style={{ backgroundColor: 'var(--info)', border: 'none' }}
            onClick={() => openDialog('reserva')}><Clock size={14} /> Reservar</Button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'oklch(0.94 0.02 25)', color: 'var(--danger)' }}>
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      <div className="relative max-w-[400px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input ref={searchRef} type="text" placeholder="Buscar por nombre, DNI o codigo..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="w-full h-9 pl-9 pr-8 rounded-lg text-[13px] border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
        {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5" style={{ color: 'var(--faint)' }}>x</button>}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {[
          { id: '', label: 'Todos' },
          { id: 'atrasado', label: 'Atrasado', danger: true },
          ...['alquilado','devuelto','devolucion incompleta']
            .filter(e => conteo[e] > 0)
            .map(e => ({ id: e, label: e === 'devolucion incompleta' ? 'Dev. incompleta' : e.charAt(0).toUpperCase() + e.slice(1) })),
        ].map(f => {
          const activo = estadoFiltro === f.id;
          return (
            <button key={f.id} onClick={() => setEstadoFiltro(f.id === estadoFiltro ? '' : f.id)}
              className="flex items-center gap-1 px-3 h-8 rounded-full text-xs font-medium transition-all duration-150"
              style={{
                backgroundColor: activo ? 'var(--ink)' : (f.danger ? 'oklch(0.95 0.015 25)' : 'var(--surface)'),
                color: activo ? 'var(--bg)' : (f.danger ? 'var(--danger)' : 'var(--muted)'),
                border: f.danger && !activo ? '0.5px solid var(--danger)' : '0.5px solid var(--border)',
              }}>
              {f.danger && <AlertTriangle size={11} />}
              {f.label}
              {f.id && <span style={{ opacity: 0.7 }}>{conteo[f.id] || 0}</span>}
            </button>
          );
        })}
      </div>

      {cargando ? (
        <p className="text-sm py-12 text-center" style={{ color: 'var(--muted)' }}>Cargando...</p>
      ) : contratos.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar size={36} className="mx-auto mb-3" style={{ color: 'var(--faint)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay alquileres</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contratos.map(c => {
            const isOpen = expandido === c.id;
            const dias = Math.max(1, Math.ceil(
              (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
            ) + 1);
            const montoBase = (c.subtotal_diario || 0) * dias;
            const montoAtraso = c.total_atraso || 0;
            const total = montoBase + montoAtraso + (c.deposito_monto || 0);
            const pagado = c.total_pagado || 0;
            const pendiente = Math.max(0, total - pagado);
            const pagos = c.pagos || [];

            let borderColor = 'var(--border)';
            if (c.estado === 'atrasado' || c.dias_atraso > 0) borderColor = 'var(--danger)';
            else if (c.estado === 'alquilado' || c.estado === 'reservado') borderColor = 'var(--success)';

            return (
              <div key={c.id} className="overflow-hidden"
                style={{ border: '0.5px solid var(--border)', borderLeft: '3px solid ' + borderColor }}>
                <button onClick={() => toggleExpand(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ backgroundColor: 'var(--bg)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</p>
                      {c.cliente_telefono && (
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--faint)' }}>{c.cliente_telefono}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
                      {c.cliente_dni && (
                        <span className="px-2 py-0.5 rounded-[10px] text-[11px] font-mono font-semibold"
                          style={{ backgroundColor: 'oklch(0.50 0.13 240)', color: '#fff' }}>
                          DNI {c.cliente_dni}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-[10px] text-[11px] font-semibold"
                        style={{ backgroundColor: 'oklch(0.53 0.135 55)', color: '#fff' }}>
                        {dias} d&iacute;a{dias !== 1 ? 's' : ''}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[11px]"
                        style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                        {fmtFechaCorta(c.fecha_salida)} &mdash; {fmtFecha(c.fecha_devolucion_pactada)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] text-[11px] font-medium"
                        style={{
                          backgroundColor: c.dias_atraso > 0 || c.estado === 'atrasado' ? 'oklch(0.95 0.015 25)' :
                            (c.estado === 'alquilado' || c.estado === 'reservado') ? 'oklch(0.93 0.05 160)' : 'var(--surface)',
                          color: c.dias_atraso > 0 || c.estado === 'atrasado' ? 'var(--danger)' :
                            (c.estado === 'alquilado' || c.estado === 'reservado') ? 'var(--success)' : 'var(--muted)',
                        }}>
                        {c.dias_atraso > 0 || c.estado === 'atrasado' ? (
                          <><AlertTriangle size={11} /> Atrasado {c.dias_atraso} dia{c.dias_atraso !== 1 ? 's' : ''}</>
                        ) : c.estado === 'alquilado' ? 'Alquilado' :
                          c.estado === 'reservado' ? 'Reservado' :
                          c.estado === 'devuelto' ? 'Devuelto' :
                          c.estado === 'devolucion incompleta' ? 'Dev. incompleta' : c.estado}
                      </span>
                    </div>
                  </div>
                  <span className="text-[15px] font-medium shrink-0" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
                  <ChevronDown size={16} className="shrink-0 transition-transform duration-200"
                    style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                </button>

                {/* ACORDEON CON ANIMACION GRID */}
                <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ borderTop: '0.5px solid var(--border)', backgroundColor: 'var(--surface)' }}>

                      {/* ===== FILA: EQUIPOS + CAJA ===== */}
                      <div className="grid grid-cols-[3fr_2fr] min-h-0">

                        {/* ===== COLUMNA IZQUIERDA: EQUIPOS ===== */}
                        <div className="px-4 py-3">
                          <p className="text-[11px] uppercase tracking-wider font-semibold pb-1.5 mb-3" 
                            style={{ color: 'var(--muted)', borderBottom: '1.5px solid oklch(0.50 0.11 240)' }}>
                            Equipos
                          </p>
                          {c.items?.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--faint)' }}>Sin equipos registrados</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                                Tarifa diaria total: S/ {(c.subtotal_diario || 0).toFixed(2)}
                              </p>
                              {c.items?.map((item, idx) => {
                                const esGranel = item.item_condicion;
                                const sub = item.precio_dia_aplicado * dias * item.cantidad;
                                return (
                                  <div key={idx} className="space-y-0.5">
                                    <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                      {!esGranel ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold text-center justify-self-end"
                                          style={{ backgroundColor: 'oklch(0.40 0.12 240)', color: '#fff' }}>
                                          {item.item_codigo}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-center justify-self-end"
                                          style={{
                                            backgroundColor: item.item_condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                                            color: item.item_condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)',
                                          }}>x{item.cantidad}</span>
                                      )}
                                      <span className="text-[13px] leading-tight font-semibold" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                                      <span className="font-mono tabular-nums text-[13px] text-right leading-tight font-semibold" style={{ color: 'var(--ink)' }}>
                                        S/ {sub.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                      <span />
                                      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                                        {esGranel ? item.item_condicion + ' \u00b7 ' : ''}S/ {item.precio_dia_aplicado.toFixed(2)}/d&iacute;a{esGranel ? ' c/u' : ''}
                                      </span>
                                    </div>
                                    {/* Estado del ítem — siempre visible */}
                                    <div className="grid grid-cols-[55px_1fr_auto] gap-x-2 items-start">
                                      <span />
                                      <span className="text-[11px] flex items-center gap-1" style={{
                                        color: item.dias_atraso_item > 0 ? 'var(--danger)' : (
                                          item.estado_devolucion !== 'pendiente' ? 'var(--success)' : 'var(--muted)'
                                        ),
                                      }}>
                                        {item.dias_atraso_item > 0 ? (
                                          <>&#9888; Atraso {item.dias_atraso_item} d&iacute;a{item.dias_atraso_item !== 1 ? 's' : ''} (+S/ {item.monto_atraso_item.toFixed(2)})</>
                                        ) : item.estado_devolucion !== 'pendiente' ? (
                                          <>&#10003; Devuelto a tiempo</>
                                        ) : (
                                          <>En plazo</>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* ===== COLUMNA DERECHA: CAJA ===== */}
                        <div className="px-4 py-3" style={{ borderLeft: '0.5px solid var(--border)' }}>
                          <p className="text-[11px] uppercase tracking-wider font-semibold pb-1.5 mb-3"
                            style={{ color: 'var(--muted)', borderBottom: '1.5px solid oklch(0.53 0.135 55)' }}>
                            Caja
                          </p>
                          <div className="space-y-1.5 mb-3">
                            {/* Alquiler base */}
                            <div className="flex justify-between items-baseline text-xs">
                              <span style={{ color: 'var(--muted)' }}>Alquiler base ({dias} d&iacute;a{dias !== 1 ? 's' : ''})</span>
                              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {montoBase.toFixed(2)}</span>
                            </div>
                            {/* Atraso */}
                            {montoAtraso > 0 && (
                              <div className="flex justify-between items-baseline text-xs">
                                <span style={{ color: 'var(--danger)' }}>Recargos por atraso</span>
                                <span className="font-mono tabular-nums" style={{ color: 'var(--danger)' }}>+ S/ {montoAtraso.toFixed(2)}</span>
                              </div>
                            )}
                            {/* Deposito */}
                            {(c.deposito_monto || 0) > 0 && (
                              <div className="flex justify-between items-baseline text-xs">
                                <span style={{ color: 'var(--muted)' }}>Dep&oacute;sito</span>
                                <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {(c.deposito_monto || 0).toFixed(2)}</span>
                              </div>
                            )}
                            {/* Divider */}
                            <hr style={{ borderColor: 'var(--border)', marginTop: 4, marginBottom: 2 }} />
                            {/* Total a pagar */}
                            <div className="flex justify-between items-baseline text-xs font-semibold">
                              <span style={{ color: 'var(--ink)' }}>Total a pagar</span>
                              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>S/ {total.toFixed(2)}</span>
                            </div>
                            {/* Pagado */}
                            <div className="flex justify-between items-baseline text-xs">
                              <span style={{ color: 'var(--muted)' }}>Pagado a la fecha</span>
                              <span className="font-mono tabular-nums" style={{ color: 'var(--success)' }}>&minus; S/ {pagado.toFixed(2)}</span>
                            </div>
                            {/* Thicker divider */}
                            <div style={{ borderTop: '2px solid var(--border)', marginTop: 2, marginBottom: 2 }} />
                            {/* SALDO PENDIENTE */}
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>SALDO PENDIENTE</span>
                              <span className="font-mono tabular-nums font-bold text-sm" style={{ color: pendiente > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                S/ {pendiente.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {pendiente > 0 && c.estado !== 'devuelto' && c.estado !== 'cancelado' && (
                            <div className="mb-3">
                              <button
                                onClick={() => setPagoModalContrato(c)}
                                className="w-full h-8 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] inline-flex items-center justify-center gap-1.5"
                                style={{
                                  backgroundColor: 'var(--success)',
                                  color: '#fff',
                                  border: 'none',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.42 0.14 155)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--success)'; }}
                              >
                                Pagar pendiente
                              </button>
                            </div>
                          )}
                          {/* Historial de pagos */}
                          <div className="rounded-lg mt-3" style={{ border: '0.5px solid var(--border)', backgroundColor: 'var(--bg)' }}>
                            <button
                              onClick={() => setHistorialAbierto(historialAbierto === c.id ? null : c.id)}
                              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:opacity-80 rounded-lg"
                              style={{ color: 'var(--muted)' }}>
                              <ChevronRight size={11}
                                style={{ transform: historialAbierto === c.id ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                              Historial de pagos{pagos.length > 0 ? ` (${pagos.length})` : ''}
                            </button>
                            {historialAbierto === c.id && (
                              <div className="px-2.5 pb-1.5 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
                                {pagos.length === 0 ? (
                                  <p className="pt-1.5 text-[11px]" style={{ color: 'var(--faint)' }}>Sin pagos registrados</p>
                                ) : (
                                  pagos.map((p, idx) => {
                                    const colorMetodo = p.metodo === 'efectivo' ? 'oklch(0.55 0.13 155)' :
                                      p.metodo === 'yape' ? 'oklch(0.48 0.14 330)' : 'oklch(0.55 0.12 240)';
                                    return (
                                      <div key={idx} className="flex items-center gap-2 pt-1.5 text-[11px]">
                                        <span className="shrink-0" style={{ color: 'var(--faint)' }}>{p.fecha_pago?.slice(5, 10) || '—'}</span>
                                        <span className="font-mono font-medium flex-1" style={{ color: 'var(--ink)' }}>
                                          S/ {p.monto.toFixed(2)}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded-[10px] text-[9px] font-medium capitalize"
                                          style={{ backgroundColor: colorMetodo + '20', color: colorMetodo }}>
                                          {p.metodo}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* ===== ACCIONES ===== */}
                      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                        <button
                          onClick={async () => {
                            if (!window.api) return;
                            try {
                              const pdfPath = await window.api.generarContratoPdf(c.id);
                              const b64 = await window.api.leerArchivoBase64(pdfPath);
                              setPdfPreviewUrl('data:application/pdf;base64,' + b64);
                            } catch (e) {
                              toast('Error al abrir contrato', 'error');
                            }
                          }}
                          className="flex-1 h-[34px] rounded-lg text-xs font-medium transition-all duration-150 inline-flex items-center justify-center gap-1.5"
                          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                        >
                          <FileText size={12} /> Ver contrato
                        </button>
                        <button
                          onClick={() => openDevolucion(c)}
                          className="flex-1 h-[34px] rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97]"
                          style={{ backgroundColor: 'oklch(0.53 0.135 55)', color: '#fff', border: 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.43 0.14 55)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'oklch(0.53 0.135 55)'; }}
                        >
                          {pendiente > 0 && <AlertTriangle size={12} />}
                          Devolucion{pendiente > 0 ? ' (con deuda)' : ''} <ArrowRight size={12} />
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagoModalContrato && (
        <PagoParcialModal
          contrato={pagoModalContrato}
          onClose={() => setPagoModalContrato(null)}
           onPagoRegistrado={() => { setPagoModalContrato(null); recargar(); }}
        />
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'oklch(0 0 0 / 0.6)' }} onClick={() => setPdfPreviewUrl(null)}>
          <div className="w-[95vw] h-[95vh] max-w-[1100px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--bg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Contrato</span>
              <button onClick={() => setPdfPreviewUrl(null)}
                className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--muted)' }}>
                <X size={16} />
              </button>
            </div>
            <embed src={pdfPreviewUrl} type="application/pdf" className="flex-1 w-full border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
