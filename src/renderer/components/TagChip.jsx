/**
 * TagChip — chip de etiqueta de cliente con punto de color.
 * El color se almacena como hue oklch (ej: '160' = verde) y se deriva
 * aquí el fondo y el texto con croma apagado para no resultar estridente.
 */

export const ETIQUETA_COLORS = ['160', '80', '25', '240', '280', '330', '20', '45'];

export function tagStyle(hue) {
  const h = String(hue || '160');
  return {
    bg: `oklch(0.93 0.05 ${h})`,
    color: `oklch(0.45 0.12 ${h})`,
    dot: `oklch(0.42 0.14 ${h})`,
  };
}

export default function TagChip({ tag, size = 'xs', style }) {
  const s = tagStyle(tag?.color);
  const fontSize = size === 'sm' ? 10 : 9;
  const dotSize = size === 'sm' ? 6 : 5;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap"
      title={tag?.nombre}
      style={{
        backgroundColor: s.bg,
        color: s.color,
        padding: size === 'sm' ? '3px 8px' : '1px 6px',
        fontSize,
        lineHeight: size === 'sm' ? '14px' : '13px',
        ...style,
      }}
    >
      <span
        className="rounded-full shrink-0"
        style={{ width: dotSize, height: dotSize, backgroundColor: s.dot }}
      />
      {tag?.nombre}
    </span>
  );
}
