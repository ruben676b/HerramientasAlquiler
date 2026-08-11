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

/**
 * Cuenta los días entre dos fechas (inclusive) EXCLUYENDO domingos.
 * Regla de negocio: los domingos no se cobran, en ninguna tarifa.
 */
function contarHabiles(fechaInicio, fechaFin) {
  const start = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');
  let count = 0;
  while (start <= end) {
    if (start.getDay() !== 0) count++;
    start.setDate(start.getDate() + 1);
  }
  return Math.max(1, count);
}

/**
 * Cuenta períodos mensuales "de 6 a 6": cada cruce del día de inicio suma un mes.
 * Ej: 2026-08-06 → 2026-09-06 = 1 mes; → 2026-10-06 = 2 meses. Mínimo 1 mes.
 */
function contarMeses(fechaInicio, fechaFin) {
  const start = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');
  let meses = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    cursor.setMonth(cursor.getMonth() + 1);
    meses++;
  }
  return Math.max(1, meses);
}

/**
 * Devuelve la fecha resultante de sumar n días (formato YYYY-MM-DD).
 */
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/**
 * Devuelve la fecha resultante de sumar n meses calendario (YYYY-MM-DD).
 */
function sumarMesCalendario(fecha, n) {
  const d = new Date(fecha + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return localDate(d);
}

/**
 * Meses completos "de 6 a 6" (0 es válido): máximo k tal que inicio + k meses <= fin.
 * A diferencia de contarMeses, no tiene mínimo de 1 mes.
 */
function mesesCompletos(fechaInicio, fechaFin) {
  let k = 0;
  while (sumarMesCalendario(fechaInicio, k + 1) <= fechaFin) k++;
  return k;
}

module.exports = { localDate, localDateTime, contarHabiles, contarMeses, mesesCompletos, sumarDias, sumarMesCalendario };