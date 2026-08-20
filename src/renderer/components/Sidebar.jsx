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
  Trash2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSessions } from '../contexts/SessionsContext';
import PapeleraModal from './PapeleraModal';

const NAV_ITEMS = [
  { id: 'alquileres', label: 'Alquileres', icon: Store },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'caja', label: 'Caja', icon: DollarSign },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

const SHOP_NAME = 'Quispe';

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
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const { activeAlquileres, activeReservas, openDialog, isOpen, closeDialog } = useSessions();

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
          className="rounded-[14px] overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--sidebar-brand) 0%, oklch(from var(--sidebar-brand) calc(l - 0.03) c h) 100%)',
            border: '1px solid var(--sidebar-border)',
            boxShadow: '0 1px 3px oklch(0 0 0 / 0.04)',
          }}
        >
          <div
            className={cn(
              'flex items-center',
              collapsed ? 'justify-center py-3' : 'px-3.5 py-3.5 gap-3'
            )}
          >
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--primary)',
                boxShadow: '0 2px 6px oklch(from var(--primary) l c h / 0.3)',
              }}
            >
              <Wrench size={16} style={{ color: 'var(--primary-text)' }} strokeWidth={2.25} />
            </div>

            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 leading-tight">
                  <p
                    className="text-[9.5px] uppercase tracking-[0.18em] font-semibold"
                    style={{ color: 'var(--sidebar-muted)', opacity: 0.8 }}
                  >
                    Alquiler de Herramientas
                  </p>
                  <p
                    className="text-[14px] font-bold mt-0.5 tracking-tight"
                    style={{ color: 'var(--sidebar-ink)' }}
                  >
                    {SHOP_NAME}
                  </p>
                </div>

                <button
                  onClick={onToggle}
                  className="p-1.5 rounded-lg transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
                  style={{ color: 'var(--sidebar-muted)' }}
                  aria-label="Colapsar menú"
                >
                  <ChevronLeft size={14} />
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

      {/* ===== PAPELERA + THEME TOGGLE ===== */}
      <div className="shrink-0 px-2.5 pb-3 pt-1 space-y-1">
        <button
          onClick={() => setPapeleraAbierta(true)}
          className={cn(
            'w-full flex items-center rounded-[10px] text-[13px] font-medium',
            'transition-colors duration-150 hover:bg-[var(--sidebar-hover)] active:scale-95',
            collapsed ? 'justify-center h-10' : 'h-[38px] px-3 gap-3'
          )}
          style={{ color: 'var(--sidebar-muted)' }}
          title={collapsed ? 'Papelera' : undefined}
        >
          <Trash2 size={17} className="shrink-0" />
          {!collapsed && <span>Papelera</span>}
        </button>

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

      <PapeleraModal open={papeleraAbierta} onClose={() => setPapeleraAbierta(false)} />
    </aside>
  );
}
