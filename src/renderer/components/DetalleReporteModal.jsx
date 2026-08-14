import { useState, useMemo } from 'react';
import {
  X, FileDown, ChevronDown, ChevronRight,
  Banknote, Smartphone, CreditCard, TrendingUp,
  ArrowUpRight, ArrowDownLeft, Receipt, ShoppingBag,
  User, Calendar, Hash
} from 'lucide-react';

const fmtMoneda = (v) => {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + 'S/ ' + Math.abs(n).toFixed(2);
};

const fmtFecha = (iso) => {
  if (!iso) return '-';
  const s = iso.includes(' ') ? iso.replace(' ', 'T') : iso;
  if (s.includes('T')) {
    const d = new Date(s);
    if (isNaN(d)) return iso;
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const METODO_ICONS = {
  efectivo: { icon: Banknote, color: 'oklch(0.55 0.15 160)' },
  yape: { icon: Smartphone, color: 'oklch(0.50 0.18 300)' },
  plin: { icon: CreditCard, color: 'oklch(0.55 0.12 200)' },
};

const TIPO_LABEL = {
  adelanto: 'Adelanto',
  saldo: 'Saldo',
  mora: 'Mora',
  deposito: 'Garantía',
  devolucion_deposito: 'Dev. Garantía',
};

export default function DetalleReporteModal({ reporte, onClose, onExportPDF }) {
  const [secciones, setSecciones] = useState({
    alquileres: true,
    ingresos: true,
    egresos: true,
  });
  const [detalleItem, setDetalleItem] = useState(null);

  const datos = reporte?.datos_json || {};
  const contratos = datos.contratos || [];
  const ventas = datos.ventas || [];
  const egresos = datos.egresos || [];

  const toggleSeccion = (s) => setSecciones(prev => ({ ...prev, [s]: !prev[s] }));

  if (!reporte) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto"
        style={{ backgroundColor: 'oklch(0 0 0 / 0.5)' }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-4xl rounded-2xl overflow-hidden mb-8"
          style={{
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            animation: 'slideUp 0.25s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
                Reporte #{reporte.id}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {fmtFecha(reporte.fecha_inicio)} — {fmtFecha(reporte.fecha_fin)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const ruta = await window.api.exportarReportePDF(reporte.id);
                    if (ruta) await window.api.abrirArchivo(ruta);
                  } catch (e) {
                    console.error('Error al exportar PDF:', e);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all duration-150"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--ink)',
                }}
              >
                <FileDown size={14} />
                Exportar PDF
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
            {/* Sección Alquileres */}
            <SeccionCollapsible
              titulo="Alquileres"
              count={contratos.length}
              abierto={secciones.alquileres}
              onToggle={() => toggleSeccion('alquileres')}
              icon={Receipt}
            >
              {contratos.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--faint)' }}>Sin alquileres en este período</p>
              ) : (
                <TablaAlquileres contratos={contratos} onVerDetalle={(c) => setDetalleItem({ tipo: 'alquiler', data: c })} />
              )}
            </SeccionCollapsible>

            {/* Sección Otros Ingresos */}
            <SeccionCollapsible
              titulo="Otros Ingresos"
              count={ventas.length}
              abierto={secciones.ingresos}
              onToggle={() => toggleSeccion('ingresos')}
              icon={ShoppingBag}
            >
              {ventas.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--faint)' }}>Sin ingresos en este período</p>
              ) : (
                <TablaVentas ventas={ventas} onVerDetalle={(v) => setDetalleItem({ tipo: 'venta', data: v })} />
              )}
            </SeccionCollapsible>

            {/* Sección Egresos */}
            <SeccionCollapsible
              titulo="Egresos"
              count={egresos.length}
              abierto={secciones.egresos}
              onToggle={() => toggleSeccion('egresos')}
              icon={ArrowDownLeft}
            >
              {egresos.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--faint)' }}>Sin egresos en este período</p>
              ) : (
                <TablaEgresos egresos={egresos} onVerDetalle={(e) => setDetalleItem({ tipo: 'egreso', data: e })} />
              )}
            </SeccionCollapsible>
          </div>

          {/* Footer: totales */}
          <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <ResumenTotales reporte={reporte} />
          </div>
        </div>
      </div>

      {/* Sub-modal de detalle */}
      {detalleItem && (
        <SubDetalleModal item={detalleItem} onClose={() => setDetalleItem(null)} />
      )}
    </>
  );
}

/* ================================================================
   SECCIÓN COLLAPSIBLE
   ================================================================ */
function SeccionCollapsible({ titulo, count, abierto, onToggle, icon: Icon, children }) {
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full py-2 px-1 rounded-lg hover:bg-[var(--surface)] transition-colors duration-150"
      >
        {abierto ? <ChevronDown size={16} style={{ color: 'var(--ink)' }} /> : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}
        <Icon size={15} style={{ color: 'var(--muted)' }} />
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{titulo}</span>
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--muted)',
          border: '1px solid var(--border)',
        }}>{count}</span>
      </button>
      {abierto && <div className="ml-7">{children}</div>}
    </div>
  );
}

/* ================================================================
   TABLA ALQUILERES
   ================================================================ */
function TablaAlquileres({ contratos, onVerDetalle }) {
  const headers = ['Cliente', 'F. Alquiler', 'F. Devolución', 'Pagos (Detalle)', 'Total'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contratos.map((c, i) => {
            const pagosStr = c.pagos.map(p =>
              `${p.tipo === 'devolucion_deposito' ? '-' : ''}${fmtMoneda(p.monto)} (${p.metodo})`
            ).join(', ');
            const total = c.pagos.reduce((a, p) =>
              a + (p.tipo === 'devolucion_deposito' ? -p.monto : p.monto), 0);

            return (
              <tr
                key={i}
                onClick={() => onVerDetalle(c)}
                className="cursor-pointer hover:bg-[var(--surface)] transition-colors duration-100"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{c.cliente_nombre}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{fmtFecha(c.fecha_salida)}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{fmtFecha(c.fecha_devolucion_real)}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pagosStr}</td>
                <td className="px-2 py-1.5 font-mono font-semibold text-right" style={{ color: total >= 0 ? 'var(--ink)' : 'var(--danger)' }}>{fmtMoneda(total)}</td>
              </tr>
            );
          })}
          {/* Fila de totales */}
          <tr style={{ borderTop: '2px solid var(--ink)' }}>
            <td colSpan={4} className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--ink)' }}>Total Alquileres</td>
            <td className="px-2 py-1.5 font-mono font-bold text-right" style={{ color: 'var(--ink)' }}>
              {fmtMoneda(contratos.reduce((a, c) =>
                a + c.pagos.reduce((b, p) => b + (p.tipo === 'devolucion_deposito' ? -p.monto : p.monto), 0)
              , 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   TABLA VENTAS
   ================================================================ */
function TablaVentas({ ventas, onVerDetalle }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Descripción', 'Fecha', 'Método', 'Cliente', 'Total'].map(h => (
              <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ventas.map((v, i) => (
            <tr key={i} onClick={() => onVerDetalle(v)}
              className="cursor-pointer hover:bg-[var(--surface)] transition-colors duration-100"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{v.nombre_item}</td>
              <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{fmtFecha(v.fecha)}</td>
              <td className="px-2 py-1.5 capitalize" style={{ color: 'var(--ink)' }}>{v.metodo}</td>
              <td className="px-2 py-1.5" style={{ color: 'var(--muted)' }}>{v.cliente_nombre || '-'}</td>
              <td className="px-2 py-1.5 font-mono font-semibold text-right" style={{ color: 'var(--ink)' }}>{fmtMoneda(v.total)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--ink)' }}>
            <td colSpan={4} className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--ink)' }}>Total Ingresos</td>
            <td className="px-2 py-1.5 font-mono font-bold text-right" style={{ color: 'var(--ink)' }}>
              {fmtMoneda(ventas.reduce((a, v) => a + v.total, 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   TABLA EGRESOS
   ================================================================ */
function TablaEgresos({ egresos, onVerDetalle }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Descripción', 'Fecha', 'Método', 'Pago', 'Total'].map(h => (
              <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {egresos.map((e, i) => (
            <tr key={i} onClick={() => onVerDetalle(e)}
              className="cursor-pointer hover:bg-[var(--surface)] transition-colors duration-100"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{e.descripcion}</td>
              <td className="px-2 py-1.5" style={{ color: 'var(--ink)' }}>{fmtFecha(e.fecha)}</td>
              <td className="px-2 py-1.5 capitalize" style={{ color: 'var(--ink)' }}>{e.metodo}</td>
              <td className="px-2 py-1.5" style={{ color: 'var(--muted)' }}>-</td>
              <td className="px-2 py-1.5 font-mono font-semibold text-right" style={{ color: 'var(--danger)' }}>-{fmtMoneda(e.monto)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--ink)' }}>
            <td colSpan={4} className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--ink)' }}>Total Egresos</td>
            <td className="px-2 py-1.5 font-mono font-bold text-right" style={{ color: 'var(--danger)' }}>
              -{fmtMoneda(egresos.reduce((a, e) => a + e.monto, 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   RESUMEN TOTALES
   ================================================================ */
function ResumenTotales({ reporte }) {
  const tt = reporte.totales_metodo || {};

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-8 flex-wrap">
        {['efectivo', 'yape', 'plin'].map(metodo => {
          const val = tt[metodo] || 0;
          const m = METODO_ICONS[metodo];
          const Icon = m?.icon || Banknote;
          return (
            <div key={metodo} className="flex items-center gap-2">
              <Icon size={14} style={{ color: m?.color }} />
              <span className="text-[12px] capitalize" style={{ color: 'var(--muted)' }}>{metodo}</span>
              <span className="text-[13px] font-mono font-bold" style={{ color: val >= 0 ? 'var(--ink)' : 'var(--danger)' }}>
                {fmtMoneda(val)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={15} style={{ color: 'var(--primary)' }} />
          <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>Ingresos Netos</span>
        </div>
        <span className="text-[15px] font-mono font-extrabold" style={{
          color: reporte.total_neto >= 0 ? 'oklch(0.55 0.15 160)' : 'var(--danger)',
        }}>
          {fmtMoneda(reporte.total_neto)}
        </span>
      </div>

      <p className="text-[10px]" style={{ color: 'var(--faint)' }}>
        Generado: {fmtFecha(reporte.fecha_generacion)} | Alquileres: {reporte.datos_json?.contratos?.length || 0} | Ingresos: {reporte.datos_json?.ventas?.length || 0} | Egresos: {reporte.datos_json?.egresos?.length || 0}
      </p>
    </div>
  );
}

/* ================================================================
   SUB-MODAL DE DETALLE INDIVIDUAL
   ================================================================ */
function SubDetalleModal({ item, onClose }) {
  const { tipo, data } = item;
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          animation: 'slideUp 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
            {tipo === 'alquiler' ? 'Detalle de Alquiler' : tipo === 'venta' ? 'Detalle de Ingreso' : 'Detalle de Egreso'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--surface)]" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3 text-[12px]">
          {tipo === 'alquiler' && (
            <>
              <FilaDetalle label="Cliente" value={data.cliente_nombre} icon={User} />
              <FilaDetalle label="DNI" value={data.cliente_dni || '-'} />
              <FilaDetalle label="F. Alquiler" value={fmtFecha(data.fecha_salida)} icon={Calendar} />
              <FilaDetalle label="F. Pactada" value={fmtFecha(data.fecha_devolucion_pactada)} />
              <FilaDetalle label="F. Devolución" value={fmtFecha(data.fecha_devolucion_real)} />
              <FilaDetalle label="Contrato #" value={String(data.id)} icon={Hash} />
              {data.items && data.items.length > 0 && (
                <div className="pt-1">
                  <span className="font-semibold" style={{ color: 'var(--muted)' }}>Ítems:</span>
                  <div className="mt-1 space-y-1">
                    {data.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-[11px] pl-2" style={{ color: 'var(--ink)', borderLeft: '2px solid var(--border)' }}>
                        <span>{it.nombre} ({it.tipo_item}) ×{it.cantidad}</span>
                        <span className="font-mono">{fmtMoneda(it.total_item_snapshot || it.precio_dia_aplicado * it.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-1">
                <span className="font-semibold" style={{ color: 'var(--muted)' }}>Pagos:</span>
                <div className="mt-1 space-y-0.5">
                  {data.pagos.map((p, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span style={{ color: 'var(--ink)' }}>
                        {TIPO_LABEL[p.tipo] || p.tipo}
                        <span className="capitalize ml-1" style={{ color: 'var(--muted)' }}>({p.metodo})</span>
                        <span className="ml-1" style={{ color: 'var(--faint)' }}>{fmtFecha(p.fecha_pago)}</span>
                      </span>
                      <span className="font-mono" style={{ color: p.tipo === 'devolucion_deposito' ? 'var(--danger)' : 'var(--ink)' }}>
                        {p.tipo === 'devolucion_deposito' ? '-' : ''}{fmtMoneda(p.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink)' }}>Total Pagado</span>
                <span className="font-mono" style={{ color: 'var(--ink)' }}>
                  {fmtMoneda(data.pagos.reduce((a, p) => a + (p.tipo === 'devolucion_deposito' ? -p.monto : p.monto), 0))}
                </span>
              </div>
            </>
          )}

          {tipo === 'venta' && (
            <>
              <FilaDetalle label="Ítem" value={data.nombre_item} icon={ShoppingBag} />
              <FilaDetalle label="Fecha" value={fmtFecha(data.fecha)} icon={Calendar} />
              <FilaDetalle label="Método" value={data.metodo} />
              <FilaDetalle label="Cliente" value={data.cliente_nombre || '-'} icon={User} />
              <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink)' }}>Total</span>
                <span className="font-mono" style={{ color: 'var(--ink)' }}>{fmtMoneda(data.total)}</span>
              </div>
            </>
          )}

          {tipo === 'egreso' && (
            <>
              <FilaDetalle label="Descripción" value={data.descripcion} icon={ArrowDownLeft} />
              <FilaDetalle label="Fecha" value={fmtFecha(data.fecha)} icon={Calendar} />
              <FilaDetalle label="Método" value={data.metodo} />
              <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink)' }}>Monto</span>
                <span className="font-mono" style={{ color: 'var(--danger)' }}>-{fmtMoneda(data.monto)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaDetalle({ label, value, icon: Icon }) {
  return (
    <div className="flex justify-between items-center">
      <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
        {Icon && <Icon size={12} />}
        {label}
      </span>
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
