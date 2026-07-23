const db = require('../db/database');

/**
 * Lista todos los clientes activos con promedio de estrellas y total de alquileres.
 * Ordenados alfabéticamente por nombre.
 * 
 * @returns {Array<{ id, nombre, dni, telefono, en_lista_negra, promedio_estrellas, total_calificaciones, total_alquileres }>}
 */
function getClientesConCalificacion() {
  return db.prepare(`
    SELECT c.id, c.tipo, c.nombre, c.dni, c.ruc, c.telefono, c.direccion, c.email,
           c.en_lista_negra, c.fecha_registro,
           ROUND(AVG(cal.estrellas), 1) AS promedio_estrellas,
           COUNT(cal.id) AS total_calificaciones,
           (SELECT COUNT(*) FROM CONTRATO ct WHERE ct.id_cliente = c.id) AS total_alquileres
    FROM CLIENTE c
    LEFT JOIN CALIFICACION_CLIENTE cal ON cal.id_cliente = c.id
    WHERE c.activo = 1
    GROUP BY c.id
    ORDER BY c.nombre ASC
  `).all();
}

/**
 * Busca clientes por nombre o DNI, con promedio de estrellas.
 * 
 * @param {string} termino
 * @returns {Array}
 */
function buscarClientesConCalificacion(termino) {
  const patron = '%' + termino + '%';
  return db.prepare(`
    SELECT c.id, c.tipo, c.nombre, c.dni, c.ruc, c.telefono, c.direccion, c.email,
           c.en_lista_negra, c.fecha_registro,
           ROUND(AVG(cal.estrellas), 1) AS promedio_estrellas,
           COUNT(cal.id) AS total_calificaciones,
           (SELECT COUNT(*) FROM CONTRATO ct WHERE ct.id_cliente = c.id) AS total_alquileres
    FROM CLIENTE c
    LEFT JOIN CALIFICACION_CLIENTE cal ON cal.id_cliente = c.id
    WHERE c.activo = 1 AND (c.nombre LIKE ? OR c.dni LIKE ?)
    GROUP BY c.id
    ORDER BY c.nombre ASC
  `).all(patron, patron);
}

/**
 * Retorna historial de alquileres de un cliente con calificación.
 * 
 * @param {number} idCliente
 * @returns {Array<{ id, fecha_salida, fecha_devolucion_pactada, fecha_devolucion_real, estado, total_items, subtotal_diario, total_pagado, estrellas, comentario }>}
 */
function getContratosCliente(idCliente) {
  const contratos = db.prepare(`
    SELECT c.id, c.fecha_salida, c.fecha_devolucion_pactada, c.fecha_devolucion_real,
           c.estado, c.deposito_monto, c.deposito_dni, c.notas,
           (SELECT COUNT(*) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS total_items,
           (SELECT SUM(precio_dia_aplicado * cantidad) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS subtotal_diario,
           (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = c.id) AS total_pagado,
           cal.estrellas, cal.comentario AS calificacion_comentario
    FROM CONTRATO c
    LEFT JOIN CALIFICACION_CLIENTE cal ON cal.id_contrato = c.id
    WHERE c.id_cliente = ?
    ORDER BY c.fecha_salida DESC
  `).all(idCliente);

  return contratos;
}

/**
 * Retorna el detalle completo de un contrato (items, pagos, calificación).
 * 
 * @param {number} idContrato
 * @returns {{ contrato, items, pagos, calificacion }}
 */
function getDetalleContrato(idContrato) {
  const contrato = db.prepare(`
    SELECT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni, cl.telefono AS cliente_telefono
    FROM CONTRATO c
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE c.id = ?
  `).get(idContrato);

  if (!contrato) throw new Error('Contrato no encontrado.');

  const items = db.prepare(`
    SELECT d.*, COALESCE(h.nombre, ig.nombre) AS item_nombre,
           COALESCE(h.id, 'MAT') AS item_codigo,
           ig.condicion AS item_condicion
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN ITEM_GRANEL ig ON d.id_item_granel = ig.id
    WHERE d.id_contrato = ?
  `).all(idContrato);

  const pagos = db.prepare(`
    SELECT id, monto, metodo, tipo, fecha_pago
    FROM PAGO WHERE id_contrato = ?
    ORDER BY fecha_pago ASC
  `).all(idContrato);

  const calificacion = db.prepare(
    'SELECT estrellas, comentario FROM CALIFICACION_CLIENTE WHERE id_contrato = ?'
  ).get(idContrato);

  return { contrato, items, pagos, calificacion: calificacion || null };
}

module.exports = {
  getClientesConCalificacion,
  buscarClientesConCalificacion,
  getContratosCliente,
  getDetalleContrato,
};
