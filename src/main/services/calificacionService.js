const db = require('../db/database');

/**
 * Guarda una calificación por estrellas para un contrato/cliente.
 * 
 * @param {number} idContrato
 * @param {number} estrellas - 1 a 5
 * @param {string|null} comentario
 * @returns {{ id: number }}
 */
function guardarCalificacion(idContrato, estrellas, comentario) {
  if (!idContrato) throw new Error('ID de contrato requerido.');
  if (!estrellas || estrellas < 1 || estrellas > 5) {
    throw new Error('La calificación debe ser entre 1 y 5 estrellas.');
  }

  const contrato = db.prepare('SELECT id_cliente FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');

  // Upsert: si ya existe calificación para este contrato, actualizarla
  const existente = db.prepare('SELECT id FROM CALIFICACION_CLIENTE WHERE id_contrato = ?').get(idContrato);

  if (existente) {
    db.prepare('UPDATE CALIFICACION_CLIENTE SET estrellas = ?, comentario = ? WHERE id = ?')
      .run(estrellas, comentario || null, existente.id);
    return { id: existente.id };
  }

  const result = db.prepare(
    'INSERT INTO CALIFICACION_CLIENTE (id_contrato, id_cliente, estrellas, comentario) VALUES (?, ?, ?, ?)'
  ).run(idContrato, contrato.id_cliente, estrellas, comentario || null);

  return { id: result.lastInsertRowid };
}

/**
 * Retorna todas las calificaciones de un cliente.
 * 
 * @param {number} idCliente
 * @returns {Array<{ id, id_contrato, estrellas, comentario, fecha_salida, fecha_devolucion_real }>}
 */
function getCalificacionesCliente(idCliente) {
  return db.prepare(`
    SELECT cal.id, cal.id_contrato, cal.estrellas, cal.comentario,
           c.fecha_salida, c.fecha_devolucion_real, c.estado
    FROM CALIFICACION_CLIENTE cal
    JOIN CONTRATO c ON cal.id_contrato = c.id
    WHERE cal.id_cliente = ?
    ORDER BY c.fecha_salida DESC
  `).all(idCliente);
}

/**
 * Retorna el promedio de estrellas y cantidad de calificaciones de un cliente.
 * 
 * @param {number} idCliente
 * @returns {{ promedio: number|null, total: number }}
 */
function getPromedioCliente(idCliente) {
  const row = db.prepare(`
    SELECT AVG(estrellas) AS promedio, COUNT(*) AS total
    FROM CALIFICACION_CLIENTE
    WHERE id_cliente = ?
  `).get(idCliente);

  return {
    promedio: row.total > 0 ? Math.round(row.promedio * 10) / 10 : null,
    total: row.total,
  };
}

module.exports = { guardarCalificacion, getCalificacionesCliente, getPromedioCliente };
