/**
 * Devuelve la fecha local en formato YYYY-MM-DD.
 * Se usa en lugar de new Date().toISOString().slice(0,10), que entrega la
 * fecha en UTC y puede desfasar un día en zonas horarias negativas (ej. Perú, UTC-5).
 */
export function localDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
