import { useState, useEffect } from 'react';

export default function App() {
  const [categorias, setCategorias] = useState([]);
  const [granel, setGranel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Stock</th>
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
                    <td className="px-4 py-2 text-right text-gray-700">
                      {item.cantidad_disponible}/{item.cantidad_total}
                    </td>
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
