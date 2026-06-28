# Design

## Theme

Light content + dark sidebar. La dueña opera en un mostrador bajo luz de taller. El contenido (contratos, tablas, formularios) se despliega sobre blanco puro para máxima legibilidad. La barra lateral es oscura — como una caja de herramientas de acero — anclando visualmente la aplicación y reduciendo la fatiga visual periférica.

Mood: "Caja de herramientas de acero bajo luz de taller — precisa, sólida, con destellos de cobre."

Color strategy: Committed. El cobre quemado actúa como primario en botones, enlaces activos y la tarjeta de marca del sidebar. El latón marca dinero, alertas y badges de estado.

## Color Palette

```css
:root {
  /* Content */
  --bg:       oklch(1.000 0.000 0);      /* pure white */
  --surface:  oklch(0.965 0.003 60);     /* warm card bg */
  --border:   oklch(0.888 0.004 60);     /* warm light border */
  --ink:      oklch(0.145 0.005 50);     /* near-black with warmth */
  --muted:    oklch(0.520 0.005 50);     /* secondary text */
  --faint:    oklch(0.780 0.003 60);     /* placeholder */

  /* Brand — cobre quemado */
  --primary:       oklch(0.530 0.135 55);
  --primary-hover: oklch(0.475 0.140 55);
  --primary-text:  oklch(0.980 0.000 0);

  /* Accent — latón */
  --accent:        oklch(0.620 0.130 80);
  --accent-text:   oklch(0.980 0.000 0);

  /* Semantic */
  --success:  oklch(0.550 0.150 160);
  --warning:  oklch(0.650 0.140 75);
  --danger:   oklch(0.520 0.200 25);
  --info:     oklch(0.550 0.080 240);

  /* Sidebar (dark charcoal) */
  --sidebar-bg:     oklch(0.148 0.004 40);
  --sidebar-border: oklch(0.200 0.004 40);
  --sidebar-ink:    oklch(0.920 0.002 60);
  --sidebar-muted:  oklch(0.600 0.004 50);
  --sidebar-active: oklch(0.230 0.040 55);
  --sidebar-hover:  oklch(0.195 0.008 50);
}
```

## Typography

Single family: Inter (system-like, high legibility at small sizes). One weight scale covers headings, labels, body, and data.

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Scale (product register — fixed rem, not fluid):
- 0.75rem (12px) — captions, badges
- 0.875rem (14px) — body, labels, table cells
- 1rem (16px) — body emphasis, input text
- 1.125rem (18px) — section headings
- 1.25rem (20px) — page titles
- 1.5rem (24px) — main heading

## Components

- Buttons: 40-48px height for touch targets. Primary (filled red), secondary (outline), ghost (transparent).
- Inputs: 40px height, 1px border, 8px radius. Focus ring: 2px primary with 2px offset.
- Sidebar: 240px wide, collapsible to 64px (icons only). Active item has left accent bar + subtle bg tint.
- Tables: alternating row stripes (surface), hover highlight, density toggle.

## Motion

- Transitions: 150ms ease-out — fast enough to not interrupt flow.
- Sidebar collapse: 200ms ease-out.
- Page transitions: none (instant). Product loads into task.
- Reduced motion: all transitions become instant.
- Micro-interactions: button press (scale 0.97), focus ring pulse, notification count badge appear.

## Layout

- App shell: fixed sidebar left + scrollable content area right.
- Content max-width: none (full width, tables benefit from space).
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Grid: 12-column for dashboard/reports, flexbox for forms and lists.
