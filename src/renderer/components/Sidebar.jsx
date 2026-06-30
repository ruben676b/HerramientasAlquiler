import { useState, useEffect } from 'react';
import {
  Store,
  Package,
  Users,
  DollarSign,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Sun,
  Moon,
  Layers,
  Settings,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSessions } from '../contexts/SessionsContext';
import { useDevoluciones } from '../contexts/DevolucionesContext';

const NAV_ITEMS = [
  { id: 'alquileres', label: 'Alquileres', icon: Store },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'caja', label: 'Caja', icon: DollarSign },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

const SHOP_NAME = 'Ferretería El Martillo';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('alquiler-theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('alquiler-theme', theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}

export default function Sidebar({ activeView, onNavigate, collapsed, onToggle }) {
  const [theme, toggleTheme] = useTheme();
  const { activeAlquileres, activeReservas, openDialog, isOpen, closeDialog } = useSessions();
  const { pendientes, openDialog: openDevoluciones, isOpen: isDevolOpen, closeDialog: closeDevoluciones } = useDevoluciones();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-30 select-none sidebar-grain',
        'transition-all duration-200'
      )}
      style={{
        width: collapsed ? 56 : 248,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
        transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      {/* ===== BRAND ===== */}
      <div className="shrink-0 px-2.5 pt-3 pb-2">
        <div
          className="rounded-[12px] overflow-hidden"
          style={{
            backgroundColor: 'var(--sidebar-brand)',
            border: '1px solid var(--sidebar-border)',
          }}
        >
          <div
            className={cn(
              'flex items-center',
              collapsed ? 'justify-center py-3' : 'px-3.5 py-3 gap-3'
            )}
          >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <Wrench size={15} style={{ color: 'var(--primary-text)' }} />
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p
                      className="text-[10px] uppercase tracking-[0.15em] font-medium"
                      style={{ color: 'var(--sidebar-muted)' }}
                    >
                      Sistema de Alquiler
                    </p>
                    <p
                      className="text-[13px] font-semibold mt-0.5"
                      style={{ color: 'var(--sidebar-ink)' }}
                    >
                      {SHOP_NAME}
                    </p>
                  </div>

                  <button
                    onClick={onToggle}
                    className="p-1 rounded-md transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
                    style={{ color: 'var(--sidebar-muted)' }}
                    aria-label="Colapsar menú"
                  >
                    <ChevronLeft size={15} />
                  </button>
                </>
              )}
            </div>
        </div>

        {collapsed && (
          <button
            onClick={onToggle}
            className="w-full flex justify-center py-1.5 mt-1 rounded-md transition-colors duration-150 hover:bg-[var(--sidebar-hover)] active:scale-95"
            style={{ color: 'var(--sidebar-muted)' }}
            aria-label="Expandir menú"
          >
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {/* ===== SESIONES ACTIVAS ===== */}
      {!collapsed && (
        <div className="shrink-0 px-2.5 pb-2">
          <button
            onClick={() => isOpen ? closeDialog() : openDialog('alquiler')}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-150 w-full"
            style={{
              border: '1.5px solid oklch(0.53 0.135 55 / 0.27)',
              backgroundColor: 'oklch(0.53 0.135 55 / 0.07)',
              color: 'oklch(0.53 0.135 55)',
            }}
          >
            <Users size={12} />
            <span className="flex-1 text-left">
              {activeAlquileres + activeReservas > 0
                ? `${activeAlquileres + activeReservas} cliente${activeAlquileres + activeReservas !== 1 ? 's' : ''}`
                : 'Clientes'}
            </span>
            <Layers size={11} style={{ opacity: 0.5 }} />
          </button>

          <button
            onClick={() => isDevolOpen ? closeDevoluciones() : openDevoluciones()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-150 w-full mt-1"
            style={{
              border: '1.5px solid oklch(0.55 0.08 240 / 0.27)',
              backgroundColor: 'oklch(0.55 0.08 240 / 0.07)',
              color: 'oklch(0.55 0.08 240)',
            }}
          >
            <RotateCcw size={12} />
            <span className="flex-1 text-left">
              {pendientes > 0
                ? `${pendientes} devolucion${pendientes !== 1 ? 'es' : ''}`
                : 'Devoluciones'}
            </span>
            <Layers size={11} style={{ opacity: 0.5 }} />
          </button>
        </div>
      )}

      {/* ===== NAVIGATION ===== */}
      <nav className="flex-1 py-2 px-2.5 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full flex items-center rounded-[10px] text-[13px] font-medium',
                'transition-[background-color,color] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1',
                collapsed ? 'justify-center h-10' : 'h-[42px] px-3 gap-3'
              )}
              style={{
                color: isActive ? 'var(--primary)' : 'var(--sidebar-muted)',
                backgroundColor: isActive
                  ? 'var(--sidebar-active)'
                  : 'transparent',
                outlineOffset: '1px',
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor =
                    'var(--sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={19}
                className="shrink-0"
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* ===== THEME TOGGLE ===== */}
      <div className="shrink-0 px-2.5 pb-3 pt-1">
        <button
          onClick={toggleTheme}
          className={cn(
            'w-full flex items-center rounded-[10px] text-[13px] font-medium',
            'transition-colors duration-150 hover:bg-[var(--sidebar-hover)] active:scale-95',
            collapsed ? 'justify-center h-10' : 'h-[38px] px-3 gap-3'
          )}
          style={{ color: 'var(--sidebar-muted)' }}
          title={
            collapsed
              ? theme === 'light'
                ? 'Modo oscuro'
                : 'Modo claro'
              : undefined
          }
        >
          {theme === 'light' ? (
            <Moon size={17} className="shrink-0" />
          ) : (
            <Sun size={17} className="shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
