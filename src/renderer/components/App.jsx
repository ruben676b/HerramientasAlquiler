import { useState, useEffect } from 'react';

export default function App() {
  const [categorias, setCategorias] = useState([]);
  const [granel, setGranel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reparando, setReparando] = useState(null); // { id, cantidad } | null

  useEffect(() => {
    if (!window.api) {
      setError('API IPC no disponible. Ejecute la aplicación dentro de Electron.');
      setLoading(false);
      return;
    }

    async function cargarDatos() {
      try {
        const [cats, items] = await Promise.all([
          window.api.getCategorias(),
          window.api.getGranel(),
        ]);
        setCategorias(cats);
        setGranel(items);
      } catch (err) {
        setError('Error al cargar datos: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    cargarDatos();
  }, []);

  const handleReparar = async (id, cantidad) => {
    if (!cantidad || cantidad < 1) return;
    try {
      await window.api.repararGranel(id, cantidad);
      // Recargar datos
      const items = await window.api.getGranel();
      setGranel(items);
      setReparando(null);
    } catch (err) {
      alert('Error al reparar: ' + (err.message || err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-500 text-lg">Conectando con la base de datos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error de conexión</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">
        Sistema de Alquiler de Herramientas
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tabla de Categorías */}
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Categorías de Herramienta ({categorias.length})
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categorias.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-blue-700">{cat.id}</td>
                    <td className="px-4 py-2 text-gray-800">{cat.nombre}</td>
                    <td className="px-4 py-2 text-gray-500">{cat.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tabla de Ítems a Granel */}
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Ítems a Granel ({granel.length})
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Condición</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Precio/día</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Disp</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Alq</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Dañ</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Perd</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Vend</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Baja</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {granel.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">{item.nombre}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          item.condicion === 'nuevo'
                            ? 'text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-medium'
                            : 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium'
                        }
                      >
                        {item.condicion}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">
                      S/ {item.precio_dia.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{item.cantidad_disponible}</td>
                    <td className="px-4 py-2 text-right font-mono" style={{ color: (item.cantidad_alquilada || 0) > 0 ? '#2563eb' : '#9ca3af' }}>{item.cantidad_alquilada || 0}</td>
                    <td className="px-4 py-2 text-right">
                      {(item.cantidad_danada || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-red-600 font-mono">{item.cantidad_danada}</span>
                          {reparando === item.id ? (
                            <span className="inline-flex items-center gap-0.5">
                              <input type="number" min="1" max={item.cantidad_danada}
                                defaultValue={item.cantidad_danada}
                                className="w-12 h-5 px-0.5 rounded text-[10px] border text-center font-mono"
                                style={{ borderColor: '#d1d5db' }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const v = parseInt(e.target.value) || 0;
                                    handleReparar(item.id, v);
                                  }
                                  if (e.key === 'Escape') setReparando(null);
                                }} />
                              <button onClick={() => handleReparar(item.id, item.cantidad_danada)}
                                className="text-[10px] px-1.5 h-5 rounded font-medium"
                                style={{ backgroundColor: '#059669', color: '#fff' }}>Rep</button>
                            </span>
                          ) : (
                            <button onClick={() => setReparando(item.id)}
                              className="text-[10px] px-1.5 h-5 rounded font-medium"
                              style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              Reparar
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono" style={{ color: (item.cantidad_perdida || 0) > 0 ? '#dc2626' : '#9ca3af' }}>{item.cantidad_perdida || 0}</td>
                    <td className="px-4 py-2 text-right font-mono" style={{ color: (item.cantidad_vendida || 0) > 0 ? '#0891b2' : '#9ca3af' }}>{item.cantidad_vendida || 0}</td>
                    <td className="px-4 py-2 text-right font-mono" style={{ color: (item.cantidad_baja || 0) > 0 ? '#6b7280' : '#9ca3af' }}>{item.cantidad_baja || 0}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{item.cantidad_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Puente IPC verificado — datos cargados desde SQLite a través de contextBridge
      </p>
    </div>
  );
}
