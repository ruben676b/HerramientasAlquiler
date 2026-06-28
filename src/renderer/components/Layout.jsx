import { useState, useCallback, lazy, Suspense } from 'react';
import Sidebar from './Sidebar';
import MultiSessionModal from './MultiSessionModal';

const Alquileres = lazy(() => import('../views/Alquileres'));
const Mostrador = lazy(() => import('../views/Mostrador'));
const Inventario = lazy(() => import('../views/Inventario'));

const VIEWS = {
  alquileres: Alquileres,
  mostrador: Mostrador,
  inventario: Inventario,
  clientes: () => <Placeholder titulo="Clientes" />,
  caja: () => <Placeholder titulo="Caja" />,
  reportes: () => <Placeholder titulo="Reportes" />,
};

function Placeholder({ titulo }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{titulo}</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Módulo en desarrollo.</p>
    </div>
  );
}

export default function Layout() {
  const [activeView, setActiveView] = useState('alquileres');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const View = VIEWS[activeView] || VIEWS.mostrador;

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <main
        className="flex-1 overflow-y-auto transition-all duration-200"
        style={{
          marginLeft: sidebarCollapsed ? 56 : 248,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <Suspense fallback={<div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Cargando...</div>}>
          <View />
        </Suspense>
      </main>

      <MultiSessionModal />
    </div>
  );
}
