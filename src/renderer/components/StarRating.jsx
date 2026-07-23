import { useState } from 'react';
import { Star } from 'lucide-react';

/**
 * StarRating — reusable star rating component.
 *
 * @param {number}   value      Current rating value (can be fractional for display)
 * @param {function} onChange   Callback when user selects a star (interactive mode)
 * @param {boolean}  readonly  If true, display-only mode (no hover/click)
 * @param {number}   size      Icon size in px (default 20)
 * @param {boolean}  showLabel  Show numeric label next to stars
 * @param {string}   className  Extra CSS classes
 */
export default function StarRating({
  value = 0,
  onChange,
  readonly = false,
  size = 20,
  showLabel = false,
  className = '',
}) {
  const [hovered, setHovered] = useState(0);

  const displayValue = readonly ? value : (hovered || value);

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      onMouseLeave={() => !readonly && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = displayValue >= star;
        const halfFilled = !filled && displayValue >= star - 0.5;

        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            className="p-0 border-0 bg-transparent transition-transform duration-100"
            style={{
              cursor: readonly ? 'default' : 'pointer',
              transform: !readonly && hovered === star ? 'scale(1.2)' : 'scale(1)',
              lineHeight: 0,
            }}
            aria-label={`${star} estrella${star !== 1 ? 's' : ''}`}
          >
            <Star
              size={size}
              fill={filled ? 'oklch(0.72 0.17 80)' : halfFilled ? 'url(#halfGrad)' : 'none'}
              stroke={filled || halfFilled ? 'oklch(0.62 0.17 80)' : 'var(--faint)'}
              strokeWidth={1.5}
              style={{
                filter: filled ? 'drop-shadow(0 1px 2px oklch(0.72 0.17 80 / 0.3))' : 'none',
                transition: 'all 0.15s ease',
              }}
            />
          </button>
        );
      })}

      {showLabel && value > 0 && (
        <span
          className="text-xs font-semibold ml-1 tabular-nums"
          style={{ color: 'oklch(0.62 0.17 80)' }}
        >
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
      )}

      {/* SVG gradient definition for half-stars */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="halfGrad">
            <stop offset="50%" stopColor="oklch(0.72 0.17 80)" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/**
 * Badge de confiabilidad basado en promedio de estrellas.
 */
export function CalificacionBadge({ promedio, total }) {
  if (!promedio || total === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--faint)', border: '1px solid var(--border)' }}
      >
        Sin calificar
      </span>
    );
  }

  let label, bg, color;
  if (promedio >= 4.5) {
    label = 'Excelente'; bg = 'oklch(0.93 0.06 160)'; color = 'oklch(0.40 0.12 160)';
  } else if (promedio >= 3.5) {
    label = 'Bueno'; bg = 'oklch(0.93 0.04 240)'; color = 'oklch(0.45 0.10 240)';
  } else if (promedio >= 2.0) {
    label = 'Regular'; bg = 'oklch(0.93 0.05 80)'; color = 'oklch(0.50 0.13 80)';
  } else {
    label = 'Problemático'; bg = 'oklch(0.93 0.04 25)'; color = 'oklch(0.45 0.18 25)';
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      <Star size={9} fill={color} stroke="none" />
      {label}
    </span>
  );
}
