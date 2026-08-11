/* Utilidades compartidas de duración y fechas (renderer).
 * El contador de duración descompone el período en meses + semanas + días:
 *  - meses: períodos completos "de 6 a 6" (aniversarios del día de salida).
 *  - semanas: grupos de 7 días (máx. 3; 4 semanas = 1 mes, regla del negocio).
 *  - días: días calendario restantes. Mínimo 1 día (misma fecha = 1 día).
 * La fecha de devolución es la fuente de verdad: los contadores la derivan
 * (descomponerDuracion) y la re-escriben (componerFecha). */

export const fmtLocalDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const sumarDias = (fecha, n) => {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtLocalDate(d);
};

export const sumarMesCalendario = (fecha, n) => {
  const d = new Date(fecha + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return fmtLocalDate(d);
};

/* Días hábiles entre dos fechas (inclusive), excluyendo domingos: los domingos no se cobran. */
export const contarHabiles = (desde, hasta) => {
  const start = new Date(desde + 'T00:00:00');
  const end = new Date(hasta + 'T00:00:00');
  let count = 0;
  while (start <= end) {
    if (start.getDay() !== 0) count++;
    start.setDate(start.getDate() + 1);
  }
  return Math.max(1, count);
};

/* Meses completos "de 6 a 6" (0 es válido): máximo k tal que salida + k meses <= hasta. */
export const mesesCompletos = (desde, hasta) => {
  let k = 0;
  while (sumarMesCalendario(desde, k + 1) <= hasta) k++;
  return k;
};

/* Desglose para tarifa mensual: meses completos + días extra (hábiles) + total hábiles.
 * - meses: aniversarios exactos (mesesCompletos). Ej: 11 ago → 13 sep = 1.
 * - diasExtra: días hábiles posteriores al último aniversario (0 si el período es exacto).
 * - totalHabiles: días hábiles de todo el período (para mostrar "X días sin dom.").
 * Si no hay meses completos, diasExtra = 0 y el ítem se cobra a tarifa diaria. */
export const desglosarMensual = (desde, hasta) => {
  const meses = mesesCompletos(desde, hasta);
  const totalHabiles = contarHabiles(desde, hasta);
  if (meses === 0) return { meses: 0, diasExtra: 0, totalHabiles };
  const aniversario = sumarMesCalendario(desde, meses);
  const diff = Math.max(0, Math.ceil(
    (new Date(hasta + 'T00:00:00') - new Date(aniversario + 'T00:00:00')) / 86400000
  ));
  const diasExtra = diff > 0 ? contarHabiles(sumarDias(aniversario, 1), hasta) : 0;
  return { meses, diasExtra, totalHabiles };
};

/* Conteo calendario inclusive entre dos fechas. */
export const contarDiasCalendario = (desde, hasta) => Math.max(1, Math.ceil(
  (new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000
) + 1);

/* Semanas transcurridas (para el stepper): 1-7 días = 1 semana, 8-14 = 2, etc. */
export const contarSemanas = (desde, hasta) => Math.max(1, Math.floor((contarDiasCalendario(desde, hasta) - 1) / 7) + 1);

/* Descompone (salida, devolución) en {meses, semanas, días}.
 * - Sin meses: días es el conteo inclusivo (salida→salida = 1 día); 7 días = 1 semana.
 * - Con meses: días son los días extra después del aniversario (0 = período exacto).
 * - Si el sobrante supera 3 semanas, los días restantes se acumulan en "días". */
export const descomponerDuracion = (salida, fecha) => {
  if (!salida || !fecha) return { meses: 0, semanas: 0, dias: 1 };
  const meses = mesesCompletos(salida, fecha);
  const aniversario = sumarMesCalendario(salida, meses);
  const diff = Math.max(0, Math.ceil(
    (new Date(fecha + 'T00:00:00') - new Date(aniversario + 'T00:00:00')) / 86400000
  ));
  let n;
  if (meses === 0) n = diff + 1;        // conteo inclusivo
  else if (diff === 0) n = 0;           // período exacto de meses
  else n = diff;                        // días extra tras el aniversario
  const semanas = Math.min(3, Math.floor(n / 7));
  const dias = n - semanas * 7;
  return { meses, semanas, dias };
};

/* Compone la fecha de devolución desde (meses, semanas, días). Inversa de descomponerDuracion.
 * El mínimo de 1 día solo aplica al período nulo (sin meses ni semanas): con semanas o meses,
 * el "0" significa período exacto, no un día extra. */
export const componerFecha = (salida, meses, semanas, dias) => {
  const base = sumarMesCalendario(salida, meses);
  const d = (semanas > 0 || meses > 0) ? dias : Math.max(1, dias);
  if (meses === 0) return sumarDias(base, semanas * 7 + d - 1); // inclusivo
  return sumarDias(base, semanas * 7 + d);                      // extras
};

/* Texto legible del período: "1 mes y 10 días", "2 semanas y 3 días", "17 días"... */
export const formatearPeriodo = ({ meses, semanas, dias }) => {
  const partes = [];
  if (meses > 0) partes.push(meses + (meses === 1 ? ' mes' : ' meses'));
  if (semanas > 0) partes.push(semanas + (semanas === 1 ? ' semana' : ' semanas'));
  if (dias > 0 || partes.length === 0) partes.push(dias + (dias === 1 ? ' día' : ' días'));
  return partes.join(' y ');
};
