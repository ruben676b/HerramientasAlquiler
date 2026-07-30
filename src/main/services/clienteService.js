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
           ig.condicion AS item_condicion,
           ig.precio_venta AS item_precio_venta
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN ITEM_GRANEL ig ON d.id_item_granel = ig.id
    WHERE d.id_contrato = ?
  `).all(idContrato);

  const pagos = db.prepare(`
    SELECT id, monto, metodo, tipo, fecha_pago, id_detalle, anulado
    FROM PAGO WHERE id_contrato = ?
    ORDER BY fecha_pago DESC
  `).all(idContrato);

  const calificacion = db.prepare(
    'SELECT estrellas, comentario FROM CALIFICACION_CLIENTE WHERE id_contrato = ?'
  ).get(idContrato);

  // Enriquecer items con datos de devolución y mora
  const hoy = new Date().toISOString().slice(0, 10);
  let total_atraso = 0;
  let total_danos = 0;
  let total_perdidas = 0;

  const itemsEnriched = items.map(item => {
    if (item.id_item_granel) {
      const dev = db.prepare(`
        SELECT
          COALESCE(SUM(cantidad_bien), 0) AS total_bien,
          COALESCE(SUM(cantidad_danada), 0) AS total_danada,
          COALESCE(SUM(cantidad_perdida), 0) AS total_perdida,
          COALESCE(SUM(costo_reparacion), 0) AS total_costo_reparacion,
          COALESCE(SUM(costo_perdida), 0) AS total_costo_perdida
        FROM DEVOLUCION_GRANEL
        WHERE id_detalle = ? AND (revertido IS NULL OR revertido = 0)
      `).get(item.id);
      item.granel_dev_bien = dev.total_bien;
      item.granel_dev_danada = dev.total_danada;
      item.granel_dev_perdida = dev.total_perdida;
      item.granel_pendiente = Math.max(0, item.cantidad - dev.total_bien - dev.total_danada - dev.total_perdida);
      item.granel_dev_costo_reparacion = dev.total_costo_reparacion || 0;
      item.granel_dev_costo_perdida = dev.total_costo_perdida || 0;
      total_danos += dev.total_costo_reparacion || 0;
      total_perdidas += dev.total_costo_perdida || 0;
    }

    const fechaDevItem = item.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada;
    const diasItem = Math.max(1, Math.ceil(
      (new Date(fechaDevItem + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
    ) + 1);
    const totalItem = diasItem * item.precio_dia_aplicado * item.cantidad;
    const fechaPactadaItem = new Date(fechaDevItem + 'T00:00:00');
    const refDate = item.fecha_devolucion_real
      ? new Date(item.fecha_devolucion_real + 'T00:00:00')
      : new Date(hoy + 'T00:00:00');
    const diasAtrasoItem = Math.max(0, Math.ceil((refDate - fechaPactadaItem) / 86400000));
    const montoAtrasoItem = diasAtrasoItem * item.precio_dia_aplicado * item.cantidad;
    total_atraso += montoAtrasoItem;

    const pagadoItem = db.prepare(
      "SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = ? AND id_detalle = ? AND (anulado IS NULL OR anulado = 0)"
    ).get(idContrato, item.id)['COALESCE(SUM(monto), 0)'];
    const saldoItem = Math.max(0, totalItem + montoAtrasoItem - pagadoItem);

    return { ...item, dias_atraso_item: diasAtrasoItem, monto_atraso_item: montoAtrasoItem, dias_item: diasItem, total_item: totalItem, pagado_item: pagadoItem, saldo_item: saldoItem };
  });

  // Sumar costos de reparación de MANTENIMIENTO para individuales dañados
  const danosIndividuales = db.prepare(`
    SELECT COALESCE(SUM(m.costo), 0) AS total
    FROM MANTENIMIENTO m
    JOIN DETALLE_CONTRATO d ON d.id_herramienta = m.id_herramienta
    WHERE d.id_contrato = ? AND d.tipo_item = 'individual' AND d.estado_devolucion = 'dañado'
  `).get(idContrato);
  total_danos += danosIndividuales.total || 0;

  const totalPagado = pagos.reduce((a, p) => (p.anulado ? a : a + p.monto), 0);
  const totalBase = itemsEnriched.reduce((a, i) => a + i.total_item, 0);
  const totalGeneral = totalBase + total_atraso + total_danos + total_perdidas + (contrato.deposito_monto || 0);

  return {
    contrato,
    items: itemsEnriched,
    pagos,
    calificacion: calificacion || null,
    total_atraso,
    total_danos,
    total_perdidas,
    total_base: totalBase,
    total_pagado: totalPagado,
    total_general: totalGeneral,
  };
}

module.exports = {
  getClientesConCalificacion,
  buscarClientesConCalificacion,
  getContratosCliente,
  getDetalleContrato,
};
