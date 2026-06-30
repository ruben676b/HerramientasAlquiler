/* ================================================================
   CONSTANTES SEMÁNTICAS — reutilizables en toda la aplicación
   ================================================================ */

export const SEMANTIC = {
  disponible:    { variable: 'var(--success)', color: 'oklch(0.55 0.15 160)', soft: 'oklch(0.93 0.05 160)', label: 'Disponible' },
  alquilado:     { variable: 'var(--info)',    color: 'oklch(0.55 0.08 240)', soft: 'oklch(0.93 0.04 240)', label: 'Alquilado' },
  mantenimiento: { variable: 'var(--warning)', color: 'oklch(0.65 0.14 75)',  soft: 'oklch(0.93 0.05 75)',  label: 'Mantenimiento' },
  malogrado:     { variable: 'var(--danger)',  color: 'oklch(0.52 0.20 25)',  soft: 'oklch(0.93 0.04 25)',  label: 'Malogrado' },
  reservado:               { variable: 'var(--info)',    color: 'oklch(0.55 0.08 240)', soft: 'oklch(0.93 0.04 240)', label: 'Reservado' },
  alquilado:                { variable: 'var(--warning)', color: 'oklch(0.65 0.14 75)',  soft: 'oklch(0.93 0.05 75)',  label: 'Alquilado' },
  atrasado:                 { variable: 'var(--danger)',  color: 'oklch(0.52 0.20 25)',  soft: 'oklch(0.93 0.04 25)',  label: 'Atrasado' },
  devuelto:                 { variable: 'var(--success)', color: 'oklch(0.55 0.15 160)', soft: 'oklch(0.93 0.05 160)', label: 'Devuelto' },
  'devolución incompleta':   { variable: 'var(--danger)',  color: 'oklch(0.52 0.20 25)',  soft: 'oklch(0.93 0.04 25)',  label: 'Dev. incompleta' },
  nuevo:         { variable: 'var(--success)', color: 'oklch(0.55 0.15 160)', soft: 'oklch(0.93 0.05 160)', label: 'Nuevo' },
  usado:         { variable: 'var(--warning)', color: 'oklch(0.65 0.14 75)',  soft: 'oklch(0.93 0.05 75)',  label: 'Usado' },
  bien:          { variable: 'var(--success)', color: 'oklch(0.55 0.15 160)', soft: 'oklch(0.93 0.05 160)', label: 'Bien' },
  dañado:        { variable: 'var(--warning)', color: 'oklch(0.65 0.14 75)',  soft: 'oklch(0.93 0.05 75)',  label: 'Dañado' },
  'no devuelto': { variable: 'var(--danger)',  color: 'oklch(0.52 0.20 25)',  soft: 'oklch(0.93 0.04 25)',  label: 'No devuelto' },
  pendiente:     { variable: 'var(--muted)',   color: 'oklch(0.52 0.005 50)', soft: 'oklch(0.90 0.003 60)', label: 'Pendiente' },
};

export const ESTADOS_HERRAMIENTA = ['disponible', 'alquilado', 'mantenimiento', 'malogrado'];
export const ESTADOS_CONTRATO = ['reservado', 'alquilado', 'atrasado', 'devuelto', 'devolución incompleta'];
export const ESTADOS_DEVOLUCION = ['pendiente', 'bien', 'dañado', 'no devuelto'];
