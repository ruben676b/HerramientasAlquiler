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
  success: {
    bg: 'var(--success)',
    color: 'var(--primary-text)',
    border: 'transparent',
    hoverBg: 'color-mix(in srgb, var(--success), black 10%)',
  },
  info: {
    bg: 'var(--info)',
    color: 'var(--primary-text)',
    border: 'transparent',
    hoverBg: 'color-mix(in srgb, var(--info), black 10%)',
  },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  style,
  ...props
}) {
  const s = variants[variant] || variants.primary;
  const sizeCls = size === 'sm' ? 'h-8 px-3 text-xs rounded-lg' :
                   size === 'lg' ? 'h-11 px-6 text-sm rounded-xl' :
                   'h-10 px-4 text-sm rounded-lg';

  const inlineBg = style?.backgroundColor;
  const inlineColor = style?.color;
  const hoverBg = style?.['--hover-bg'] || s.hoverBg;
  const hoverColor = style?.['--hover-color'] || s.hoverColor;

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
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hoverBg;
        if (hoverColor) e.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = inlineBg || s.bg;
        if (hoverColor) e.currentTarget.style.color = inlineColor || s.color;
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
