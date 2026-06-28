const db = require('../db/database');

/**
 * Crea un contrato de alquiler con sus ítems dentro de una transacción atómica.
 *
 * @param {number} idCliente
 * @param {number} idUsuario
 * @param {string} fechaSalida           - formato YYYY-MM-DD
 * @param {string} fechaDevolucionPactada - formato YYYY-MM-DD
 * @param {number} depositoMonto
 * @param {number} depositoDni           - 0 o 1
 * @param {Array}  items                 - [{ tipo_item, id_herramienta?, id_item_granel?, cantidad? }]
 * @returns {{ idContrato: number }}
 */
function crearContrato(
  idCliente,
  idUsuario,
  fechaSalida,
  fechaDevolucionPactada,
  depositoMonto,
  depositoDni,
  items
) {
  if (!items || items.length === 0) {
    throw new Error('El contrato debe contener al menos un ítem.');
  }

  if (fechaDevolucionPactada <= fechaSalida) {
    throw new Error('La fecha de devolución debe ser posterior a la fecha de salida.');
  }

  const ejecutar = db.transaction(() => {
    const insertContrato = db.prepare(`
      INSERT INTO CONTRATO (
        id_cliente, id_usuario, fecha_salida, fecha_devolucion_pactada,
        deposito_monto, deposito_dni
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel,
        cantidad, precio_dia_aplicado, mora_dia_aplicada
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const resultado = insertContrato.run(
      idCliente,
      idUsuario,
      fechaSalida,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni
    );

    const idContrato = resultado.lastInsertRowid;

    for (const item of items) {
      if (item.tipo_item === 'individual') {
        const herramienta = db
          .prepare(
            'SELECT precio_dia, mora_dia, estado FROM HERRAMIENTA WHERE id = ? AND activo = 1'
          )
          .get(item.id_herramienta);

        if (!herramienta) {
          throw new Error(
            'Herramienta no encontrada o inactiva: ' + item.id_herramienta
          );
        }
        if (herramienta.estado !== 'disponible') {
          throw new Error(
            'La herramienta ' +
              item.id_herramienta +
              ' no está disponible (estado: ' +
              herramienta.estado +
              ').'
          );
        }

        insertDetalle.run(
          idContrato,
          'individual',
          item.id_herramienta,
          null,
          1,
          herramienta.precio_dia,
          herramienta.mora_dia
        );

        db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(
          'alquilado',
          item.id_herramienta
        );
      } else if (item.tipo_item === 'granel') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para ítems a granel debe ser al menos 1.');
        }

        const granel = db
          .prepare(
            'SELECT precio_dia, mora_dia, cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1'
          )
          .get(item.id_item_granel);

        if (!granel) {
          throw new Error(
            'Ítem a granel no encontrado o inactivo: ' + item.id_item_granel
          );
        }
        if (granel.cantidad_disponible < item.cantidad) {
          throw new Error(
            'Stock insuficiente. Disponible: ' +
              granel.cantidad_disponible +
              ', solicitado: ' +
              item.cantidad
          );
        }

        insertDetalle.run(
          idContrato,
          'granel',
          null,
          item.id_item_granel,
          item.cantidad,
          granel.precio_dia,
          granel.mora_dia
        );

        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      }
    }

    return { idContrato };
  });

  return ejecutar();
}

/**
 * Registra la devolución de un contrato, procesando cada ítem según su checklist.
 *
 * @param {number} idContrato
 * @param {string} fechaDevolucionReal - formato YYYY-MM-DD
 * @param {Array}  itemsDevueltos       - [{ id_detalle, estado_devolucion }]
 * @returns {{ diasAtraso: number, totalMora: number }}
 */
function registrarDevolucion(idContrato, fechaDevolucionReal, itemsDevueltos) {
  if (!itemsDevueltos || itemsDevueltos.length === 0) {
    throw new Error('Debe especificar al menos un ítem para la devolución.');
  }

  const ejecutar = db.transaction(() => {
    const contrato = db
      .prepare('SELECT * FROM CONTRATO WHERE id = ?')
      .get(idContrato);

    if (!contrato) {
      throw new Error('Contrato no encontrado.');
    }
    if (contrato.estado === 'devuelto' || contrato.estado === 'cancelado') {
      throw new Error(
        'El contrato ya fue ' +
          contrato.estado +
          ' y no puede ser procesado nuevamente.'
      );
    }

    db.prepare(
      'UPDATE CONTRATO SET fecha_devolucion_real = ?, estado = ? WHERE id = ?'
    ).run(fechaDevolucionReal, 'devuelto', idContrato);

    const fechaPactada = new Date(
      contrato.fecha_devolucion_pactada + 'T00:00:00'
    );
    const fechaReal = new Date(fechaDevolucionReal + 'T00:00:00');
    const diasAtraso = Math.max(
      0,
      Math.ceil((fechaReal - fechaPactada) / (1000 * 60 * 60 * 24))
    );

    let totalMora = 0;

    for (const item of itemsDevueltos) {
      const detalle = db
        .prepare(
          'SELECT * FROM DETALLE_CONTRATO WHERE id = ? AND id_contrato = ?'
        )
        .get(item.id_detalle, idContrato);

      if (!detalle) {
        throw new Error(
          'Detalle de contrato no encontrado: ' + item.id_detalle
        );
      }

      db.prepare(
        'UPDATE DETALLE_CONTRATO SET estado_devolucion = ? WHERE id = ?'
      ).run(item.estado_devolucion, item.id_detalle);

      if (
        item.estado_devolucion === 'bien' ||
        item.estado_devolucion === 'dañado'
      ) {
        if (detalle.tipo_item === 'individual') {
          const nuevoEstado =
            item.estado_devolucion === 'dañado' ? 'mantenimiento' : 'disponible';
          db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(
            nuevoEstado,
            detalle.id_herramienta
          );
        } else if (detalle.tipo_item === 'granel') {
          db.prepare(
            'UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible + ? WHERE id = ?'
          ).run(detalle.cantidad, detalle.id_item_granel);
        }
      }

      if (diasAtraso > 0 && item.estado_devolucion !== 'no devuelto') {
        const moraItem =
          diasAtraso * detalle.mora_dia_aplicada * detalle.cantidad;
        totalMora += moraItem;
      }
    }

    return { diasAtraso, totalMora };
  });

  return ejecutar();
}

function getContratos(filtros = {}) {
  let sql = `
    SELECT DISTINCT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
      (SELECT COUNT(*) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS total_items,
      (SELECT SUM(precio_dia_aplicado * cantidad) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS subtotal_diario
    FROM CONTRATO c
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    LEFT JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
    WHERE 1=1
  `;
  const params = [];

  if (filtros.estado) {
    sql += ' AND c.estado = ?';
    params.push(filtros.estado);
  }
  if (filtros.busqueda) {
    const p = '%' + filtros.busqueda + '%';
    const pSinGuion = '%' + filtros.busqueda.replace('-', '') + '%';
    sql += ` AND (
      cl.nombre LIKE ? OR
      cl.dni LIKE ? OR
      CAST(c.id AS TEXT) LIKE ? OR
      d.id_herramienta LIKE ? OR
      REPLACE(d.id_herramienta, '-', '') LIKE ?
    )`;
    params.push(p, p, p, p, pSinGuion);
  }

  sql += ` ORDER BY
    CASE c.estado
      WHEN 'devolución incompleta' THEN 1
      WHEN 'alquilado' THEN 2
      WHEN 'reservado' THEN 3
      WHEN 'devuelto' THEN 4
    END,
    c.fecha_devolucion_pactada ASC`;

  return db.prepare(sql).all(...params);
}

module.exports = { crearContrato, registrarDevolucion, getContratos };
