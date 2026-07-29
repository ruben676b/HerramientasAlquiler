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
  items,
  pagos,
  dniCliente,
  nombreCliente,
  telefonoCliente
) {
  if (!items || items.length === 0) {
    throw new Error('El contrato debe contener al menos un ítem.');
  }

  if (fechaDevolucionPactada < fechaSalida) {
    throw new Error('La fecha de devolución debe ser posterior a la fecha de salida.');
  }

  // Auto-crear cliente si no existe
  let idClienteReal = idCliente;
  if (!idClienteReal || idClienteReal < 1) {
    if (dniCliente && dniCliente.length === 8) {
      const existente = db.prepare('SELECT id FROM CLIENTE WHERE dni = ?').get(dniCliente);
      if (existente) {
        idClienteReal = existente.id;
      }
    }
    if (!idClienteReal && nombreCliente) {
      const r = db.prepare('INSERT INTO CLIENTE (tipo, nombre, dni, telefono) VALUES (?, ?, ?, ?)')
        .run('persona', nombreCliente, dniCliente || null, telefonoCliente || null);
      idClienteReal = r.lastInsertRowid;
    }
  }
  if (!idClienteReal || idClienteReal < 1) {
    throw new Error('No se pudo identificar al cliente. Ingrese DNI o nombre.');
  }

  const ejecutar = db.transaction(() => {
    const insertContrato = db.prepare(`
      INSERT INTO CONTRATO (
        id_cliente, id_usuario, fecha_salida, fecha_devolucion_pactada,
        deposito_monto, deposito_dni, fecha_modificacion
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel,
        cantidad, precio_dia_aplicado, mora_dia_aplicada,
        fecha_devolucion_pactada_item, total_item_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const resultado = insertContrato.run(
      idClienteReal,
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

        const fechaDevItem = item.fecha_devolucion_pactada || null;
        insertDetalle.run(
          idContrato,
          'individual',
          item.id_herramienta,
          null,
          1,
          herramienta.precio_dia,
          herramienta.mora_dia,
          fechaDevItem,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
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

        const fechaDevItemG = item.fecha_devolucion_pactada || null;
        insertDetalle.run(
          idContrato,
          'granel',
          null,
          item.id_item_granel,
          item.cantidad,
          granel.precio_dia,
          granel.mora_dia,
          fechaDevItemG,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
        );

        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      }
    }

    // Insertar pagos
    if (pagos && pagos.length > 0) {
      const insertPago = db.prepare(`
        INSERT INTO PAGO (id_contrato, monto, metodo, tipo)
        VALUES (?, ?, ?, ?)
      `);
      for (const p of pagos) {
        insertPago.run(idContrato, p.monto, p.metodo, p.tipo || 'saldo');
      }
    }

    return { idContrato };
  });

  return ejecutar();
}

/**
 * Registra la devolución total o parcial de un contrato.
 * Cada ítem se procesa individualmente con su propia fecha de devolución.
 * Si quedan ítems pendientes, el contrato pasa a 'devolución incompleta'.
 *
 * @param {number} idContrato
 * @param {string} fechaDevolucionReal - formato YYYY-MM-DD
 * @param {Array}  itemsDevueltos       - [{ id_detalle, estado_devolucion, cantidad_devuelta?, costo_reparacion? }]
 * @param {object} observaciones        - { [id_detalle]: "texto" }
 * @returns {{ totalMora: number, completado: boolean, pendientes: number, totalDanos: number }}
 */
function registrarDevolucion(idContrato, fechaDevolucionReal, itemsDevueltos, observaciones) {
  if (!itemsDevueltos || itemsDevueltos.length === 0) {
    throw new Error('Debe especificar al menos un ítem para la devolución.');
  }

  const ejecutar = db.transaction(() => {
    const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
    if (!contrato) throw new Error('Contrato no encontrado.');
    if (contrato.estado === 'devuelto' || contrato.estado === 'cancelado') {
      throw new Error('El contrato ya fue ' + contrato.estado + ' y no puede ser procesado nuevamente.');
    }

    const fechaPactada = new Date(contrato.fecha_devolucion_pactada + 'T00:00:00');
    const fechaReal = new Date(fechaDevolucionReal + 'T00:00:00');
    let totalMora = 0;
    let totalDanos = 0;

    for (const item of itemsDevueltos) {
      const detalle = db.prepare('SELECT * FROM DETALLE_CONTRATO WHERE id = ? AND id_contrato = ?').get(item.id_detalle, idContrato);
      if (!detalle) throw new Error('Detalle de contrato no encontrado: ' + item.id_detalle);

      // Saltar ítems ya procesados en devoluciones parciales previas
      if (detalle.estado_devolucion !== 'pendiente') continue;

      const esDevuelto = item.estado_devolucion === 'bien' || item.estado_devolucion === 'dañado';

      // Actualizar estado del ítem y registrar fecha si fue devuelto
      if (esDevuelto) {
        db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?')
          .run(item.estado_devolucion, fechaDevolucionReal, item.id_detalle);
      } else {
        db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ? WHERE id = ?')
          .run(item.estado_devolucion, item.id_detalle);
      }

      if (esDevuelto) {
        if (detalle.tipo_item === 'individual') {
          const nuevoEstado = item.estado_devolucion === 'dañado' ? 'mantenimiento' : 'disponible';
          db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(nuevoEstado, detalle.id_herramienta);

          if (item.estado_devolucion === 'dañado') {
            totalDanos += item.costo_reparacion || 0;
            const hoy = new Date().toISOString().slice(0, 10);
            const desc = observaciones?.[item.id_detalle] || 'Dañado en devolución';
            db.prepare('INSERT INTO MANTENIMIENTO (id_herramienta, fecha_inicio, descripcion, tipo, costo) VALUES (?, ?, ?, ?, ?)')
              .run(detalle.id_herramienta, hoy, 'Devolucion: ' + desc, 'correctivo', item.costo_reparacion || 0);
          }
        } else if (detalle.tipo_item === 'granel') {
          const cantDevuelta = item.cantidad_devuelta || detalle.cantidad;

          if (cantDevuelta < detalle.cantidad) {
            // Split parcial: reducir la fila original y crear nueva fila para la porción devuelta
            const restante = detalle.cantidad - cantDevuelta;
            db.prepare('UPDATE DETALLE_CONTRATO SET cantidad = ? WHERE id = ?')
              .run(restante, detalle.id_detalle);

            db.prepare(`
              INSERT INTO DETALLE_CONTRATO
                (id_contrato, tipo_item, id_item_granel, cantidad, precio_dia_aplicado, mora_dia_aplicada, estado_devolucion, fecha_devolucion_real)
              VALUES (?, 'granel', ?, ?, ?, ?, ?, ?)
            `).run(idContrato, detalle.id_item_granel, cantDevuelta,
              detalle.precio_dia_aplicado, detalle.mora_dia_aplicada,
              item.estado_devolucion, fechaDevolucionReal);
          } else {
            // Devolución completa
            db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?')
              .run(item.estado_devolucion, fechaDevolucionReal, detalle.id_detalle);
          }

          db.prepare('UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible + ? WHERE id = ?')
            .run(cantDevuelta, detalle.id_item_granel);

          // Mora para la porción devuelta (usando cantDevuelta, no detalle.cantidad)
          const diasAtrasoItem = Math.max(0, Math.ceil((fechaReal - fechaPactada) / (1000 * 60 * 60 * 24)));
          if (diasAtrasoItem > 0) {
            totalMora += diasAtrasoItem * detalle.precio_dia_aplicado * cantDevuelta;
          }
        } else {
          // Ítems individuales
          const diasAtrasoItem = Math.max(0, Math.ceil((fechaReal - fechaPactada) / (1000 * 60 * 60 * 24)));
          if (diasAtrasoItem > 0) {
            totalMora += diasAtrasoItem * detalle.precio_dia_aplicado * detalle.cantidad;
          }
        }
      }
    }

    // Determinar estado del contrato según ítems pendientes
    const pendientes = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND estado_devolucion = 'pendiente'"
    ).get(idContrato);

    const completado = pendientes.cnt === 0;
    if (completado) {
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_devolucion_real = ?, fecha_modificacion = datetime('now') WHERE id = ?")
        .run('devuelto', fechaDevolucionReal, idContrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_modificacion = datetime('now') WHERE id = ?")
        .run('devolución incompleta', idContrato);
    }

    return { totalMora, totalDanos, completado, pendientes: pendientes.cnt };
  });

  return ejecutar();
}

function getContratos(filtros = {}) {
  const hoy = new Date().toISOString().slice(0, 10);

  let sql = `
    SELECT DISTINCT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
           cl.telefono AS cliente_telefono,
      (SELECT COUNT(*) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS total_items,
      (SELECT SUM(precio_dia_aplicado * cantidad) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS subtotal_diario,
      (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = c.id AND tipo != 'deposito' AND (anulado IS NULL OR anulado = 0)) AS total_pagado,
      (SELECT COALESCE(SUM(CASE WHEN tipo = 'deposito' THEN monto WHEN tipo = 'devolucion_deposito' THEN -monto END), 0) FROM PAGO WHERE id_contrato = c.id AND tipo IN ('deposito', 'devolucion_deposito') AND (anulado IS NULL OR anulado = 0)) AS garantia_retenida
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

  sql += ` ORDER BY c.fecha_modificacion DESC`;

  const contratos = db.prepare(sql).all(...params);

  // Enriquecer con items y días de atraso
  return contratos.map(c => {
    const items = db.prepare(`
      SELECT d.*, COALESCE(h.nombre, i.nombre) AS item_nombre,
             COALESCE(h.id, 'MAT') AS item_codigo,
             i.condicion AS item_condicion
      FROM DETALLE_CONTRATO d
      LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
      LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
      WHERE d.id_contrato = ?
    `).all(c.id);

    const pagos = db.prepare(`
      SELECT id, monto, metodo, tipo, fecha_pago, anulado, fecha_anulacion, motivo_anulacion, id_detalle
      FROM PAGO WHERE id_contrato = ?
      ORDER BY fecha_pago ASC
    `).all(c.id);

    let total_atraso = 0;
    let max_dias_atraso = 0;

    const itemsConAtraso = items.map(item => {
      // Fecha pactada por ítem: si tiene fecha propia, usar esa; si no, la del contrato
      const fechaDevItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
      const diasItem = Math.max(1, Math.ceil(
        (new Date(fechaDevItem + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
      ) + 1);
      const totalItem = diasItem * item.precio_dia_aplicado * item.cantidad;
      // Fecha de referencia para atraso
      const fechaPactadaItem = new Date(fechaDevItem + 'T00:00:00');
      const refDate = item.fecha_devolucion_real
        ? new Date(item.fecha_devolucion_real + 'T00:00:00')
        : new Date(hoy + 'T00:00:00');
      const diasAtrasoItem = Math.max(0, Math.ceil((refDate - fechaPactadaItem) / 86400000));
      const montoAtrasoItem = diasAtrasoItem * item.precio_dia_aplicado * item.cantidad;

      if (diasAtrasoItem > max_dias_atraso) max_dias_atraso = diasAtrasoItem;
      total_atraso += montoAtrasoItem;

      // Pagos aplicados a este ítem específico (excluyendo anulados)
      const pagadoItem = db.prepare(
        "SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = ? AND id_detalle = ? AND (anulado IS NULL OR anulado = 0)"
      ).get(c.id, item.id)['COALESCE(SUM(monto), 0)'];
      const saldoItem = Math.max(0, totalItem + montoAtrasoItem - pagadoItem);

      return { ...item, dias_atraso_item: diasAtrasoItem, monto_atraso_item: montoAtrasoItem, dias_item: diasItem, total_item: totalItem, pagado_item: pagadoItem, saldo_item: saldoItem };
    });

    const totalContrato = itemsConAtraso.reduce((a, i) => a + i.total_item, 0) + (c.deposito_monto || 0);

    return { ...c, items: itemsConAtraso, pagos, dias_atraso: max_dias_atraso, total_atraso, total_contrato: totalContrato };
  });
}

/**
 * Registra un pago adicional para un contrato existente.
 *
 * @param {number} idContrato
 * @param {number} monto
 * @param {string} metodo - efectivo | yape | plin
 * @returns {{ id: number, monto: number, metodo: string }}
 */
function registrarPagoAdicional(idContrato, monto, metodo, tipo, idDetalle) {
  if (!idContrato || !monto || monto <= 0) {
    throw new Error('Datos de pago inválidos.');
  }

  const contrato = db.prepare('SELECT estado FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado === 'devuelto' || contrato.estado === 'cancelado') {
    throw new Error('El contrato ya está cerrado. No se pueden registrar pagos adicionales.');
  }

  const result = db.prepare(`
    INSERT INTO PAGO (id_contrato, monto, metodo, tipo, id_detalle)
    VALUES (?, ?, ?, ?, ?)
  `).run(idContrato, monto, metodo, tipo || 'saldo', idDetalle || null);

  return { id: result.lastInsertRowid, monto, metodo };
}

/**
 * Revierte la devolución de un ítem individual.
 * Restaura el detalle a 'pendiente', la herramienta a 'alquilado',
 * y elimina el registro de mantenimiento si estaba dañado.
 * Para granel, maneja tanto devolución completa como split parcial.
 */
function revertirDevolucionItem(idDetalle) {
  const detalle = db.prepare('SELECT * FROM DETALLE_CONTRATO WHERE id = ?').get(idDetalle);
  if (!detalle) throw new Error('Detalle no encontrado');

  const ejecutar = db.transaction(() => {
    if (detalle.tipo_item === 'individual') {
      if (detalle.estado_devolucion !== 'bien' && detalle.estado_devolucion !== 'dañado')
        throw new Error('El ítem no está en estado devuelto');

      db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = 'pendiente', fecha_devolucion_real = NULL WHERE id = ?")
        .run(idDetalle);

      db.prepare("UPDATE HERRAMIENTA SET estado = 'alquilado' WHERE id = ?")
        .run(detalle.id_herramienta);

      if (detalle.estado_devolucion === 'dañado') {
        db.prepare("DELETE FROM MANTENIMIENTO WHERE id_herramienta = ? AND fecha_inicio = ? AND tipo = 'correctivo' AND descripcion LIKE 'Devolucion:%'")
          .run(detalle.id_herramienta, detalle.fecha_devolucion_real);
      }
    } else if (detalle.tipo_item === 'granel') {
      const rowsDevueltas = db.prepare(`
        SELECT * FROM DETALLE_CONTRATO
        WHERE id_contrato = ? AND id_item_granel = ?
        AND estado_devolucion IN ('bien', 'dañado')
      `).all(detalle.id_contrato, detalle.id_item_granel);

      let cantidadARestaurar = 0;

      if (detalle.estado_devolucion === 'pendiente') {
        // CASO SPLIT: fila original reducida + fila(s) nueva(s) devuelta(s)
        for (const row of rowsDevueltas) {
          cantidadARestaurar += row.cantidad;
          db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id = ?').run(row.id);
        }
        db.prepare('UPDATE DETALLE_CONTRATO SET cantidad = cantidad + ? WHERE id = ?')
          .run(cantidadARestaurar, idDetalle);
      } else {
        // CASO DEVOLUCIÓN COMPLETA: la fila original misma fue devuelta
        cantidadARestaurar = detalle.cantidad;
        db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = 'pendiente', fecha_devolucion_real = NULL WHERE id = ?")
          .run(idDetalle);
      }

      db.prepare('UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?')
        .run(cantidadARestaurar, detalle.id_item_granel);
    }

    // Recalcular estado del contrato (CHECK: 'reservado','alquilado','devuelto','devolución incompleta')
    const totalItems = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ?"
    ).get(detalle.id_contrato);

    const pendientes = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND estado_devolucion = 'pendiente'"
    ).get(detalle.id_contrato);

    const hayDevueltos = (totalItems.cnt - pendientes.cnt) > 0;

    if (hayDevueltos) {
      db.prepare("UPDATE CONTRATO SET estado = 'devolución incompleta', fecha_modificacion = datetime('now') WHERE id = ?")
        .run(detalle.id_contrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = 'alquilado', fecha_devolucion_real = NULL, fecha_modificacion = datetime('now') WHERE id = ?")
        .run(detalle.id_contrato);
    }

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Anula un pago registrado, marcándolo como anulado.
 * No elimina el registro, solo lo desactiva lógicamente.
 * Al anular, los totales se recalculan automáticamente en getContratos.
 *
 * @param {number} idPago
 * @param {string} [motivo]
 */
function anularPago(idPago, motivo) {
  const pago = db.prepare('SELECT * FROM PAGO WHERE id = ?').get(idPago);
  if (!pago) throw new Error('Pago no encontrado.');
  if (pago.anulado) throw new Error('El pago ya está anulado.');

  db.prepare(`
    UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now'), motivo_anulacion = ?
    WHERE id = ?
  `).run(motivo || null, idPago);

  return { id: idPago, anulado: true };
}

module.exports = { crearContrato, registrarDevolucion, getContratos, registrarPagoAdicional, revertirDevolucionItem, anularPago };
