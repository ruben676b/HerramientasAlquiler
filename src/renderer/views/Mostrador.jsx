import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Plus, Package, Wrench, Star, Info, Boxes, Eye } from 'lucide-react';
import { cn } from '../lib/utils';
import { localDate } from '../lib/date';
import Button from '../components/ui/button';
import StarRating, { CalificacionBadge } from '../components/StarRating';
import DetalleClienteModal from '../components/DetalleClienteModal';
import ImagenVisor from '../components/ImagenVisor';
import DatePicker from '../components/DatePicker';

/* ================================================================
   MOSTRADOR — Emitir Contrato
   ================================================================ */

function OjoButton({ activo, onClick, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!activo}
      title={activo ? (titulo || 'Ver imagen de referencia') : 'Este ítem no tiene imagen'}
      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border transition-all duration-150 active:scale-95 disabled:cursor-not-allowed"
      style={{
        color: activo ? 'var(--muted)' : 'var(--faint)',
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg)',
        opacity: activo ? 1 : 0.4,
      }}
    >
      <Eye size={15} />
    </button>
  );
}

export default function Mostrador() {
  // --- Cliente ---
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState(null);

  // --- Fechas ---
  const hoy = localDate();
  const manana = localDate(new Date(Date.now() + 86400000));
  const [fechaSalida, setFechaSalida] = useState(hoy);
  const [fechaDevolucion, setFechaDevolucion] = useState(manana);

  // --- Garantía ---
  const [depositoMonto, setDepositoMonto] = useState('');
  const [depositoDni, setDepositoDni] = useState(false);

  // --- Catálogo ---
  const [herramientas, setHerramientas] = useState([]);
  const [granelCat, setGranelCat] = useState([]);
  const [kitsCat, setKitsCat] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

  // --- Agregar ítem ---
  const [modoItem, setModoItem] = useState('individual');
  const [herrId, setHerrId] = useState('');
  const [buscarHerramienta, setBuscarHerramienta] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [granelId, setGranelId] = useState('');
  const [kitId, setKitId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [items, setItems] = useState([]);

  // --- Estado ---
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [visor, setVisor] = useState(null);

  // ================================================================
  // EFECTOS
  // ================================================================

  useEffect(() => {
    if (!window.api) return;
    (async () => {
      try {
        const [h, g, k] = await Promise.all([
          window.api.getHerramientasDisponibles(),
          window.api.getGranel(),
          window.api.getKits?.(),
        ]);
        setHerramientas(h);
        setGranelCat(g);
        setKitsCat(k || []);
      } catch (e) {
        setError('Error al cargar catálogo: ' + e.message);
      } finally {
        setCargandoCatalogo(false);
      }
    })();
  }, []);

  const buscar = useCallback(async (t) => {
    if (!window.api || t.length < 1) return setResultados([]);
    setBuscando(true);
    try {
      setResultados(await window.api.buscarClientes(t));
    } catch {
      /* silencioso */
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscar(termino), 300);
    return () => clearTimeout(t);
  }, [termino, buscar]);

  // ================================================================
  // CÁLCULOS
  // ================================================================

  const dias = Math.max(
    1,
    Math.ceil(
      (new Date(fechaDevolucion + 'T00:00:00') -
        new Date(fechaSalida + 'T00:00:00')) /
        (1000 * 60 * 60 * 24)
    ) + 1
  );

  const subtotalItems = items.reduce(
    (a, i) => a + i.precio_dia * dias * i.cantidad,
    0
  );
  const total = subtotalItems + (parseFloat(depositoMonto) || 0);

  // ================================================================
  // AGREGAR ÍTEM
  // ================================================================

  const agregar = () => {
    if (modoItem === 'individual') {
      if (!herrId) return;
      const h = herramientas.find((t) => t.id === herrId);
      if (!h) return;
      setItems((p) => [
        ...p,
        { tipo: 'individual', id_herramienta: h.id, nombre: h.nombre, precio_dia: h.precio_dia, cantidad: 1 },
      ]);
      setHerrId('');
    } else if (modoItem === 'granel') {
      const c = parseInt(cantidad, 10);
      if (!granelId || c < 1) return;
      const g = granelCat.find((t) => t.id === parseInt(granelId, 10));
      if (!g) return;
      if (c > g.cantidad_disponible) {
        setError('Stock insuficiente. Disponible: ' + g.cantidad_disponible);
        return;
      }
      setItems((p) => [
        ...p,
        { tipo: 'granel', id_item_granel: g.id, nombre: g.nombre, condicion: g.condicion, precio_dia: g.precio_dia, cantidad: c },
      ]);
      setGranelId('');
      setCantidad(1);
    } else if (modoItem === 'kit') {
      const c = parseInt(cantidad, 10);
      if (!kitId || c < 1) return;
      const k = kitsCat.find((t) => t.id === parseInt(kitId, 10));
      if (!k) return;
      if (c > k.disponibilidad) {
        setError('Stock insuficiente. Kits armables: ' + k.disponibilidad);
        return;
      }
      setItems((p) => [
        ...p,
        { tipo: 'kit', id_kit: k.id, nombre: k.nombre, precio_dia: k.precio_dia, cantidad: c },
      ]);
      setKitId('');
      setCantidad(1);
    }
  };

  const quitar = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

  // Ver imagen de un ítem ya agregado (resuelve la ruta bajo demanda)
  const verImagenItem = async (item) => {
    try {
      const tipo = item.tipo === 'individual' ? 'herramienta' : 'granel';
      const id = item.tipo === 'individual' ? item.id_herramienta : item.id_item_granel;
      if (id == null) return;
      const r = await window.api.getImagenItem(tipo, id);
      if (r?.ruta) {
        setVisor({ ruta: r.ruta, titulo: item.nombre });
      } else {
        setError(item.nombre + ' no tiene imagen de referencia.');
      }
    } catch (e) {
      setError('No se pudo cargar la imagen: ' + (e.message || e));
    }
  };

  // ================================================================
  // EMITIR
  // ================================================================

  const emitir = async () => {
    setError(null);
    setExito(null);
    if (!cliente) return setError('Seleccione un cliente.');
    if (!items.length) return setError('Agregue al menos un ítem.');
    if (fechaDevolucion && fechaSalida && fechaDevolucion < fechaSalida) return setError('La fecha de devolución no puede ser anterior a la fecha de salida.');
    if (!window.api) return setError('API no disponible.');

    setEnviando(true);
    try {
      const r = await window.api.crearContrato({
        idCliente: cliente.id,
        idUsuario: 1,
        fechaSalida,
        fechaDevolucionPactada: fechaDevolucion,
        depositoMonto: parseFloat(depositoMonto) || 0,
        depositoDni: depositoDni ? 1 : 0,
        items: items.map((i) => ({
          tipo_item: i.tipo,
          id_herramienta: i.id_herramienta || undefined,
          id_item_granel: i.id_item_granel || undefined,
          id_kit: i.id_kit || undefined,
          cantidad: i.cantidad || 1,
        })),
      });

      setExito('Contrato #' + r.idContrato + ' emitido. Total: S/ ' + total.toFixed(2));
      window.dispatchEvent(new CustomEvent('contrato-creado'));

      // Reset
      setCliente(null);
      setTermino('');
      setResultados([]);
      setItems([]);
      setDepositoMonto('');
      setDepositoDni(false);
      setFechaSalida(hoy);
      setFechaDevolucion(manana);

      // Recargar catálogo
      const [h, g] = await Promise.all([window.api.getHerramientasDisponibles(), window.api.getGranel()]);
      setHerramientas(h);
      setGranelCat(g);
    } catch (e) {
      setError(e.message || 'Error al emitir contrato.');
    } finally {
      setEnviando(false);
    }
  };

  // ================================================================
  // RENDER
  // ================================================================

  const inputCls =
    'w-full h-10 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';
  const labelCls = 'block text-xs font-medium mb-1.5';

  // Selecciones actuales (para habilitar el ojo según tengan imagen)
  const herrSel = herramientas.find((h) => h.id === herrId);
  const herramientasFiltradas = useMemo(() => {
    if (!buscarHerramienta) return [];
    const q = buscarHerramienta.toLowerCase();
    const rank = (h) => {
      const name = (h.nombre || '').toLowerCase();
      const id = (h.id || '').toLowerCase();
      const idSinGuion = id.replace('-', '');
      if (name.startsWith(q)) return 0;
      if (id.startsWith(q)) return 1;
      if (idSinGuion.startsWith(q)) return 2;
      if (name.includes(q)) return 3;
      if (id.includes(q)) return 4;
      return 5;
    };
    return herramientas
      .filter(h => rank(h) < 5)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 20);
  }, [buscarHerramienta, herramientas]);
  const granelSel = granelCat.find((g) => g.id === parseInt(granelId, 10));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
            Emitir Contrato
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Registre un nuevo alquiler de herramientas y materiales
          </p>
        </div>
      </div>

      {/* ===== MENSAJES ===== */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm flex items-start gap-2"
          style={{
            backgroundColor: 'oklch(0.94 0.02 25)',
            color: 'var(--danger)',
          }}
        >
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}
      {exito && (
        <div
          className="px-4 py-3 rounded-lg text-sm flex items-start gap-2"
          style={{
            backgroundColor: 'oklch(0.94 0.03 160)',
            color: 'var(--success)',
          }}
        >
          <span className="flex-1">{exito}</span>
          <button onClick={() => setExito(null)} className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ===== GRID PRINCIPAL ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* COLUMNA IZQUIERDA: Cliente + Fechas */}
        <div className="lg:col-span-2 space-y-5">
          {/* --- CLIENTE --- */}
          <section
            className="rounded-xl p-5"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--muted)' }}
            >
              Cliente
            </h2>

            {!cliente ? (
              <>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--faint)' }}
                  />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o DNI..."
                    value={termino}
                    onChange={(e) => setTermino(e.target.value)}
                    className={cn(inputCls, 'pl-9')}
                    style={{
                      backgroundColor: 'var(--bg)',
                      color: 'var(--ink)',
                      borderColor: 'var(--border)',
                    }}
                  />
                </div>
                {buscando && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--faint)' }}>
                    Buscando...
                  </p>
                )}
                {resultados.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                    {resultados.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setCliente(c);
                          setTermino('');
                          setResultados([]);
                        }}
                        className={cn(
                          'px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-150 text-sm',
                          c.en_lista_negra && 'border border-red-200 dark:border-red-800'
                        )}
                        style={{
                          backgroundColor: c.en_lista_negra
                            ? 'oklch(0.95 0.02 25)'
                            : 'var(--bg)',
                          color: 'var(--ink)',
                        }}
                        onMouseEnter={(e) => {
                          if (!c.en_lista_negra) e.currentTarget.style.backgroundColor = 'var(--surface)';
                        }}
                        onMouseLeave={(e) => {
                          if (!c.en_lista_negra) e.currentTarget.style.backgroundColor = 'var(--bg)';
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{c.nombre}</span>
                          {c.en_lista_negra && (
                            <span className="text-[11px] font-bold" style={{ color: 'var(--danger)' }}>
                              LISTA NEGRA
                            </span>
                          )}
                        </div>
                        {c.dni && (
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>
                            DNI: {c.dni}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {termino.length >= 1 && !buscando && resultados.length === 0 && (
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    Sin resultados. Registre el cliente en la sección Clientes.
                  </p>
                )}
              </>
            ) : (
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {cliente.nombre}
                  </p>
                  {cliente.dni && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      DNI: {cliente.dni}
                    </p>
                  )}
                  {cliente.en_lista_negra ? (
                    <span className="text-[11px] font-bold" style={{ color: 'var(--danger)' }}>
                      ⚠ LISTA NEGRA
                    </span>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1.5">
                    <CalificacionBadge
                      promedio={cliente.promedio_estrellas}
                      total={cliente.total_calificaciones}
                    />
                    {cliente.promedio_estrellas && (
                      <StarRating value={cliente.promedio_estrellas} readonly size={11} />
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--faint)' }}>
                      {cliente.total_alquileres || 0} alquiler{cliente.total_alquileres !== 1 ? 'es' : ''}
                    </span>
                    <button
                      onClick={() => setDetalleCliente(cliente)}
                      className="p-1 rounded-md hover:bg-[var(--surface)] transition-colors ml-0.5"
                      style={{ color: 'var(--faint)' }}
                      title="Ver detalle del cliente"
                    >
                      <Info size={13} />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setCliente(null); setTermino(''); }}
                  className="text-xs underline hover:opacity-70"
                  style={{ color: 'var(--muted)' }}
                >
                  Cambiar
                </button>
              </div>
            )}
          </section>

          {/* --- FECHAS Y GARANTÍA --- */}
          <section
            className="rounded-xl p-5"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--muted)' }}
            >
              Fechas y Garantía
            </h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Fecha de salida
                </label>
                <DatePicker amplio value={fechaSalida} onChange={setFechaSalida} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Devolución pactada
                </label>
                <DatePicker amplio value={fechaDevolucion} onChange={setFechaDevolucion} min={fechaSalida} error={fechaDevolucion && fechaDevolucion < fechaSalida} />
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {dias} día{dias !== 1 ? 's' : ''} de alquiler
              </p>

              <hr style={{ borderColor: 'var(--border)' }} />

              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Depósito en efectivo (S/)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositoMonto}
                  onChange={(e) => setDepositoMonto(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={depositoDni}
                  onChange={(e) => setDepositoDni(e.target.checked)}
                  className="rounded"
                />
                Retención física del DNI
              </label>
            </div>
          </section>
        </div>

        {/* COLUMNA DERECHA: Ítems + Total */}
        <div className="lg:col-span-3 space-y-5">
          {/* --- AGREGAR ÍTEMS --- */}
          <section
            className="rounded-xl p-5"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--muted)' }}
            >
              Agregar Ítems
            </h2>

            {/* Tabs */}
            <div className="flex gap-0.5 mb-4 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <button
                onClick={() => setModoItem('individual')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors duration-150',
                )}
                style={{
                  backgroundColor: modoItem === 'individual' ? 'var(--primary)' : 'transparent',
                  color: modoItem === 'individual' ? 'var(--primary-text)' : 'var(--muted)',
                }}
              >
                <Wrench size={14} /> Herramienta
              </button>
              <button
                onClick={() => setModoItem('granel')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors duration-150',
                )}
                style={{
                  backgroundColor: modoItem === 'granel' ? 'var(--primary)' : 'transparent',
                  color: modoItem === 'granel' ? 'var(--primary-text)' : 'var(--muted)',
                }}
              >
                <Package size={14} /> Material
              </button>
              <button
                onClick={() => setModoItem('kit')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors duration-150',
                )}
                style={{
                  backgroundColor: modoItem === 'kit' ? 'var(--primary)' : 'transparent',
                  color: modoItem === 'kit' ? 'var(--primary-text)' : 'var(--muted)',
                }}
              >
                <Boxes size={14} /> Kit
              </button>
            </div>

            {/* Selector */}
            {modoItem === 'individual' ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Herramienta disponible
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={herrId ? herramientas.find(h => h.id === herrId)?.nombre || 'Seleccionada' : 'Buscar por nombre o código...'}
                      value={buscarHerramienta}
                      onChange={(e) => { setBuscarHerramienta(e.target.value); setHerrId(''); setMostrarSugerencias(true); }}
                      onFocus={() => setMostrarSugerencias(true)}
                      onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                      className={cn(inputCls, 'pr-8')}
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                    />
                    {buscarHerramienta && (
                      <button onClick={() => { setBuscarHerramienta(''); setHerrId(''); setMostrarSugerencias(false); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {buscarHerramienta && herramientasFiltradas.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>Sin coincidencias.</p>
                  )}
                  {mostrarSugerencias && buscarHerramienta && herramientasFiltradas.length > 0 && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-md border shadow-lg max-h-48 overflow-y-auto"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}>
                      {herramientasFiltradas.slice(0, 12).map(h => (
                        <button key={h.id}
                          onMouseDown={() => { setHerrId(h.id); setBuscarHerramienta(''); setMostrarSugerencias(false); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface)] flex justify-between items-center"
                          style={{ color: 'var(--ink)' }}>
                          <span><span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>{h.id}</span> — {h.nombre}</span>
                          <span className="font-mono shrink-0 ml-2" style={{ color: 'var(--muted)' }}>S/ {h.precio_dia.toFixed(2)}/día</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!cargandoCatalogo && herramientas.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>No hay herramientas disponibles.</p>
                  )}
                </div>
                <OjoButton
                  activo={!!herrSel?.imagen_path}
                  onClick={() => setVisor({ ruta: herrSel.imagen_path, titulo: herrSel.id + ' — ' + herrSel.nombre })}
                />
                <Button
                  variant="secondary"
                  onClick={agregar}
                  disabled={!herrId}
                  className="h-10 px-4 text-sm shrink-0"
                >
                  <Plus size={15} className="mr-1" /> Agregar
                </Button>
              </div>
            ) : modoItem === 'granel' ? (
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Material
                  </label>
                  <select
                    value={granelId}
                    onChange={(e) => setGranelId(e.target.value)}
                    className={inputCls}
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                  >
                    <option value="">Seleccionar material...</option>
                    {granelCat.map((g) => (
                      <option key={g.id} value={g.id}
                        disabled={g.cantidad_disponible === 0}
                        style={g.cantidad_disponible === 0 ? { color: 'var(--danger)', backgroundColor: 'oklch(0.96 0.04 20)' } : {}}>
                        {g.cantidad_disponible > 0
                          ? `${g.nombre} (${g.condicion}) — S/ ${g.precio_dia.toFixed(2)}/día — ${g.cantidad_disponible} disp.`
                          : `${g.nombre} (${g.condicion}) — sin stock`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Cant.
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className={inputCls}
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                  />
                </div>
                <OjoButton
                  activo={!!granelSel?.imagen_path}
                  onClick={() => setVisor({ ruta: granelSel.imagen_path, titulo: granelSel.nombre + ' (' + granelSel.condicion + ')' })}
                />
                <Button
                  variant="secondary"
                  onClick={agregar}
                  disabled={!granelId || cantidad < 1}
                  className="h-10 px-4 text-sm shrink-0"
                >
                  <Plus size={15} className="mr-1" /> Agregar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Kit
                  </label>
                  <select
                    value={kitId}
                    onChange={(e) => setKitId(e.target.value)}
                    className={inputCls}
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                  >
                    <option value="">Seleccionar kit...</option>
                    {kitsCat.map((k) => (
                      <option key={k.id} value={k.id}
                        disabled={k.disponibilidad === 0}
                        style={k.disponibilidad === 0 ? { color: 'var(--danger)', backgroundColor: 'oklch(0.96 0.04 20)' } : {}}>
                        {k.disponibilidad > 0
                          ? `${k.nombre} — S/ ${k.precio_dia.toFixed(2)}/día — ${k.disponibilidad} armables`
                          : `${k.nombre} — sin stock`}
                      </option>
                    ))}
                  </select>
                  {!cargandoCatalogo && kitsCat.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                      No hay kits configurados.
                    </p>
                  )}
                </div>
                <div className="w-20">
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Cant.
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className={inputCls}
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={agregar}
                  disabled={!kitId || cantidad < 1}
                  className="h-10 px-4 text-sm shrink-0"
                >
                  <Plus size={15} className="mr-1" /> Agregar
                </Button>
              </div>
            )}
          </section>

          {/* --- LISTA DE ÍTEMS --- */}
          <section
            className="rounded-xl overflow-hidden"
            style={{
              border: '1px solid var(--border)',
            }}
          >
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Package size={32} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No hay ítems en el contrato
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>
                  Use los selectores superiores para agregar herramientas o materiales
                </p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: 'var(--surface)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--muted)' }}>
                        Ítem
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--muted)' }}>
                        Cant.
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--muted)' }}>
                        Precio/día
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--muted)' }}>
                        Subtotal
                      </th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const sub = item.precio_dia * dias * item.cantidad;
                      return (
                        <tr
                          key={idx}
                          style={{ borderBottom: '1px solid var(--border)' }}
                          className="transition-colors duration-150 hover:bg-[var(--surface)]"
                        >
                          <td className="px-4 py-3" style={{ color: 'var(--ink)' }}>
                            <div className="flex items-center gap-2">
                              {item.tipo === 'individual' ? (
                                <Wrench size={13} style={{ color: 'var(--muted)' }} />
                              ) : item.tipo === 'kit' ? (
                                <Boxes size={13} style={{ color: 'var(--muted)' }} />
                              ) : (
                                <Package size={13} style={{ color: 'var(--muted)' }} />
                              )}
                              <span>
                                {item.tipo === 'individual'
                                  ? item.id_herramienta + ' — ' + item.nombre
                                  : item.tipo === 'kit'
                                  ? item.nombre
                                  : item.nombre + ' (' + item.condicion + ')'}
                              </span>
                              {(item.tipo === 'individual' || item.tipo === 'granel') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); verImagenItem(item); }}
                                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150 shrink-0"
                                  style={{ color: 'var(--faint)' }}
                                  title="Ver imagen de referencia"
                                >
                                  <Eye size={12} />
                                </button>
                              )}
                            </div>
                            {item.tipo === 'kit' && (() => {
                              const comps = kitsCat.find(k => k.id === item.id_kit)?.componentes || [];
                              if (comps.length === 0) return null;
                              return (
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--faint)' }}>
                                  {comps.map(c => (c.cantidad * (item.cantidad || 1)) + '× ' + c.nombre).join(' · ')}
                                </p>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center" style={{ color: 'var(--muted)' }}>
                            {item.cantidad}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--muted)' }}>
                            S/ {item.precio_dia.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium" style={{ color: 'var(--ink)' }}>
                            S/ {sub.toFixed(2)}
                          </td>
                          <td className="px-2 py-3">
                            <button
                              onClick={() => quitar(idx)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors duration-150 active:scale-90"
                              style={{ color: 'var(--muted)' }}
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totales */}
                <div
                  className="px-5 py-3 space-y-1 border-t text-sm"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
                >
                  <div className="flex justify-between" style={{ color: 'var(--muted)' }}>
                    <span>Subtotal ({dias} día{dias !== 1 ? 's' : ''})</span>
                    <span className="font-mono">S/ {subtotalItems.toFixed(2)}</span>
                  </div>
                  {parseFloat(depositoMonto) > 0 && (
                    <div className="flex justify-between" style={{ color: 'var(--muted)' }}>
                      <span>Depósito</span>
                      <span className="font-mono">S/ {parseFloat(depositoMonto).toFixed(2)}</span>
                    </div>
                  )}
                  <div
                    className="flex justify-between font-bold text-base pt-1"
                    style={{ borderTop: '1px solid var(--border)', color: 'var(--ink)' }}
                  >
                    <span>Total</span>
                    <span className="font-mono">S/ {total.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Botón emitir */}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={emitir}
              disabled={enviando || items.length === 0 || !cliente}
              className="px-8 h-11 font-semibold"
            >
              {enviando ? 'Emitiendo...' : 'Emitir Contrato'}
            </Button>
          </div>
        </div>
      </div>

      {detalleCliente && (
        <DetalleClienteModal
          cliente={detalleCliente}
          onClose={() => setDetalleCliente(null)}
        />
      )}

      {visor && (
        <ImagenVisor
          ruta={visor.ruta}
          titulo={visor.titulo}
          onClose={() => setVisor(null)}
        />
      )}
    </div>
  );
}
