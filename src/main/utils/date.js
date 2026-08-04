/**
 * Devuelve la fecha local en formato YYYY-MM-DD.
 * Se usa en lugar de new Date().toISOString().slice(0,10), que entrega la
 * fecha en UTC y puede desfasar un día en zonas horarias negativas (ej. Perú, UTC-5).
 */
function localDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Devuelve la fecha y hora local en formato YYYY-MM-DD HH:MM:SS.SSS.
 * Reemplaza datetime('now','localtime') de SQLite para evitar inconsistencias.
 */
function localDateTime(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

module.exports = { localDate, localDateTime };