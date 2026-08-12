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
 * Devuelve la fecha resultante de sumar n días (formato YYYY-MM-DD).
 */
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/**
 * Devuelve la fecha resultante de sumar n meses calendario (YYYY-MM-DD).
 * Con clamp al último día del mes destino: 31 ene + 1 mes = 28/29 feb (no desborda a marzo).
 */
function sumarMesCalendario(fecha, n) {
  const d = new Date(fecha + 'T00:00:00');
  const dia = d.getDate();
  d.setDate(1); // evitar desbordes (31 ene + 1 mes no debe saltar a 2 mar)
  d.setMonth(d.getMonth() + n);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return localDate(d);
}

/**
 * Meses completos "de 6 a 6" (0 es válido): máximo k tal que inicio + k meses <= fin.
 */
function mesesCompletos(fechaInicio, fechaFin) {
  let k = 0;
  while (sumarMesCalendario(fechaInicio, k + 1) <= fechaFin) k++;
  return k;
}

/**
 * Desglose para tarifa mensual: meses completos + días extra (hábiles) + total hábiles.
 * - meses: aniversarios exactos. Ej: 11 ago → 13 sep = 1.
 * - diasExtra: días hábiles posteriores al último aniversario (0 si el período es exacto).
 * - totalHabiles: días hábiles de todo el período.
 * Sin meses completos, diasExtra = 0 (se cobra a tarifa diaria).
 */
function desglosarMensual(fechaInicio, fechaFin) {
  const meses = mesesCompletos(fechaInicio, fechaFin);
  const totalHabiles = contarHabiles(fechaInicio, fechaFin);
  if (meses === 0) return { meses: 0, diasExtra: 0, totalHabiles };
  const aniversario = sumarMesCalendario(fechaInicio, meses);
  const diff = Math.max(0, Math.ceil(
    (new Date(fechaFin + 'T00:00:00') - new Date(aniversario + 'T00:00:00')) / 86400000
  ));
  const diasExtra = diff > 0 ? contarHabiles(sumarDias(aniversario, 1), fechaFin) : 0;
  return { meses, diasExtra, totalHabiles };
}

/**
 * Precio de una línea según tarifa y fechas.
 * - tarifa 'mes': meses completos al precio mensual + días extra a tarifa diaria.
 *   Sin meses completos cae a tarifa diaria. Para contratos históricos el precio
 *   diario se aproxima como mensual / 30 (la BD solo guarda el precio mensual).
 * - resto: tarifa diaria × días hábiles.
 */
function calcularTotalItem(tarifa, precioAplicado, fechaSalida, fechaDevolucion, cantidad) {
  if (tarifa === 'mes') {
    const desg = desglosarMensual(fechaSalida, fechaDevolucion);
    const diaria = precioAplicado / 30;
    if (desg.meses > 0) return (precioAplicado * desg.meses + diaria * desg.diasExtra) * cantidad;
    return diaria * desg.totalHabiles * cantidad;
  }
  return precioAplicado * contarHabiles(fechaSalida, fechaDevolucion) * cantidad;
}

module.exports = { localDate, localDateTime, contarHabiles, mesesCompletos, desglosarMensual, calcularTotalItem, sumarDias, sumarMesCalendario };