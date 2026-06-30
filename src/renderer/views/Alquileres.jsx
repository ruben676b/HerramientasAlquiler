import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, ChevronDown, Calendar, Clock, XCircle, X,
  CheckCircle, AlertTriangle, FileText, ArrowLeft, DollarSign,
} from 'lucide-react';
import { SEMANTIC } from '../lib/constants';
import Button from '../components/ui/button';
import { useSessions } from '../contexts/SessionsContext';
import { useDevoluciones } from '../contexts/DevolucionesContext';
import { useToast } from '../components/Toast';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
};

export default function Alquileres() {
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [error, setError] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
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
            const total = ((c.subtotal_diario || 0) * Math.max(1, Math.ceil(
              (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
            ))) + (c.deposito_monto || 0);

            let borderColor = 'var(--border)';
            if (c.estado === 'atrasado' || c.dias_atraso > 0) borderColor = 'var(--danger)';
            else if (c.estado === 'alquilado' || c.estado === 'reservado') borderColor = 'var(--success)';

            return (
              <div key={c.id} className="overflow-hidden"
                style={{ border: '0.5px solid var(--border)', borderLeft: '3px solid ' + borderColor }}>
                <button onClick={() => toggleExpand(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ backgroundColor: 'var(--bg)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</p>
                    <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
                      {c.cliente_dni && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-mono"
                          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>DNI {c.cliente_dni}</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[11px]"
                        style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                        {fmtFecha(c.fecha_salida)} a {fmtFecha(c.fecha_devolucion_pactada)}
                      </span>
                      {c.cliente_telefono ? (
                        <span className="px-1.5 py-0.5 rounded text-[11px]"
                          style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)' }}>
                          Tel. {c.cliente_telefono}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[11px]"
                          style={{ backgroundColor: 'var(--surface)', color: 'var(--faint)' }}>
                          Tel. no disponible
                        </span>
                      )}
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
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted)' }}>
                          Equipos y materiales
                        </p>
                        {c.items?.map((item, idx) => {
                          const esGranel = item.item_condicion;
                          const diasContrato = Math.max(1, Math.ceil(
                            (new Date(c.fecha_devolucion_pactada + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
                          ));
                          const sub = item.precio_dia_aplicado * diasContrato * item.cantidad;
                          return (
                            <div key={idx}>
                              {!esGranel ? (
                                <div className="flex items-start gap-2">
                                  <span className="w-[50px] shrink-0 flex justify-end">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold"
                                      style={{ backgroundColor: 'oklch(0.93 0.04 240)', color: 'var(--info)' }}>
                                      {item.item_codigo}
                                    </span>
                                  </span>
                                  <span className="flex-1 text-[13px]" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                                  <span className="font-mono shrink-0 text-[13px]" style={{ color: 'var(--ink)' }}>S/ {sub.toFixed(2)}</span>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-start gap-2">
                                    <span className="w-[50px] shrink-0 flex justify-end">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                        style={{
                                          backgroundColor: item.item_condicion === 'nuevo' ? 'oklch(0.93 0.05 160)' : 'oklch(0.93 0.04 75)',
                                          color: item.item_condicion === 'nuevo' ? 'var(--success)' : 'var(--warning)',
                                        }}>{item.item_condicion}</span>
                                    </span>
                                    <span className="flex-1 text-[13px]" style={{ color: 'var(--ink)' }}>{item.item_nombre}</span>
                                    <span className="font-mono shrink-0 text-[13px]" style={{ color: 'var(--ink)' }}>S/ {sub.toFixed(2)}</span>
                                  </div>
                                  <div className="flex gap-2 mt-0.5">
                                    <span className="w-[50px] shrink-0" />
                                    <span className="flex-1 text-[11px]" style={{ color: 'var(--faint)' }}>
                                      x{item.cantidad} - S/ {item.precio_dia_aplicado.toFixed(2)}/dia
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <hr style={{ borderColor: 'var(--border)', marginTop: 8, marginBottom: 6 }} />
                        <div className="flex justify-between items-baseline">
                          <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>Total</span>
                          <span className="font-mono font-bold text-base" style={{ color: 'var(--success)' }}>
                            S/ {total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 px-4 py-2.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                        {c.dias_atraso > 0 && (
                          <Button variant="secondary" size="sm" className="text-xs gap-1"
                            style={{ backgroundColor: 'oklch(0.95 0.015 25)', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                            <DollarSign size={13} /> Cobrar mora
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" className="text-xs gap-1"
                          onClick={async () => {
                            if (!window.api) return;
                            try {
                              const pdfPath = await window.api.generarContratoPdf(c.id);
                              const b64 = await window.api.leerArchivoBase64(pdfPath);
                              setPdfPreviewUrl('data:application/pdf;base64,' + b64);
                            } catch (e) {
                              toast('Error al abrir contrato', 'error');
                            }
                          }}>
                          <FileText size={13} /> Ver contrato
                        </Button>
                      <Button variant="primary" size="sm" className="text-xs gap-1"
                        onClick={() => openDevolucion(c)}>
                        <ArrowLeft size={13} /> Devolucion
                      </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
