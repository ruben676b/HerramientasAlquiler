const db = require('../db/database');
const { localDate, contarHabiles, desglosarMensual, calcularTotalItem } = require('../utils/date');

/**
 * Lista todos los clientes activos con promedio de estrellas y total de alquileres.
 * Ordenados alfabéticamente por nombre.
 * 
 * @returns {Array<{ id, nombre, dni, telefono, en_lista_negra, promedio_estrellas, total_calificaciones, total_alquileres }>}
 */
function getClientesConCalificacion() {
  const clientes = db.prepare(`
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

  return adjuntarEtiquetas(clientes);
}

/**
 * Busca clientes por nombre o DNI, con promedio de estrellas.
 * 
 * @param {string} termino
 * @returns {Array}
 */
function buscarClientesConCalificacion(termino) {
  const patron = '%' + termino + '%';
  const clientes = db.prepare(`
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

  return adjuntarEtiquetas(clientes);
}

/**
 * Devuelve todas las etiquetas de cliente activas, ordenadas alfabéticamente.
 *
 * @returns {Array<{ id, nombre, color }>}
 */
function getEtiquetas() {
  return db.prepare(`
    SELECT id, nombre, color
    FROM ETIQUETA_CLIENTE
    WHERE activo = 1
    ORDER BY nombre ASC
  `).all();
}

/**
 * Crea una etiqueta de cliente.
 *
 * @param {string} nombre
 * @param {string} color Hue oklch (ej: '160')
 * @returns {{ id: number }}
 */
function crearEtiqueta(nombre, color) {
  const nom = String(nombre || '').trim();
  if (!nom) throw new Error('El nombre de la etiqueta no puede estar vacío.');
  try {
    const r = db.prepare('INSERT INTO ETIQUETA_CLIENTE (nombre, color) VALUES (?, ?)')
      .run(nom, color || '160');
    return { id: r.lastInsertRowid };
  } catch (err) {
    if (String(err.code || '').includes('UNIQUE')) {
      throw new Error('Ya existe una etiqueta con ese nombre.');
    }
    throw err;
  }
}

/**
 * Edita una etiqueta de cliente.
 */
function editarEtiqueta(id, nombre, color) {
  const nom = String(nombre || '').trim();
  if (!nom) throw new Error('El nombre de la etiqueta no puede estar vacío.');
  try {
    const r = db.prepare('UPDATE ETIQUETA_CLIENTE SET nombre = ?, color = ? WHERE id = ? AND activo = 1')
      .run(nom, color || '160', id);
    if (r.changes === 0) throw new Error('Etiqueta no encontrada.');
    return { id };
  } catch (err) {
    if (String(err.code || '').includes('UNIQUE')) {
      throw new Error('Ya existe una etiqueta con ese nombre.');
    }
    throw err;
  }
}

/**
 * Elimina una etiqueta. Las asignaciones se borran en cascada.
 */
function eliminarEtiqueta(id) {
  const r = db.prepare('DELETE FROM ETIQUETA_CLIENTE WHERE id = ? AND activo = 1').run(id);
  if (r.changes === 0) throw new Error('Etiqueta no encontrada.');
  return { id };
}

/**
 * Reemplaza las etiquetas asignadas a un cliente (delete + insert atómico).
 *
 * @param {number} idCliente
 * @param {number[]} idsEtiquetas
 */
function asignarEtiquetasCliente(idCliente, idsEtiquetas) {
  const ids = (idsEtiquetas || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
  db.transaction(() => {
    db.prepare('DELETE FROM CLIENTE_ETIQUETA WHERE id_cliente = ?').run(idCliente);
    const insert = db.prepare('INSERT OR IGNORE INTO CLIENTE_ETIQUETA (id_cliente, id_etiqueta) VALUES (?, ?)');
    for (const id of ids) insert.run(idCliente, id);
  })();
  return { idCliente, etiquetas: ids };
}

/**
 * Devuelve un Map de id_cliente -> etiquetas [{id, nombre, color}].
 * Una sola query para adjuntar etiquetas a cualquier conjunto de filas.
 */
function _etiquetasPorCliente() {
  const filas = db.prepare(`
    SELECT ce.id_cliente, e.id, e.nombre, e.color
    FROM CLIENTE_ETIQUETA ce
    JOIN ETIQUETA_CLIENTE e ON e.id = ce.id_etiqueta
    WHERE e.activo = 1
    ORDER BY e.nombre ASC
  `).all();

  const porCliente = new Map();
  for (const f of filas) {
    if (!porCliente.has(f.id_cliente)) porCliente.set(f.id_cliente, []);
    porCliente.get(f.id_cliente).push({ id: f.id, nombre: f.nombre, color: f.color });
  }
  return porCliente;
}

/**
 * Adjunta el arreglo de etiquetas a una lista de clientes (una sola query).
 * Las filas se indexan por su campo `id` (id del cliente).
 *
 * @param {Array} clientes
 * @returns {Array}
 */
function adjuntarEtiquetas(clientes) {
  if (!clientes || clientes.length === 0) return clientes;
  const porCliente = _etiquetasPorCliente();
  return clientes.map(c => ({
    ...c,
    etiquetas: porCliente.get(c.id) || [],
  }));
}

/**
 * Adjunta etiquetas a filas que exponen el id del cliente en `id_cliente`
 * (por ejemplo, contratos). Indexa por `f.id_cliente`.
 *
 * @param {Array} filas
 * @returns {Array}
 */
function adjuntarEtiquetasPorCliente(filas) {
  if (!filas || filas.length === 0) return filas;
  const porCliente = _etiquetasPorCliente();
  return filas.map(f => ({
    ...f,
    etiquetas: porCliente.get(f.id_cliente) || [],
  }));
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
           (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = c.id AND tipo NOT IN ('deposito', 'devolucion_deposito') AND (anulado IS NULL OR anulado = 0)) AS total_pagado,
           (SELECT COALESCE(SUM(costo), 0) FROM DAÑO_DEVOLUCION WHERE id_contrato = c.id AND revertido = 0) AS total_danos,
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
           COALESCE(ig.precio_venta, h.precio_venta, cat.precio_venta) AS item_precio_venta,
           COALESCE(h.valor_reposicion, h.precio_venta, ig.precio_venta, cat.precio_venta) AS item_valor_reposicion
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN CATEGORIA_HERRAMIENTA cat ON h.id_categoria = cat.id
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
  const hoy = localDate();
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

    // Pérdida/venta de herramienta individual: costo guardado en DETALLE_CONTRATO.costo_perdida
    if (item.estado_devolucion === 'perdido' || item.estado_devolucion === 'vendido') {
      total_perdidas += item.costo_perdida || 0;
    }

    const fechaDevItem = item.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada;
    const diasItem = Math.max(1, Math.ceil(
      (new Date(fechaDevItem + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
    ) + 1);
    const totalItem = item.total_item_snapshot != null
      ? item.total_item_snapshot
      : calcularTotalItem(item.tarifa_aplicada || 'dia', item.precio_dia_aplicado, contrato.fecha_salida, fechaDevItem, item.cantidad);
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

    const desgMes = item.tarifa_aplicada === 'mes' ? desglosarMensual(contrato.fecha_salida, fechaDevItem) : null;
    return { ...item, dias_atraso_item: diasAtrasoItem, monto_atraso_item: montoAtrasoItem, dias_item: diasItem, dias_habiles_item: contarHabiles(contrato.fecha_salida, fechaDevItem), meses_item: desgMes ? desgMes.meses : 0, dias_extra_item: desgMes ? desgMes.diasExtra : 0, total_item: totalItem, pagado_item: pagadoItem, saldo_item: saldoItem };
  });

  // Sumar costos de DAÑO_DEVOLUCION para individuales dañados
  const danosIndividuales = db.prepare(`
    SELECT COALESCE(SUM(costo), 0) AS total
    FROM DAÑO_DEVOLUCION
    WHERE id_contrato = ? AND revertido = 0 AND tipo_item = 'individual'
  `).get(idContrato);
  total_danos += danosIndividuales.total || 0;

  const totalPagado = pagos.reduce((a, p) => (p.anulado || p.tipo === 'deposito' || p.tipo === 'devolucion_deposito' ? a : a + p.monto), 0);
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
  getEtiquetas,
  crearEtiqueta,
  editarEtiqueta,
  eliminarEtiqueta,
  asignarEtiquetasCliente,
  adjuntarEtiquetasPorCliente,
  getContratosCliente,
  getDetalleContrato,
};
