const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const LOG_FILE = path.join(os.tmpdir(), 'sistema-alquiler-debug.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
  console.log(msg);
}

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
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
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
    const granelAccum = {};

    for (const item of itemsDevueltos) {
      const detalle = db.prepare('SELECT * FROM DETALLE_CONTRATO WHERE id = ? AND id_contrato = ?').get(item.id_detalle, idContrato);
      if (!detalle) throw new Error('Detalle de contrato no encontrado: ' + item.id_detalle);
      log('[DEBUG registrarDevolucion] item.id_detalle=' + item.id_detalle + ' detalle.id=' + detalle.id + ' tipo_item=' + detalle.tipo_item + ' estado=' + detalle.estado_devolucion + ' id_item_granel=' + detalle.id_item_granel + ' cantidad=' + detalle.cantidad);

      // Si el item individual ya está en 'dañado' y se envía nuevo costo, actualizar MANTENIMIENTO
      if (detalle.tipo_item === 'individual' && detalle.estado_devolucion === 'dañado' && item.estado_devolucion === 'dañado') {
        log('[DIAG registrarDevolucion] RE-SAVE dañado id_detalle=' + item.id_detalle + ' costo=' + item.costo_reparacion);
        if (item.costo_reparacion) {
          const desc = observaciones?.[item.id_detalle] || '';
          db.prepare(`
            UPDATE MANTENIMIENTO SET costo = ?, descripcion = ?
            WHERE id_herramienta = ? AND fecha_fin IS NULL AND tipo = 'correctivo'
            ORDER BY id DESC LIMIT 1
          `).run(item.costo_reparacion, 'Devolucion: ' + desc, detalle.id_herramienta);
          totalDanos = (totalDanos || 0) + item.costo_reparacion;
        }
        continue;
      }

      // Saltar ítems ya procesados en devoluciones parciales previas
      // Granel: permitir siempre aunque tenga estado histórico distinto de 'pendiente' (datos pre-migración)
      if (detalle.tipo_item !== 'granel' && detalle.estado_devolucion !== 'pendiente') {
        log('[DIAG registrarDevolucion] SKIP ya procesado id_detalle=' + item.id_detalle + ' estado=' + detalle.estado_devolucion);
        continue;
      }

      const esDevuelto = item.estado_devolucion === 'bien' || item.estado_devolucion === 'dañado' || item.estado_devolucion === 'perdido';

      if (esDevuelto) {
        if (detalle.tipo_item === 'individual') {
          // Actualizar estado y fecha del detalle solo para items individuales
          log('[DIAG registrarDevolucion] ANTES UPDATE id_detalle=' + item.id_detalle + ' estado_devolucion=' + detalle.estado_devolucion);
          db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?')
            .run(item.estado_devolucion, fechaDevolucionReal, item.id_detalle);
          const despues = db.prepare('SELECT estado_devolucion, fecha_devolucion_real FROM DETALLE_CONTRATO WHERE id = ?').get(item.id_detalle);
          log('[DIAG registrarDevolucion] DESPUES UPDATE id_detalle=' + item.id_detalle + ' estado_devolucion=' + (despues?.estado_devolucion) + ' fecha=' + (despues?.fecha_devolucion_real));

          const nuevoEstado = item.estado_devolucion === 'dañado' ? 'mantenimiento' : 'disponible';
          db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(nuevoEstado, detalle.id_herramienta);

          if (item.estado_devolucion === 'dañado') {
            totalDanos += item.costo_reparacion || 0;
            const hoy = new Date().toISOString().slice(0, 10);
            const desc = observaciones?.[item.id_detalle] || 'Dañado en devolución';
            db.prepare('INSERT INTO MANTENIMIENTO (id_herramienta, fecha_inicio, descripcion, tipo, costo) VALUES (?, ?, ?, ?, ?)')
              .run(detalle.id_herramienta, hoy, 'Devolucion: ' + desc, 'correctivo', item.costo_reparacion || 0);
          }

          // Mora individual
          const diasAtrasoInd = Math.max(0, Math.ceil((fechaReal - fechaPactada) / (1000 * 60 * 60 * 24)));
          if (diasAtrasoInd > 0) {
            totalMora += diasAtrasoInd * detalle.precio_dia_aplicado * detalle.cantidad;
          }
        } else if (detalle.tipo_item === 'granel') {
          log('[DEBUG registrarDevolucion] ENTRANDO granel branch, id_detalle: ' + item.id_detalle + ' estado_devolucion: ' + item.estado_devolucion + ' cantidad_devuelta: ' + (item.cantidad_devuelta ?? 'N/A') + ' detalle.cantidad: ' + detalle.cantidad);
          // Granel: NO se actualiza estado_devolucion del DETALLE_CONTRATO
          // Se acumulan outcomes y se insertan en DEVOLUCION_GRANEL después del loop
          // Acumular outcomes del mismo detalle para insertar en DEVOLUCION_GRANEL
          if (!granelAccum[item.id_detalle]) {
            granelAccum[item.id_detalle] = {
              id_item_granel: detalle.id_item_granel,
              precio: detalle.precio_dia_aplicado,
              bien: 0,
              danada: 0,
              perdida: 0,
              costo_reparacion: 0,
              costo_perdida: null,
            };
          }
          const acc = granelAccum[item.id_detalle];
          const cant = item.cantidad_devuelta || detalle.cantidad;
          if (item.estado_devolucion === 'bien') {
            acc.bien += cant;
          } else if (item.estado_devolucion === 'dañado') {
            acc.danada += cant;
            acc.costo_reparacion += (item.costo_reparacion || 0);
          } else if (item.estado_devolucion === 'perdido') {
            acc.perdida += cant;
            acc.costo_perdida = item.costo_perdida != null ? item.costo_perdida : null;
          }
        }
      }
    }

    log('[DEBUG registrarDevolucion] granelAccum DESPUES del for-loop: ' + JSON.stringify(granelAccum) + ' entries: ' + Object.keys(granelAccum).length);

    // Procesar outcomes acumulados de granel en DEVOLUCION_GRANEL
    for (const [idDetalle, acc] of Object.entries(granelAccum)) {
      log('[DEBUG registrarDevolucion] ITERANDO granelAccum idDetalle=' + idDetalle + ' bien=' + acc.bien + ' danada=' + acc.danada + ' perdida=' + acc.perdida);
      const totalDevuelto = acc.bien + acc.danada + acc.perdida;
      if (totalDevuelto <= 0) continue;

      const detalle = db.prepare('SELECT * FROM DETALLE_CONTRATO WHERE id = ?').get(Number(idDetalle));
      if (!detalle) continue;

      const insertResult = db.prepare(`
        INSERT INTO DEVOLUCION_GRANEL (id_contrato, id_item_granel, id_detalle, fecha, cantidad_bien, cantidad_danada, cantidad_perdida, costo_reparacion, costo_perdida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(idContrato, acc.id_item_granel, Number(idDetalle), fechaDevolucionReal, acc.bien, acc.danada, acc.perdida,
        acc.costo_reparacion || null, acc.costo_perdida);
      log('[DEBUG registrarDevolucion] INSERT DEVOLUCION_GRANEL: ' + JSON.stringify({ idContrato, idItemGranel: acc.id_item_granel, bien: acc.bien, danada: acc.danada, perdida: acc.perdida, lastInsertRowid: insertResult.lastInsertRowid }));

      // Stock
      if (acc.bien > 0) {
        db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?) WHERE id = ?')
          .run(acc.bien, acc.id_item_granel);
      }
      if (acc.danada > 0) {
        db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?), cantidad_danada = cantidad_danada + ? WHERE id = ?')
          .run(acc.danada, acc.danada, acc.id_item_granel);
        totalDanos += acc.costo_reparacion;
      }
      if (acc.perdida > 0) {
        db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?), cantidad_perdida = cantidad_perdida + ? WHERE id = ?')
          .run(acc.perdida, acc.perdida, acc.id_item_granel);
      }

      // Mora sobre el total devuelto en este evento
      const diasAtrasoItem = Math.max(0, Math.ceil((fechaReal - fechaPactada) / (1000 * 60 * 60 * 24)));
      if (diasAtrasoItem > 0) {
        totalMora += diasAtrasoItem * acc.precio * totalDevuelto;
      }
    }

    // Determinar estado del contrato: individuales por estado_devolucion, granel por DEVOLUCION_GRANEL
    const individualesPendientes = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'individual' AND estado_devolucion = 'pendiente'"
    ).get(idContrato);

    const granelPendientes = db.prepare(`
      SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO d
      WHERE d.id_contrato = ? AND d.tipo_item = 'granel'
      AND d.cantidad > (
        SELECT COALESCE(SUM(dg.cantidad_bien + dg.cantidad_danada + dg.cantidad_perdida), 0)
        FROM DEVOLUCION_GRANEL dg
        WHERE dg.id_contrato = d.id_contrato
        AND dg.id_item_granel = d.id_item_granel
        AND dg.revertido = 0
      )
    `).get(idContrato);

    const completado = (individualesPendientes.cnt + granelPendientes.cnt) === 0;
    if (completado) {
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_devolucion_real = ?, fecha_modificacion = datetime('now') WHERE id = ?")
        .run('devuelto', fechaDevolucionReal, idContrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_modificacion = datetime('now') WHERE id = ?")
        .run('devolución incompleta', idContrato);
    }

    const resultado = { totalMora, totalDanos, completado, pendientes: individualesPendientes.cnt + granelPendientes.cnt };
    log('[DIAG registrarDevolucion] TRANSACCION RESULTADO: ' + JSON.stringify(resultado));
    return resultado;
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
             i.condicion AS item_condicion,
             i.precio_venta AS item_precio_venta
      FROM DETALLE_CONTRATO d
      LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
      LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
      WHERE d.id_contrato = ?
    `).all(c.id);

    // Devolución granel: resumen por id_detalle (nuevos) y por id_item_granel (legacy sin id_detalle)
    const devGranel = db.prepare(`
      SELECT group_key, total_bien, total_danada, total_perdida, total_costo_reparacion, total_costo_perdida FROM (
        SELECT 'detalle_' || id_detalle AS group_key,
               COALESCE(SUM(cantidad_bien), 0) AS total_bien,
               COALESCE(SUM(cantidad_danada), 0) AS total_danada,
               COALESCE(SUM(cantidad_perdida), 0) AS total_perdida,
               COALESCE(SUM(costo_reparacion), 0) AS total_costo_reparacion,
               COALESCE(SUM(costo_perdida), 0) AS total_costo_perdida
        FROM DEVOLUCION_GRANEL
        WHERE id_contrato = ? AND revertido = 0 AND id_detalle IS NOT NULL
        GROUP BY id_detalle
        UNION ALL
        SELECT 'granel_' || id_item_granel AS group_key,
               COALESCE(SUM(cantidad_bien), 0) AS total_bien,
               COALESCE(SUM(cantidad_danada), 0) AS total_danada,
               COALESCE(SUM(cantidad_perdida), 0) AS total_perdida,
               COALESCE(SUM(costo_reparacion), 0) AS total_costo_reparacion,
               COALESCE(SUM(costo_perdida), 0) AS total_costo_perdida
        FROM DEVOLUCION_GRANEL
        WHERE id_contrato = ? AND revertido = 0 AND id_detalle IS NULL
        GROUP BY id_item_granel
      )
    `).all(c.id, c.id);
    log('[DEBUG getContratos] contratoId: ' + c.id + ' devGranel: ' + JSON.stringify(devGranel) + ' items: ' + JSON.stringify(items.map(i => ({ id: i.id, id_item_granel: i.id_item_granel, cantidad: i.cantidad }))));
    const devGranelMap = Object.fromEntries(devGranel.map(d => [d.group_key, d]));

    const pagos = db.prepare(`
      SELECT id, monto, metodo, tipo, fecha_pago, anulado, fecha_anulacion, motivo_anulacion, id_detalle, grupo_pago
      FROM PAGO WHERE id_contrato = ?
      ORDER BY fecha_pago DESC
    `).all(c.id);

    let total_atraso = 0;
    let max_dias_atraso = 0;

    const itemsConAtraso = items.map(item => {
      // Enriquecer granel con resumen de DEVOLUCION_GRANEL
      if (item.id_item_granel) {
        const dev = devGranelMap['detalle_' + item.id] || devGranelMap['granel_' + item.id_item_granel] || { total_bien: 0, total_danada: 0, total_perdida: 0, total_costo_reparacion: 0, total_costo_perdida: 0 };
        item.granel_dev_bien = dev.total_bien;
        item.granel_dev_danada = dev.total_danada;
        item.granel_dev_perdida = dev.total_perdida;
        item.granel_pendiente = Math.max(0, item.cantidad - dev.total_bien - dev.total_danada - dev.total_perdida);
        item.granel_dev_costo_reparacion = dev.total_costo_reparacion || 0;
        item.granel_dev_costo_perdida = dev.total_costo_perdida || 0;
      }
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

    const total_danos = itemsConAtraso.reduce((a, i) => a + (i.granel_dev_costo_reparacion || 0), 0)
      + (db.prepare(`
        SELECT COALESCE(SUM(m.costo), 0) AS total
        FROM MANTENIMIENTO m
        JOIN DETALLE_CONTRATO d ON d.id_herramienta = m.id_herramienta
        WHERE d.id_contrato = ? AND d.tipo_item = 'individual' AND d.estado_devolucion = 'dañado'
      `).get(c.id)?.total || 0);
    const total_perdidas = itemsConAtraso.reduce((a, i) => a + (i.granel_dev_costo_perdida || 0), 0);

    return { ...c, items: itemsConAtraso, pagos, dias_atraso: max_dias_atraso, total_atraso, total_contrato: totalContrato, total_danos, total_perdidas };
  });
}

/**
 * Distribuye un pago general en cascada a los ítems del contrato.
 * Cada ítem recibe una porción del pago hasta cubrir su saldo,
 * y se crea un PAGO por ítem con el mismo grupo_pago (UUID).
 */
function distribuirPagoItems(idContrato, monto, metodo, tipo) {
  const hoy = new Date().toISOString().slice(0, 10);
  const c = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!c) throw new Error('Contrato no encontrado.');

  const items = db.prepare(`
    SELECT d.*,
      (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = ? AND id_detalle = d.id AND (anulado IS NULL OR anulado = 0)) AS pagado_item
    FROM DETALLE_CONTRATO d WHERE d.id_contrato = ?
    ORDER BY d.id ASC
  `).all(idContrato, idContrato);

  // Calcular saldo por ítem (misma lógica que getContratos)
  const itemsConSaldo = items.map(item => {
    const fechaDevItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
    const diasItem = Math.max(1, Math.ceil(
      (new Date(fechaDevItem + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
    ) + 1);
    const totalItem = diasItem * item.precio_dia_aplicado * item.cantidad;
    const fechaPactadaItem = new Date(fechaDevItem + 'T00:00:00');
    const refDate = item.fecha_devolucion_real
      ? new Date(item.fecha_devolucion_real + 'T00:00:00')
      : new Date(hoy + 'T00:00:00');
    const diasAtrasoItem = Math.max(0, Math.ceil((refDate - fechaPactadaItem) / 86400000));
    const montoAtrasoItem = diasAtrasoItem * item.precio_dia_aplicado * item.cantidad;
    const saldo = Math.max(0, totalItem + montoAtrasoItem - (item.pagado_item || 0));
    return { ...item, saldo };
  }).filter(i => i.saldo > 0);

  if (itemsConSaldo.length === 0) {
    throw new Error('No hay items con saldo pendiente.');
  }

  const totalPendiente = itemsConSaldo.reduce((a, i) => a + i.saldo, 0);
  if (monto > totalPendiente) {
    throw new Error('El monto excede el saldo total pendiente (S/ ' + totalPendiente.toFixed(2) + ').');
  }

  const grupoPago = require('crypto').randomUUID();
  let restante = monto;
  const ids = [];

  const ejecutar = db.transaction(() => {
    for (const item of itemsConSaldo) {
      if (restante <= 0) break;
      const take = Math.min(restante, item.saldo);
      const r = db.prepare(`
        INSERT INTO PAGO (id_contrato, monto, metodo, tipo, id_detalle, grupo_pago)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(idContrato, take, metodo, tipo || 'saldo', item.id, grupoPago);
      ids.push(r.lastInsertRowid);
      restante -= take;
    }
  });

  ejecutar();
  return { ids, grupo: grupoPago, monto: monto - restante };
}

/**
 * Registra un pago adicional para un contrato existente.
 * Si se proporciona idDetalle, el pago se aplica directamente a ese ítem.
 * Si no, se distribuye en cascada a todos los items con saldo pendiente.
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

  if (idDetalle) {
    // Pago directo a un ítem específico
    const result = db.prepare(`
      INSERT INTO PAGO (id_contrato, monto, metodo, tipo, id_detalle)
      VALUES (?, ?, ?, ?, ?)
    `).run(idContrato, monto, metodo, tipo || 'saldo', idDetalle);
    return { id: result.lastInsertRowid, monto, metodo };
  }

  // Pago general: distribuir en cascada a los ítems
  return distribuirPagoItems(idContrato, monto, metodo, tipo);
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
        AND estado_devolucion IN ('bien', 'dañado', 'perdido')
      `).all(detalle.id_contrato, detalle.id_item_granel);

      let cantidadARestaurar = 0;
      let tieneDanadosOPerdidos = false;

      if (detalle.estado_devolucion === 'pendiente') {
        // CASO SPLIT: fila original reducida + fila(s) nueva(s) devuelta(s)
        for (const row of rowsDevueltas) {
          cantidadARestaurar += row.cantidad;
          // Revertir stock según estado
          if (row.estado_devolucion === 'bien') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, detalle.id_item_granel);
          } else if (row.estado_devolucion === 'dañado') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_danada = MAX(0, cantidad_danada - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, row.cantidad, detalle.id_item_granel);
            tieneDanadosOPerdidos = true;
          } else if (row.estado_devolucion === 'perdido') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_perdida = MAX(0, cantidad_perdida - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, row.cantidad, detalle.id_item_granel);
            tieneDanadosOPerdidos = true;
          }
          db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id = ?').run(row.id);
        }
        db.prepare('UPDATE DETALLE_CONTRATO SET cantidad = cantidad + ? WHERE id = ?')
          .run(cantidadARestaurar, idDetalle);
      } else {
        // CASO DEVOLUCIÓN COMPLETA: la fila original misma fue devuelta
        // También limpiar posibles split rows creados en la misma devolución multi-outcome
        const splitRows = db.prepare(`
          SELECT * FROM DETALLE_CONTRATO
          WHERE id_contrato = ? AND id_item_granel = ?
          AND estado_devolucion IN ('bien', 'dañado', 'perdido')
          AND id != ?
        `).all(detalle.id_contrato, detalle.id_item_granel, idDetalle);

        let totalSplit = 0;
        for (const row of splitRows) {
          totalSplit += row.cantidad;
          if (row.estado_devolucion === 'bien') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, detalle.id_item_granel);
          } else if (row.estado_devolucion === 'dañado') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_danada = MAX(0, cantidad_danada - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, row.cantidad, detalle.id_item_granel);
          } else if (row.estado_devolucion === 'perdido') {
            db.prepare('UPDATE ITEM_GRANEL SET cantidad_perdida = MAX(0, cantidad_perdida - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
              .run(row.cantidad, row.cantidad, detalle.id_item_granel);
          }
          db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id = ?').run(row.id);
        }

        cantidadARestaurar = detalle.cantidad + totalSplit;
        if (detalle.estado_devolucion === 'bien') {
          db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
            .run(cantidadARestaurar, detalle.id_item_granel);
        } else if (detalle.estado_devolucion === 'dañado') {
          db.prepare('UPDATE ITEM_GRANEL SET cantidad_danada = MAX(0, cantidad_danada - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
            .run(cantidadARestaurar, cantidadARestaurar, detalle.id_item_granel);
        } else if (detalle.estado_devolucion === 'perdido') {
          db.prepare('UPDATE ITEM_GRANEL SET cantidad_perdida = MAX(0, cantidad_perdida - ?), cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
            .run(cantidadARestaurar, cantidadARestaurar, detalle.id_item_granel);
        }
        db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = 'pendiente', fecha_devolucion_real = NULL, costo_perdida = NULL WHERE id = ?")
          .run(idDetalle);
      }

      // Nota: granel no registra en MANTENIMIENTO, el daño se gestiona via cantidad_danada en ITEM_GRANEL
    }

    // Recalcular estado del contrato (individual por estado_devolucion, granel por DEVOLUCION_GRANEL)
    const individualesPendientes = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'individual' AND estado_devolucion = 'pendiente'"
    ).get(detalle.id_contrato);

    const granelPendientes = db.prepare(`
      SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO d
      WHERE d.id_contrato = ? AND d.tipo_item = 'granel'
      AND d.cantidad > (
        SELECT COALESCE(SUM(dg.cantidad_bien + dg.cantidad_danada + dg.cantidad_perdida), 0)
        FROM DEVOLUCION_GRANEL dg
        WHERE dg.id_contrato = d.id_contrato
        AND dg.id_item_granel = d.id_item_granel
        AND dg.revertido = 0
      )
    `).get(detalle.id_contrato);

    const hayPendientes = (individualesPendientes.cnt + granelPendientes.cnt) > 0;

    if (hayPendientes) {
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
 * Obtiene el historial de DEVOLUCION_GRANEL para un contrato y (opcional) ítem granel específico.
 * Útil para mostrar el acordeón de historial por ítem en la UI.
 */
function getDevolucionesGranel(contratoId, itemGranelId) {
  let sql = `
    SELECT dg.*
    FROM DEVOLUCION_GRANEL dg
    WHERE dg.id_contrato = ? AND dg.revertido = 0
  `;
  const params = [contratoId];
  if (itemGranelId) {
    sql += ' AND dg.id_item_granel = ?';
    params.push(itemGranelId);
  }
  sql += ' ORDER BY dg.fecha DESC, dg.id DESC';
  const result = db.prepare(sql).all(...params);
  log('[DEBUG getDevolucionesGranel] contratoId: ' + contratoId + ' itemGranelId: ' + itemGranelId + ' rows: ' + result.length + ' data: ' + JSON.stringify(result));
  return result;
}

/**
 * Revierte una entrada específica de DEVOLUCION_GRANEL.
 * Restaura el stock y marca la entrada como revertida.
 */
function revertirDevolucionGranel(idDevolucionGranel) {
  const entry = db.prepare('SELECT * FROM DEVOLUCION_GRANEL WHERE id = ?').get(idDevolucionGranel);
  if (!entry) throw new Error('Entrada de devolución no encontrada.');
  if (entry.revertido) throw new Error('La devolución ya fue revertida.');

  const ejecutar = db.transaction(() => {
    // Revertir stock
    const total = entry.cantidad_bien + entry.cantidad_danada + entry.cantidad_perdida;
    if (total > 0) {
      db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?')
        .run(total, entry.id_item_granel);
    }
    if (entry.cantidad_danada > 0) {
      db.prepare('UPDATE ITEM_GRANEL SET cantidad_danada = MAX(0, cantidad_danada - ?) WHERE id = ?')
        .run(entry.cantidad_danada, entry.id_item_granel);
    }
    if (entry.cantidad_perdida > 0) {
      db.prepare('UPDATE ITEM_GRANEL SET cantidad_perdida = MAX(0, cantidad_perdida - ?) WHERE id = ?')
        .run(entry.cantidad_perdida, entry.id_item_granel);
    }

    // Marcar como revertida
    db.prepare('UPDATE DEVOLUCION_GRANEL SET revertido = 1 WHERE id = ?')
      .run(idDevolucionGranel);

    // Recalcular estado del contrato
    const individualesPendientes = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'individual' AND estado_devolucion = 'pendiente'"
    ).get(entry.id_contrato);

    const granelPendientes = db.prepare(`
      SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO d
      WHERE d.id_contrato = ? AND d.tipo_item = 'granel'
      AND d.cantidad > (
        SELECT COALESCE(SUM(dg.cantidad_bien + dg.cantidad_danada + dg.cantidad_perdida), 0)
        FROM DEVOLUCION_GRANEL dg
        WHERE dg.id_contrato = d.id_contrato
        AND dg.id_item_granel = d.id_item_granel
        AND dg.revertido = 0
      )
    `).get(entry.id_contrato);

    const hayPendientes = (individualesPendientes.cnt + granelPendientes.cnt) > 0;

    if (hayPendientes) {
      db.prepare("UPDATE CONTRATO SET estado = 'devolución incompleta', fecha_modificacion = datetime('now') WHERE id = ?")
        .run(entry.id_contrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = 'devuelto', fecha_modificacion = datetime('now') WHERE id = ?")
        .run(entry.id_contrato);
    }
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

  if (pago.grupo_pago) {
    // Anular todo el grupo de pagos distribuidos
    const ids = db.prepare(
      "SELECT id FROM PAGO WHERE grupo_pago = ? AND (anulado IS NULL OR anulado = 0)"
    ).all(pago.grupo_pago).map(r => r.id);

    if (ids.length === 0) throw new Error('No se encontraron pagos activos en el grupo.');

    const ejecutar = db.transaction(() => {
      for (const id of ids) {
        db.prepare(`
          UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now'), motivo_anulacion = ?
          WHERE id = ?
        `).run(motivo || null, id);
      }
    });
    ejecutar();
    return { ids, anulado: true };
  }

  // Pago individual (per-item o depósito directo)
  db.prepare(`
    UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now'), motivo_anulacion = ?
    WHERE id = ?
  `).run(motivo || null, idPago);

  return { id: idPago, anulado: true };
}

module.exports = { crearContrato, registrarDevolucion, getContratos, registrarPagoAdicional, revertirDevolucionItem, revertirDevolucionGranel, getDevolucionesGranel, anularPago };
