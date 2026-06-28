import { cn } from '@/lib/utils';

const variants = {
  primary: {
    bg: 'var(--primary)',
    color: 'var(--primary-text)',
    border: 'transparent',
    hoverBg: 'var(--primary-hover)',
  },
  secondary: {
    bg: 'transparent',
    color: 'var(--ink)',
    border: 'var(--border)',
    hoverBg: 'var(--surface)',
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--muted)',
    border: 'transparent',
    hoverBg: 'var(--surface)',
  },
  danger: {
    bg: 'transparent',
    color: 'var(--muted)',
    border: 'transparent',
    hoverBg: 'oklch(0.94 0.03 25)',
    hoverColor: 'var(--danger)',
  },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}) {
  const s = variants[variant] || variants.primary;
  const sizeCls = size === 'sm' ? 'h-8 px-3 text-xs rounded-lg' :
                   size === 'lg' ? 'h-11 px-6 text-sm rounded-xl' :
                   'h-10 px-4 text-sm rounded-lg';

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'active:scale-[0.97]',
        sizeCls,
        className
      )}
      style={{
        backgroundColor: s.bg,
        color: s.color,
        border: variant === 'ghost' || variant === 'danger' ? 'none' : `1px solid ${s.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = s.hoverBg;
        if (s.hoverColor) e.currentTarget.style.color = s.hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = s.bg;
        if (s.hoverColor) e.currentTarget.style.color = s.color;
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
