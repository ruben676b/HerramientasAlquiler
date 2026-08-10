const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { localDate, localDateTime } = require('../utils/date');
const { adjuntarEtiquetasPorCliente } = require('./clienteService');

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
function _validarHerramientasSinReservaActiva(items) {
  const hoy = localDate();
  for (const item of items) {
    if (item.tipo_item === 'individual' && item.id_herramienta) {
      const reservaActiva = db.prepare(`
        SELECT c.id FROM CONTRATO c
        JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
        WHERE d.id_herramienta = ? AND c.estado = 'reservado' AND c.fecha_reserva >= ?
      `).get(item.id_herramienta, hoy);
      if (reservaActiva) {
        throw new Error(
          'La herramienta ' + item.id_herramienta +
          ' tiene una reserva activa (contrato #' + reservaActiva.id + ').'
        );
      }
    }
  }
}

function _autoCrearCliente(idCliente, dniCliente, nombreCliente, telefonoCliente) {
  let idClienteReal = idCliente;
  if (!idClienteReal || idClienteReal < 1) {
    if (dniCliente && dniCliente.length === 8) {
      const existente = db.prepare('SELECT id FROM CLIENTE WHERE dni = ?').get(dniCliente);
      if (existente) {
        idClienteReal = existente.id;
      }
    }
    if (!idClienteReal && nombreCliente) {
      const r = db.prepare('INSERT INTO CLIENTE (tipo, nombre, dni, telefono, fecha_registro) VALUES (?, ?, ?, ?, date(\'now\', \'localtime\'))')
        .run('persona', nombreCliente, dniCliente || null, telefonoCliente || null);
      idClienteReal = r.lastInsertRowid;
    }
  }
  if (!idClienteReal || idClienteReal < 1) {
    throw new Error('No se pudo identificar al cliente. Ingrese DNI o nombre.');
  }
  return idClienteReal;
}

function _insertarPagos(idContrato, pagos) {
  if (pagos && pagos.length > 0) {
    const insertPago = db.prepare(`
      INSERT INTO PAGO (id_contrato, monto, metodo, tipo, fecha_pago)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `);
    for (const p of pagos) {
      insertPago.run(idContrato, p.monto, p.metodo, p.tipo || 'saldo');
    }
  }
}

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

  const idClienteReal = _autoCrearCliente(idCliente, dniCliente, nombreCliente, telefonoCliente);

  _validarHerramientasSinReservaActiva(items);

  const ejecutar = db.transaction(() => {
    const insertContrato = db.prepare(`
      INSERT INTO CONTRATO (
        id_cliente, id_usuario, fecha_salida, fecha_devolucion_pactada,
        deposito_monto, deposito_dni, fecha_creacion, fecha_modificacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel, id_kit,
        cantidad, precio_dia_aplicado,
        fecha_devolucion_pactada_item, total_item_snapshot, tarifa_aplicada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const resultado = insertContrato.run(
      idClienteReal,
      idUsuario,
      fechaSalida,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni,
      localDateTime(),
      localDateTime()
    );

    const idContrato = resultado.lastInsertRowid;

    for (const item of items) {
      if (item.tipo_item === 'individual') {
        const herramienta = db
          .prepare(
            'SELECT precio_dia, estado FROM HERRAMIENTA WHERE id = ? AND activo = 1'
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
          null,
          1,
          item.precio_aplicado != null ? item.precio_aplicado : herramienta.precio_dia,
          fechaDevItem,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
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
            'SELECT precio_dia, cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1'
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
          null,
          item.cantidad,
          item.precio_aplicado != null ? item.precio_aplicado : granel.precio_dia,
          fechaDevItemG,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
        );

        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      } else if (item.tipo_item === 'kit') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para kits debe ser al menos 1.');
        }

        const kit = db
          .prepare(
            'SELECT precio_dia, nombre FROM KIT WHERE id = ? AND activo = 1'
          )
          .get(item.id_kit);

        if (!kit) {
          throw new Error('Kit no encontrado o inactivo: ' + item.id_kit);
        }

        const componentes = db
          .prepare('SELECT * FROM KIT_COMPONENTE WHERE id_kit = ?')
          .all(item.id_kit);

        if (componentes.length === 0) {
          throw new Error(
            'El kit ' + kit.nombre + ' no tiene componentes configurados.'
          );
        }

        // Línea padre del kit (precio real, se factura)
        insertDetalle.run(
          idContrato,
          'kit',
          null,
          null,
          item.id_kit,
          item.cantidad,
          item.precio_aplicado != null ? item.precio_aplicado : kit.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
        );

        // Líneas hijas: componentes del kit (precio 0, controlan stock/devolución)
        for (const comp of componentes) {
          if (comp.tipo_item === 'granel') {
            const granelC = db
              .prepare(
                'SELECT cantidad_disponible, nombre FROM ITEM_GRANEL WHERE id = ? AND activo = 1'
              )
              .get(comp.id_item_granel);
            if (!granelC) {
              throw new Error(
                'Componente granel del kit no encontrado o inactivo: ' + comp.id_item_granel
              );
            }
            const necesario = comp.cantidad * item.cantidad;
            if (granelC.cantidad_disponible < necesario) {
              throw new Error(
                'Stock insuficiente de ' + granelC.nombre + ' para el kit ' + kit.nombre +
                  '. Disponible: ' + granelC.cantidad_disponible + ', necesario: ' + necesario
              );
            }
            insertDetalle.run(
              idContrato,
              'granel',
              null,
              comp.id_item_granel,
              item.id_kit,
              necesario,
              0,
              null,
              null,
              'dia'
            );
            db.prepare(
              'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
            ).run(necesario, comp.id_item_granel);
          } else if (comp.tipo_item === 'individual') {
            const herrC = db
              .prepare('SELECT estado, nombre FROM HERRAMIENTA WHERE id = ? AND activo = 1')
              .get(comp.id_herramienta);
            if (!herrC) {
              throw new Error(
                'Componente del kit no encontrado o inactivo: ' + comp.id_herramienta
              );
            }
            if (herrC.estado !== 'disponible') {
              throw new Error(
                'La herramienta ' + herrC.nombre + ' del kit ' + kit.nombre +
                  ' no está disponible (estado: ' + herrC.estado + ').'
              );
            }
            insertDetalle.run(
              idContrato,
              'individual',
              comp.id_herramienta,
              null,
              item.id_kit,
              1,
              0,
              null,
              null,
              'dia'
            );
            db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(
              'alquilado',
              comp.id_herramienta
            );
          }
        }
      }
    }

    _insertarPagos(idContrato, pagos);

    return { idContrato };
  });

  return ejecutar();
}

/**
 * Crea una reserva con estado 'reservado'.
 * Las herramientas individuales NO cambian de estado (permanecen 'disponible').
 * Los ítems a granel incrementan cantidad_alquilada para reservar el stock.
 *
 * @param {number} idCliente
 * @param {number} idUsuario
 * @param {string} fechaReserva         - fecha en que el cliente vendrá a recoger (YYYY-MM-DD)
 * @param {string} fechaDevolucionPactada
 * @param {number} depositoMonto
 * @param {number} depositoDni
 * @param {Array}  items
 * @param {Array}  pagos
 * @param {string} dniCliente
 * @param {string} nombreCliente
 * @param {string} telefonoCliente
 * @returns {{ idContrato: number }}
 */
function crearReserva(
  idCliente,
  idUsuario,
  fechaReserva,
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
    throw new Error('La reserva debe contener al menos un ítem.');
  }

  if (fechaDevolucionPactada < fechaReserva) {
    throw new Error('La fecha de devolución debe ser posterior a la fecha de reserva.');
  }

  const idClienteReal = _autoCrearCliente(idCliente, dniCliente, nombreCliente, telefonoCliente);

  const ejecutar = db.transaction(() => {
    const insertContrato = db.prepare(`
      INSERT INTO CONTRATO (
        id_cliente, id_usuario, fecha_salida, fecha_devolucion_pactada,
        deposito_monto, deposito_dni, estado, fecha_reserva,
        fecha_creacion, fecha_modificacion
      ) VALUES (?, ?, ?, ?, ?, ?, 'reservado', ?, ?, ?)
    `);

    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel,
        cantidad, precio_dia_aplicado,
        fecha_devolucion_pactada_item, total_item_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = localDateTime();

    const resultado = insertContrato.run(
      idClienteReal,
      idUsuario,
      fechaReserva,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni,
      fechaReserva,
      now,
      now
    );

    const idContrato = resultado.lastInsertRowid;

    for (const item of items) {
      if (item.tipo_item === 'individual') {
        const herramienta = db
          .prepare(
            'SELECT precio_dia, estado FROM HERRAMIENTA WHERE id = ? AND activo = 1'
          )
          .get(item.id_herramienta);

        if (!herramienta) {
          throw new Error('Herramienta no encontrada o inactiva: ' + item.id_herramienta);
        }
        if (herramienta.estado !== 'disponible') {
          throw new Error(
            'La herramienta ' + item.id_herramienta +
            ' no está disponible (estado: ' + herramienta.estado + ').'
          );
        }

        const reservaActiva = db.prepare(`
          SELECT c.id FROM CONTRATO c
          JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
          WHERE d.id_herramienta = ? AND c.estado = 'reservado' AND c.fecha_reserva >= date('now', 'localtime')
        `).get(item.id_herramienta);
        if (reservaActiva) {
          throw new Error('La herramienta ' + item.id_herramienta + ' ya está reservada.');
        }

        const fechaDevItem = item.fecha_devolucion_pactada || null;
        insertDetalle.run(
          idContrato,
          'individual',
          item.id_herramienta,
          null,
          1,
          herramienta.precio_dia,
          fechaDevItem,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
        );

        db.prepare("UPDATE HERRAMIENTA SET estado = 'reservado' WHERE id = ?")
          .run(item.id_herramienta);

      } else if (item.tipo_item === 'granel') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para ítems a granel debe ser al menos 1.');
        }

        const granel = db
          .prepare('SELECT precio_dia, cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1')
          .get(item.id_item_granel);

        if (!granel) {
          throw new Error('Ítem a granel no encontrado o inactivo: ' + item.id_item_granel);
        }
        if (granel.cantidad_disponible < item.cantidad) {
          throw new Error(
            'Stock insuficiente. Disponible: ' + granel.cantidad_disponible +
            ', solicitado: ' + item.cantidad
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
          fechaDevItemG,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
        );

        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      }
    }

    _insertarPagos(idContrato, pagos);

    return { idContrato };
  });

  return ejecutar();
}

/**
 * Convierte una reserva en un alquiler activo.
 * Cambia estado del contrato a 'alquilado'.
 * Herramientas individuales pasan a estado 'alquilado'.
 * Ítems a granel: ya tenían cantidad_alquilada, sin cambios.
 */
function convertirReserva(idContrato) {
  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado !== 'reservado') {
    throw new Error('Solo se pueden convertir contratos en estado reservado.');
  }

  const ejecutar = db.transaction(() => {
    db.prepare("UPDATE CONTRATO SET estado = 'alquilado', fecha_modificacion = ? WHERE id = ?")
      .run(localDateTime(), idContrato);

    const detalles = db.prepare(
      "SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'individual'"
    ).all(idContrato);

    for (const d of detalles) {
      db.prepare("UPDATE HERRAMIENTA SET estado = 'alquilado' WHERE id = ?")
        .run(d.id_herramienta);
    }

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Cancela una reserva (manual o automáticamente).
 * Cambia estado del contrato a 'cancelado'.
 * Herramientas individuales: vuelven a 'disponible'.
 * Ítems a granel: decrementa cantidad_alquilada para liberar stock.
 *
 * @param {number} idContrato
 * @param {boolean} [devolverAdelanto=false] - Si es true, los pagos de adelanto se revierten (anulan)
 */
function cancelarReserva(idContrato, devolverAdelanto = false) {
  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado !== 'reservado') {
    throw new Error('Solo se pueden cancelar contratos en estado reservado.');
  }

  const ejecutar = db.transaction(() => {
    db.prepare("UPDATE CONTRATO SET estado = 'cancelado', fecha_modificacion = ? WHERE id = ?")
      .run(localDateTime(), idContrato);

    const detallesGranel = db.prepare(
      "SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'granel'"
    ).all(idContrato);

    for (const d of detallesGranel) {
      db.prepare(
        'UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?) WHERE id = ?'
      ).run(d.cantidad, d.id_item_granel);
    }

    const detallesIndividuales = db.prepare(
      "SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'individual'"
    ).all(idContrato);

    for (const d of detallesIndividuales) {
      db.prepare("UPDATE HERRAMIENTA SET estado = 'disponible' WHERE id = ?")
        .run(d.id_herramienta);
    }

    if (devolverAdelanto) {
      db.prepare(`
        UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now', 'localtime'),
        motivo_anulacion = 'Cancelación manual de reserva'
        WHERE id_contrato = ? AND tipo IN ('adelanto') AND (anulado IS NULL OR anulado = 0)
      `).run(idContrato);
    }

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Cancela automáticamente las reservas cuya fecha_reserva ya pasó.
 * Se ejecuta al iniciar la aplicación.
 * @returns {{ procesadas: number }}
 */
function autoCancelarReservas() {
  const hoy = localDate();

  const reservasVencidas = db.prepare(
    "SELECT id FROM CONTRATO WHERE estado = 'reservado' AND fecha_reserva < ?"
  ).all(hoy);

  let procesadas = 0;
  for (const r of reservasVencidas) {
    try {
      cancelarReserva(r.id);
      procesadas++;
    } catch (e) {
      log('[autoCancelarReservas] Error cancelando reserva #' + r.id + ': ' + e.message);
    }
  }

  if (procesadas > 0) {
    log('[autoCancelarReservas] ' + procesadas + ' reserva(s) cancelada(s) automáticamente.');
  }

  return { procesadas };
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

      const esDevuelto = item.estado_devolucion === 'bien' || item.estado_devolucion === 'dañado' || item.estado_devolucion === 'perdido' || item.estado_devolucion === 'vendido';

      if (esDevuelto) {
        if (detalle.tipo_item === 'individual') {
          // Actualizar estado y fecha del detalle solo para items individuales
          log('[DIAG registrarDevolucion] ANTES UPDATE id_detalle=' + item.id_detalle + ' estado_devolucion=' + detalle.estado_devolucion);
          const esNoDevuelto = item.estado_devolucion === 'perdido' || item.estado_devolucion === 'vendido';
          if (esNoDevuelto) {
            // Perdido/vendido: registrar costo de reposición o precio de venta en el detalle
            db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ?, costo_perdida = ? WHERE id = ?')
              .run(item.estado_devolucion, fechaDevolucionReal, item.costo_perdida || 0, item.id_detalle);
          } else {
            db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?')
              .run(item.estado_devolucion, fechaDevolucionReal, item.id_detalle);
          }
          const despues = db.prepare('SELECT estado_devolucion, fecha_devolucion_real FROM DETALLE_CONTRATO WHERE id = ?').get(item.id_detalle);
          log('[DIAG registrarDevolucion] DESPUES UPDATE id_detalle=' + item.id_detalle + ' estado_devolucion=' + (despues?.estado_devolucion) + ' fecha=' + (despues?.fecha_devolucion_real));

          const nuevoEstado = item.estado_devolucion === 'dañado' ? 'malogrado'
            : item.estado_devolucion === 'perdido' ? 'perdida'
            : item.estado_devolucion === 'vendido' ? 'vendida'
            : 'disponible';
          db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(nuevoEstado, detalle.id_herramienta);

          if (item.estado_devolucion === 'dañado') {
            totalDanos += item.costo_reparacion || 0;
            const hoy = localDate();
            const desc = observaciones?.[item.id_detalle] || 'Dañado en devolución';
            db.prepare('INSERT INTO MANTENIMIENTO (id_herramienta, fecha_inicio, descripcion, tipo, costo, id_contrato) VALUES (?, ?, ?, ?, ?, ?)')
              .run(detalle.id_herramienta, hoy, 'Devolucion: ' + desc, 'correctivo', item.costo_reparacion || 0, idContrato);
            // Guardar desglose de daños predefinidos para individual
            if (item.danos && item.danos.length > 0) {
              const insertDanoInd = db.prepare(`
                INSERT INTO DAÑO_DEVOLUCION (id_contrato, id_detalle, tipo_item, id_herramienta, nombre, costo)
                VALUES (?, ?, 'individual', ?, ?, ?)
              `);
              for (const d of item.danos) {
                insertDanoInd.run(idContrato, item.id_detalle, detalle.id_herramienta, d.nombre, d.costo);
              }
            }
          } else if (esNoDevuelto) {
            // El costo (reposición o precio de venta) queda en DETALLE_CONTRATO.costo_perdida
            // y se suma al total del contrato vía getContratos/getDetalleContrato
            totalDanos += item.costo_perdida || 0;
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
              danos: [],
            };
          }
          const acc = granelAccum[item.id_detalle];
          const cant = item.cantidad_devuelta || detalle.cantidad;
          if (item.estado_devolucion === 'bien') {
            acc.bien += cant;
          } else if (item.estado_devolucion === 'dañado') {
            acc.danada += cant;
            acc.costo_reparacion += (item.costo_reparacion || 0);
            if (item.danos) acc.danos.push(...item.danos);
          } else if (item.estado_devolucion === 'perdido') {
            acc.perdida += cant;
            acc.costo_perdida = item.costo_perdida != null ? item.costo_perdida : null;
          }
        } else if (detalle.tipo_item === 'kit') {
          // Kit marcado explícitamente (perdido completo o devuelto completo en un solo gesto)
          totalDanos += procesarKitLinea(idContrato, detalle, item, fechaDevolucionReal);
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

      // Guardar desglose de daños predefinidos por cada fila de DEVOLUCION_GRANEL
      if (acc.danos && acc.danos.length > 0) {
        const insertDanoGr = db.prepare(`
          INSERT INTO DAÑO_DEVOLUCION (id_contrato, id_detalle, tipo_item, id_item_granel, nombre, costo, id_devolucion_granel)
          VALUES (?, ?, 'granel', ?, ?, ?, ?)
        `);
        for (const d of acc.danos) {
          insertDanoGr.run(idContrato, Number(idDetalle), acc.id_item_granel, d.nombre, d.costo, insertResult.lastInsertRowid);
        }
      }

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

    // Sincronizar líneas padre de kits con el estado de sus componentes
    recalcularKits(idContrato, fechaDevolucionReal);

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
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_devolucion_real = ?, fecha_modificacion = ? WHERE id = ?")
        .run('devuelto', fechaDevolucionReal, localDateTime(), idContrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = ?, fecha_modificacion = ? WHERE id = ?")
        .run('devolución incompleta', localDateTime(), idContrato);
    }

    const resultado = { totalMora, totalDanos, completado, pendientes: individualesPendientes.cnt + granelPendientes.cnt };
    log('[DIAG registrarDevolucion] TRANSACCION RESULTADO: ' + JSON.stringify(resultado));
    return resultado;
  });

  return ejecutar();
}

/**
 * Procesa una línea padre de kit marcada explícitamente en la devolución
 * (kit completo devuelto 'bien' o kit completo perdido 'perdido').
 * Expande el estado a todos sus componentes y ajusta stock.
 * @returns {number} costo_perdida aplicado (para sumar a totalDanos)
 */
function procesarKitLinea(idContrato, detalle, item, fechaDevolucionReal) {
  const estadoKit = item.estado_devolucion; // 'bien' | 'perdido'
  db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ?, costo_perdida = COALESCE(?, costo_perdida) WHERE id = ?')
    .run(estadoKit, fechaDevolucionReal, item.costo_perdida ?? null, detalle.id);

  let costoPerdidaAplicado = 0;

  if (estadoKit === 'bien' || estadoKit === 'perdido') {
    // Componentes individuales del kit
    const compsInd = db.prepare(
      "SELECT id, id_herramienta, estado_devolucion FROM DETALLE_CONTRATO WHERE id_contrato = ? AND id_kit = ? AND tipo_item = 'individual'"
    ).all(idContrato, detalle.id_kit);
    for (const ci of compsInd) {
      if (ci.estado_devolucion === 'pendiente') {
        db.prepare('UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?')
          .run(estadoKit, fechaDevolucionReal, ci.id);
        const estadoHerramienta = estadoKit === 'perdido' ? 'perdida' : estadoKit === 'vendido' ? 'vendida' : 'disponible';
        db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?')
          .run(estadoHerramienta, ci.id_herramienta);
      }
    }

    // Componentes granel del kit
    const compsGr = db.prepare(
      "SELECT id, id_item_granel, cantidad FROM DETALLE_CONTRATO WHERE id_contrato = ? AND id_kit = ? AND tipo_item = 'granel'"
    ).all(idContrato, detalle.id_kit);
    for (const cg of compsGr) {
      const yaDevuelto = db.prepare(
        'SELECT COALESCE(SUM(cantidad_bien + cantidad_danada + cantidad_perdida), 0) AS t FROM DEVOLUCION_GRANEL WHERE id_contrato = ? AND id_detalle = ? AND revertido = 0'
      ).get(idContrato, cg.id).t;
      const pendiente = Math.max(0, cg.cantidad - yaDevuelto);
      if (pendiente <= 0) continue;
      const bien = estadoKit === 'bien' ? pendiente : 0;
      const perdida = estadoKit === 'perdido' ? pendiente : 0;
      db.prepare(`
        INSERT INTO DEVOLUCION_GRANEL (id_contrato, id_item_granel, id_detalle, fecha, cantidad_bien, cantidad_danada, cantidad_perdida, costo_reparacion, costo_perdida)
        VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL)
      `).run(idContrato, cg.id_item_granel, cg.id, fechaDevolucionReal, bien, perdida);
      db.prepare('UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?), cantidad_perdida = cantidad_perdida + ? WHERE id = ?')
        .run(pendiente, perdida, cg.id_item_granel);
    }

    if (estadoKit === 'perdido' && item.costo_perdida) {
      costoPerdidaAplicado = item.costo_perdida;
    }
  }

  return costoPerdidaAplicado;
}

/**
 * Sincroniza el estado de las líneas padre de kit según el estado de sus componentes.
 * - Si hay componentes pendientes -> kit 'pendiente' (fecha NULL)
 * - Si todos completos y alguno dañado/perdido -> kit 'dañado'
 * - Si todos completos y bien -> kit 'bien' (fecha = fecha de devolución)
 * Los kits marcados 'perdido' explícitamente no se sobrescriben.
 */
function recalcularKits(idContrato, fechaDevolucionReal) {
  const kitLines = db.prepare(
    "SELECT id, id_kit, estado_devolucion FROM DETALLE_CONTRATO WHERE id_contrato = ? AND tipo_item = 'kit'"
  ).all(idContrato);

  for (const kl of kitLines) {
    if (kl.estado_devolucion === 'perdido') continue; // ya resuelto explícitamente

    const indPend = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND id_kit = ? AND tipo_item = 'individual' AND estado_devolucion = 'pendiente'"
    ).get(idContrato, kl.id_kit).cnt;

    const grPend = db.prepare(`
      SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO d
      WHERE d.id_contrato = ? AND d.id_kit = ? AND d.tipo_item = 'granel'
      AND d.cantidad > (
        SELECT COALESCE(SUM(dg.cantidad_bien + dg.cantidad_danada + dg.cantidad_perdida), 0)
        FROM DEVOLUCION_GRANEL dg
        WHERE dg.id_contrato = d.id_contrato AND dg.id_detalle = d.id AND dg.revertido = 0
      )
    `).get(idContrato, kl.id_kit).cnt;

    const pendientes = indPend + grPend;
    if (pendientes > 0) {
      db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = 'pendiente', fecha_devolucion_real = NULL WHERE id = ?")
        .run(kl.id);
      continue;
    }

    const danadoCnt = db.prepare(
      "SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO WHERE id_contrato = ? AND id_kit = ? AND tipo_item = 'individual' AND estado_devolucion IN ('dañado','perdido')"
    ).get(idContrato, kl.id_kit).cnt;

    const granelDanadoCnt = db.prepare(`
      SELECT COUNT(*) AS cnt FROM DETALLE_CONTRATO d
      WHERE d.id_contrato = ? AND d.id_kit = ? AND d.tipo_item = 'granel'
      AND (
        SELECT COALESCE(SUM(dg.cantidad_danada + dg.cantidad_perdida), 0)
        FROM DEVOLUCION_GRANEL dg
        WHERE dg.id_contrato = d.id_contrato AND dg.id_detalle = d.id AND dg.revertido = 0
      ) > 0
    `).get(idContrato, kl.id_kit).cnt;

    const estado = (danadoCnt + granelDanadoCnt) > 0 ? 'dañado' : 'bien';
    db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = ?, fecha_devolucion_real = ? WHERE id = ?")
      .run(estado, fechaDevolucionReal, kl.id);
  }
}

function getContratos(filtros = {}) {
  const hoy = localDate();

  let sql = `
    SELECT DISTINCT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
           cl.telefono AS cliente_telefono,
      (SELECT COUNT(*) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS total_items,
      (SELECT SUM(precio_dia_aplicado * cantidad) FROM DETALLE_CONTRATO WHERE id_contrato = c.id) AS subtotal_diario,
      (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = c.id AND tipo NOT IN ('deposito', 'devolucion_deposito') AND (anulado IS NULL OR anulado = 0)) AS total_pagado,
      (SELECT COALESCE(SUM(CASE WHEN tipo = 'deposito' THEN monto WHEN tipo = 'devolucion_deposito' THEN -monto END), 0) FROM PAGO WHERE id_contrato = c.id AND tipo IN ('deposito', 'devolucion_deposito') AND (anulado IS NULL OR anulado = 0)) AS garantia_retenida
    FROM CONTRATO c
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    LEFT JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
    WHERE 1=1
  `;
  const params = [];

  if (filtros.papelera === 1) {
    sql += ' AND c.papelera = 1';
  } else {
    sql += ' AND (c.papelera IS NULL OR c.papelera = 0)';
  }

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
  const contratosEnriquecidos = contratos.map(c => {
    const items = db.prepare(`
      SELECT d.*,
             CASE WHEN d.tipo_item = 'kit' THEN 'KIT-' || d.id_kit
                  ELSE COALESCE(h.id, 'MAT') END AS item_codigo,
             COALESCE(h.nombre, i.nombre, k.nombre) AS item_nombre,
             COALESCE(h.descripcion, i.descripcion, k.descripcion) AS item_descripcion,
             k.nombre AS kit_nombre,
             i.condicion AS item_condicion,
             COALESCE(i.precio_venta, h.precio_venta, cat.precio_venta) AS item_precio_venta,
             COALESCE(h.valor_reposicion, h.precio_venta, i.precio_venta, cat.precio_venta) AS item_valor_reposicion
      FROM DETALLE_CONTRATO d
      LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
      LEFT JOIN CATEGORIA_HERRAMIENTA cat ON h.id_categoria = cat.id
      LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
      LEFT JOIN KIT k ON d.id_kit = k.id
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

    // Desglose de daños predefinidos registrados en la devolución
    const danosDevueltos = db.prepare(`
      SELECT id_detalle, nombre, costo FROM DAÑO_DEVOLUCION
      WHERE id_contrato = ? AND revertido = 0
    `).all(c.id);
    const danosMap = {};
    for (const d of danosDevueltos) {
      if (!danosMap[d.id_detalle]) danosMap[d.id_detalle] = [];
      danosMap[d.id_detalle].push({ nombre: d.nombre, costo: d.costo });
    }

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
      // Desglose de daños predefinidos registrados
      item.danos_devueltos = danosMap[item.id] || [];
      // Fecha pactada por ítem: si tiene fecha propia, usar esa; si no, la del contrato
      const fechaDevItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
      const diasItem = Math.max(1, Math.ceil(
        (new Date(fechaDevItem + 'T00:00:00') - new Date(c.fecha_salida + 'T00:00:00')) / 86400000
      ) + 1);
      const totalItem = item.total_item_snapshot != null
        ? item.total_item_snapshot
        : diasItem * item.precio_dia_aplicado * item.cantidad;
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
        SELECT COALESCE(SUM(costo), 0) AS total
        FROM DAÑO_DEVOLUCION
        WHERE id_contrato = ? AND revertido = 0 AND tipo_item = 'individual'
      `).get(c.id)?.total || 0);
    const total_perdidas = itemsConAtraso.reduce((a, i) => a + (i.granel_dev_costo_perdida || 0) + ((i.tipo_item === 'kit' || i.estado_devolucion === 'perdido' || i.estado_devolucion === 'vendido') ? (i.costo_perdida || 0) : 0), 0);

    return { ...c, items: itemsConAtraso, pagos, dias_atraso: max_dias_atraso, total_atraso, total_contrato: totalContrato, total_danos, total_perdidas };
  });

  return adjuntarEtiquetasPorCliente(contratosEnriquecidos);
}

/**
 * Registra un pago para un contrato existente.
 * Si se proporciona idDetalle, el pago se aplica directamente a ese ítem.
 * Si no, se registra como pago general del contrato.
 */
function registrarPagoAdicional(idContrato, monto, metodo, tipo, idDetalle) {
  if (!idContrato || !monto || monto <= 0) {
    throw new Error('Datos de pago inválidos.');
  }

  const contrato = db.prepare('SELECT estado FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');

  const result = db.prepare(`
    INSERT INTO PAGO (id_contrato, monto, metodo, tipo, id_detalle, fecha_pago)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(idContrato, monto, metodo, tipo || 'saldo', idDetalle || null);

  db.prepare("UPDATE CONTRATO SET fecha_modificacion = ? WHERE id = ?")
    .run(localDateTime(), idContrato);

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
      if (detalle.estado_devolucion !== 'bien' && detalle.estado_devolucion !== 'dañado'
        && detalle.estado_devolucion !== 'perdido' && detalle.estado_devolucion !== 'vendido')
        throw new Error('El ítem no está en estado devuelto');

      db.prepare("UPDATE DETALLE_CONTRATO SET estado_devolucion = 'pendiente', fecha_devolucion_real = NULL, costo_perdida = NULL WHERE id = ?")
        .run(idDetalle);

      db.prepare("UPDATE HERRAMIENTA SET estado = 'alquilado' WHERE id = ?")
        .run(detalle.id_herramienta);

      if (detalle.estado_devolucion === 'dañado') {
        db.prepare("DELETE FROM MANTENIMIENTO WHERE id_herramienta = ? AND fecha_inicio = ? AND tipo = 'correctivo' AND descripcion LIKE 'Devolucion:%'")
          .run(detalle.id_herramienta, detalle.fecha_devolucion_real);
        db.prepare('UPDATE DAÑO_DEVOLUCION SET revertido = 1 WHERE id_detalle = ? AND id_contrato = ? AND tipo_item = ? AND revertido = 0')
          .run(idDetalle, detalle.id_contrato, 'individual');
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
      // Marcar desglose de daños granel como revertido
      db.prepare('UPDATE DAÑO_DEVOLUCION SET revertido = 1 WHERE id_detalle = ? AND id_contrato = ? AND tipo_item = ? AND revertido = 0')
        .run(idDetalle, detalle.id_contrato, 'granel');
    }

    // Sincronizar líneas padre de kits con el estado de sus componentes
    recalcularKits(detalle.id_contrato, localDate());

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
      db.prepare("UPDATE CONTRATO SET estado = 'devolución incompleta', fecha_modificacion = ? WHERE id = ?")
        .run(localDateTime(), detalle.id_contrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = 'alquilado', fecha_devolucion_real = NULL, fecha_modificacion = ? WHERE id = ?")
        .run(localDateTime(), detalle.id_contrato);
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

    // Marcar desglose de daños como revertido
    db.prepare('UPDATE DAÑO_DEVOLUCION SET revertido = 1 WHERE id_devolucion_granel = ?')
      .run(idDevolucionGranel);

    // Sincronizar líneas padre de kits con el estado de sus componentes
    recalcularKits(entry.id_contrato, localDate());

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
      db.prepare("UPDATE CONTRATO SET estado = 'devolución incompleta', fecha_modificacion = ? WHERE id = ?")
        .run(localDateTime(), entry.id_contrato);
    } else {
      db.prepare("UPDATE CONTRATO SET estado = 'devuelto', fecha_modificacion = ? WHERE id = ?")
        .run(localDateTime(), entry.id_contrato);
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
    const ids = db.prepare(
      "SELECT id FROM PAGO WHERE grupo_pago = ? AND (anulado IS NULL OR anulado = 0)"
    ).all(pago.grupo_pago).map(r => r.id);

    if (ids.length === 0) throw new Error('No se encontraron pagos activos en el grupo.');

    const ejecutar = db.transaction(() => {
      for (const id of ids) {
        db.prepare(`
          UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now', 'localtime'), motivo_anulacion = ?
          WHERE id = ?
        `).run(motivo || null, id);
      }
    });
    ejecutar();

    db.prepare("UPDATE CONTRATO SET fecha_modificacion = ? WHERE id = ?")
      .run(localDateTime(), pago.id_contrato);

    return { ids, anulado: true };
  }

  db.prepare(`
    UPDATE PAGO SET anulado = 1, fecha_anulacion = datetime('now', 'localtime'), motivo_anulacion = ?
    WHERE id = ?
  `).run(motivo || null, idPago);

  db.prepare("UPDATE CONTRATO SET fecha_modificacion = ? WHERE id = ?")
    .run(localDateTime(), pago.id_contrato);

  return { id: idPago, anulado: true };
}

/**
 * Edita un contrato de alquiler activo (alquilado/atrasado).
 * En una transaccion: libera inventario actual, actualiza cabecera,
 * borra detalles viejos, inserta nuevos y aplica nuevo inventario.
 */
function editarContrato(idContrato, data) {
  const {
    idCliente, idUsuario, fechaSalida, fechaDevolucionPactada,
    depositoMonto, depositoDni, items,
    dniCliente, nombreCliente, telefonoCliente,
  } = data;

  if (!items || items.length === 0) {
    throw new Error('El contrato debe contener al menos un item.');
  }
  if (fechaDevolucionPactada < fechaSalida) {
    throw new Error('La fecha de devolucion debe ser posterior a la fecha de salida.');
  }

  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado !== 'alquilado' && contrato.estado !== 'atrasado') {
    throw new Error('Solo se pueden editar contratos en estado alquilado o atrasado.');
  }

  const idClienteReal = _autoCrearCliente(idCliente, dniCliente, nombreCliente, telefonoCliente);

  const ejecutar = db.transaction(() => {
    // 1. Liberar inventario actual
    const detallesActuales = db.prepare(
      'SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ?'
    ).all(idContrato);

    for (const d of detallesActuales) {
      if (d.tipo_item === 'individual') {
        db.prepare("UPDATE HERRAMIENTA SET estado = 'disponible' WHERE id = ?")
          .run(d.id_herramienta);
      } else if (d.tipo_item === 'granel') {
        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?) WHERE id = ?'
        ).run(d.cantidad, d.id_item_granel);
      }
    }

    // 2. Eliminar detalles actuales
    db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id_contrato = ?').run(idContrato);

    // 3. Actualizar cabecera
    db.prepare(`
      UPDATE CONTRATO SET
        id_cliente = ?, fecha_salida = ?, fecha_devolucion_pactada = ?,
        deposito_monto = ?, deposito_dni = ?, fecha_modificacion = ?
      WHERE id = ?
    `).run(idClienteReal, fechaSalida, fechaDevolucionPactada,
      depositoMonto, depositoDni, localDateTime(), idContrato);

    // 4. Insertar nuevos detalles (misma logica que crearContrato)
    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel, id_kit,
        cantidad, precio_dia_aplicado,
        fecha_devolucion_pactada_item, total_item_snapshot, tarifa_aplicada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      if (item.tipo_item === 'individual') {
        const herramienta = db
          .prepare('SELECT precio_dia, estado FROM HERRAMIENTA WHERE id = ? AND activo = 1')
          .get(item.id_herramienta);

        if (!herramienta) {
          throw new Error('Herramienta no encontrada o inactiva: ' + item.id_herramienta);
        }
        if (herramienta.estado !== 'disponible') {
          throw new Error('La herramienta ' + item.id_herramienta +
            ' no esta disponible (estado: ' + herramienta.estado + ').');
        }

        insertDetalle.run(
          idContrato, 'individual', item.id_herramienta, null, null, 1,
          item.precio_aplicado != null ? item.precio_aplicado : herramienta.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
        );
        db.prepare("UPDATE HERRAMIENTA SET estado = 'alquilado' WHERE id = ?")
          .run(item.id_herramienta);
      } else if (item.tipo_item === 'granel') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para items a granel debe ser al menos 1.');
        }
        const granel = db
          .prepare('SELECT precio_dia, cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1')
          .get(item.id_item_granel);

        if (!granel) {
          throw new Error('Item a granel no encontrado o inactivo: ' + item.id_item_granel);
        }
        if (granel.cantidad_disponible < item.cantidad) {
          throw new Error('Stock insuficiente. Disponible: ' + granel.cantidad_disponible +
            ', solicitado: ' + item.cantidad);
        }

        insertDetalle.run(
          idContrato, 'granel', null, item.id_item_granel, null, item.cantidad,
          item.precio_aplicado != null ? item.precio_aplicado : granel.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
        );
        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      } else if (item.tipo_item === 'kit') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para kits debe ser al menos 1.');
        }
        const kit = db
          .prepare('SELECT precio_dia, nombre FROM KIT WHERE id = ? AND activo = 1')
          .get(item.id_kit);
        if (!kit) throw new Error('Kit no encontrado o inactivo: ' + item.id_kit);

        const componentes = db
          .prepare('SELECT * FROM KIT_COMPONENTE WHERE id_kit = ?')
          .all(item.id_kit);
        if (componentes.length === 0) {
          throw new Error('El kit ' + kit.nombre + ' no tiene componentes configurados.');
        }

        insertDetalle.run(
          idContrato, 'kit', null, null, item.id_kit, item.cantidad,
          item.precio_aplicado != null ? item.precio_aplicado : kit.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null,
          item.tarifa_aplicada || 'dia'
        );

        for (const comp of componentes) {
          if (comp.tipo_item === 'granel') {
            const granelC = db
              .prepare('SELECT cantidad_disponible, nombre FROM ITEM_GRANEL WHERE id = ? AND activo = 1')
              .get(comp.id_item_granel);
            if (!granelC) {
              throw new Error('Componente granel del kit no encontrado: ' + comp.id_item_granel);
            }
            const necesario = comp.cantidad * item.cantidad;
            if (granelC.cantidad_disponible < necesario) {
              throw new Error('Stock insuficiente de ' + granelC.nombre + ' para el kit ' + kit.nombre);
            }
            insertDetalle.run(
              idContrato, 'granel', null, comp.id_item_granel, item.id_kit,
              necesario, 0, null, null, 'dia'
            );
            db.prepare(
              'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
            ).run(necesario, comp.id_item_granel);
          } else if (comp.tipo_item === 'individual') {
            const herrC = db
              .prepare('SELECT estado, nombre FROM HERRAMIENTA WHERE id = ? AND activo = 1')
              .get(comp.id_herramienta);
            if (!herrC) throw new Error('Componente del kit no encontrado: ' + comp.id_herramienta);
            if (herrC.estado !== 'disponible') {
              throw new Error('La herramienta ' + herrC.nombre + ' del kit ' + kit.nombre +
                ' no esta disponible.');
            }
            insertDetalle.run(
              idContrato, 'individual', comp.id_herramienta, null, item.id_kit,
              1, 0, null, null, 'dia'
            );
            db.prepare("UPDATE HERRAMIENTA SET estado = 'alquilado' WHERE id = ?")
              .run(comp.id_herramienta);
          }
        }
      }
    }

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Edita una reserva existente (estado 'reservado').
 * Libera inventario actual, actualiza cabecera y detalles, aplica nuevo inventario.
 */
function editarReserva(idContrato, data) {
  const {
    idCliente, idUsuario, fechaReserva, fechaDevolucionPactada,
    depositoMonto, depositoDni, items,
    dniCliente, nombreCliente, telefonoCliente,
  } = data;

  if (!items || items.length === 0) {
    throw new Error('La reserva debe contener al menos un item.');
  }
  if (fechaDevolucionPactada < fechaReserva) {
    throw new Error('La fecha de devolucion debe ser posterior a la fecha de reserva.');
  }

  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado !== 'reservado') {
    throw new Error('Solo se pueden editar contratos en estado reservado.');
  }

  const idClienteReal = _autoCrearCliente(idCliente, dniCliente, nombreCliente, telefonoCliente);

  const ejecutar = db.transaction(() => {
    // 1. Liberar inventario actual
    const detallesActuales = db.prepare(
      'SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ?'
    ).all(idContrato);

    for (const d of detallesActuales) {
      if (d.tipo_item === 'individual') {
        db.prepare("UPDATE HERRAMIENTA SET estado = 'disponible' WHERE id = ?")
          .run(d.id_herramienta);
      } else if (d.tipo_item === 'granel') {
        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?) WHERE id = ?'
        ).run(d.cantidad, d.id_item_granel);
      }
    }

    // 2. Eliminar detalles actuales
    db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id_contrato = ?').run(idContrato);

    // 3. Actualizar cabecera
    db.prepare(`
      UPDATE CONTRATO SET
        id_cliente = ?, fecha_salida = ?, fecha_devolucion_pactada = ?,
        deposito_monto = ?, deposito_dni = ?, fecha_reserva = ?,
        fecha_modificacion = ?
      WHERE id = ?
    `).run(idClienteReal, fechaReserva, fechaDevolucionPactada,
      depositoMonto, depositoDni, fechaReserva, localDateTime(), idContrato);

    // 4. Insertar nuevos detalles (logica de crearReserva)
    const insertDetalle = db.prepare(`
      INSERT INTO DETALLE_CONTRATO (
        id_contrato, tipo_item, id_herramienta, id_item_granel,
        cantidad, precio_dia_aplicado,
        fecha_devolucion_pactada_item, total_item_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      if (item.tipo_item === 'individual') {
        const herramienta = db
          .prepare('SELECT precio_dia, estado FROM HERRAMIENTA WHERE id = ? AND activo = 1')
          .get(item.id_herramienta);

        if (!herramienta) {
          throw new Error('Herramienta no encontrada o inactiva: ' + item.id_herramienta);
        }
        if (herramienta.estado !== 'disponible') {
          throw new Error('La herramienta ' + item.id_herramienta +
            ' no esta disponible (estado: ' + herramienta.estado + ').');
        }

        const reservaActiva = db.prepare(`
          SELECT c.id FROM CONTRATO c
          JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
          WHERE d.id_herramienta = ? AND c.estado = 'reservado' AND c.fecha_reserva >= date('now', 'localtime')
          AND c.id != ?
        `).get(item.id_herramienta, idContrato);
        if (reservaActiva) {
          throw new Error('La herramienta ' + item.id_herramienta + ' ya esta reservada.');
        }

        insertDetalle.run(
          idContrato, 'individual', item.id_herramienta, null,
          1, herramienta.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
        );
        db.prepare("UPDATE HERRAMIENTA SET estado = 'reservado' WHERE id = ?")
          .run(item.id_herramienta);
      } else if (item.tipo_item === 'granel') {
        if (!item.cantidad || item.cantidad < 1) {
          throw new Error('La cantidad para items a granel debe ser al menos 1.');
        }
        const granel = db
          .prepare('SELECT precio_dia, cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1')
          .get(item.id_item_granel);

        if (!granel) {
          throw new Error('Item a granel no encontrado o inactivo: ' + item.id_item_granel);
        }
        if (granel.cantidad_disponible < item.cantidad) {
          throw new Error('Stock insuficiente. Disponible: ' + granel.cantidad_disponible +
            ', solicitado: ' + item.cantidad);
        }

        insertDetalle.run(
          idContrato, 'granel', null, item.id_item_granel,
          item.cantidad, granel.precio_dia,
          item.fecha_devolucion_pactada || null,
          item.total_item_snapshot != null ? item.total_item_snapshot : null
        );
        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
        ).run(item.cantidad, item.id_item_granel);
      }
    }

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Mueve un contrato a la papelera (borrado logico).
 * Libera inventario y marca papelera=1. No toca pagos.
 * Funciona para estados: alquilado, atrasado, reservado, devolucion incompleta.
 */
function eliminarContrato(idContrato, motivo) {
  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.estado === 'devuelto' || contrato.estado === 'cancelado') {
    throw new Error('No se puede eliminar un contrato en estado ' + contrato.estado + '.');
  }
  if (contrato.papelera === 1) {
    throw new Error('El contrato ya se encuentra en la papelera.');
  }

  const ejecutar = db.transaction(() => {
    // Liberar inventario
    const detalles = db.prepare(
      'SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ?'
    ).all(idContrato);

    for (const d of detalles) {
      if (d.tipo_item === 'individual') {
        db.prepare("UPDATE HERRAMIENTA SET estado = 'disponible' WHERE id = ?")
          .run(d.id_herramienta);
      } else if (d.tipo_item === 'granel') {
        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = MAX(0, cantidad_alquilada - ?) WHERE id = ?'
        ).run(d.cantidad, d.id_item_granel);
      }
    }

    // Marcar como en papelera
    db.prepare(`
      UPDATE CONTRATO SET
        papelera = 1,
        fecha_papelera = ?,
        motivo_eliminacion = ?,
        fecha_modificacion = ?
      WHERE id = ?
    `).run(localDateTime(), motivo || null, localDateTime(), idContrato);

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Restaura un contrato desde la papelera.
 * Vuelve a aplicar los efectos de inventario y quita el flag papelera.
 */
function restaurarContrato(idContrato) {
  const contrato = db.prepare('SELECT * FROM CONTRATO WHERE id = ?').get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');
  if (contrato.papelera !== 1) {
    throw new Error('El contrato no esta en la papelera.');
  }

  // Verificar que no hayan pasado 7 dias
  if (contrato.fecha_papelera) {
    const fechaPapelera = new Date(contrato.fecha_papelera + 'T00:00:00');
    const ahora = new Date(localDate() + 'T00:00:00');
    const diasEnPapelera = Math.floor((ahora - fechaPapelera) / (1000 * 60 * 60 * 24));
    if (diasEnPapelera >= 7) {
      throw new Error('El contrato ha estado en papelera por mas de 7 dias y no puede ser restaurado.');
    }
  }

  const ejecutar = db.transaction(() => {
    // Re-aplicar inventario segun los detalles existentes
    const detalles = db.prepare(
      'SELECT * FROM DETALLE_CONTRATO WHERE id_contrato = ?'
    ).all(idContrato);

    for (const d of detalles) {
      if (d.tipo_item === 'individual') {
        const herramienta = db.prepare(
          'SELECT estado FROM HERRAMIENTA WHERE id = ?'
        ).get(d.id_herramienta);

        if (!herramienta) {
          throw new Error('La herramienta ' + d.id_herramienta + ' ya no existe.');
        }
        if (herramienta.estado !== 'disponible') {
          throw new Error('La herramienta ' + d.id_herramienta +
            ' no esta disponible (estado: ' + herramienta.estado + ').');
        }

        const nuevoEstado = contrato.estado === 'reservado' ? 'reservado' : 'alquilado';
        db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?')
          .run(nuevoEstado, d.id_herramienta);
      } else if (d.tipo_item === 'granel') {
        const granel = db.prepare(
          'SELECT cantidad_disponible FROM ITEM_GRANEL WHERE id = ? AND activo = 1'
        ).get(d.id_item_granel);

        if (!granel) {
          throw new Error('El item a granel ID ' + d.id_item_granel + ' ya no existe.');
        }
        if (granel.cantidad_disponible < d.cantidad) {
          throw new Error('Stock insuficiente para restaurar ' + d.id_item_granel +
            '. Disponible: ' + granel.cantidad_disponible + ', necesario: ' + d.cantidad);
        }

        db.prepare(
          'UPDATE ITEM_GRANEL SET cantidad_alquilada = cantidad_alquilada + ? WHERE id = ?'
        ).run(d.cantidad, d.id_item_granel);
      }
    }

    // Quitar papelera
    db.prepare(`
      UPDATE CONTRATO SET
        papelera = 0,
        fecha_papelera = NULL,
        motivo_eliminacion = NULL,
        fecha_modificacion = ?
      WHERE id = ?
    `).run(localDateTime(), idContrato);

    return { ok: true };
  });

  return ejecutar();
}

/**
 * Elimina permanentemente contratos que llevan mas de 7 dias en papelera.
 * Se ejecuta al iniciar la aplicacion.
 */
function autoEliminarPapelera() {
  const hace7Dias = (() => {
    const d = new Date(localDate() + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const contratosParaEliminar = db.prepare(
    "SELECT id FROM CONTRATO WHERE papelera = 1 AND fecha_papelera IS NOT NULL AND fecha_papelera < ?"
  ).all(hace7Dias);

  let eliminados = 0;
  for (const c of contratosParaEliminar) {
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM DAÑO_DEVOLUCION WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM DEVOLUCION_GRANEL WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM PAGO WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM CALIFICACION_CLIENTE WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM MANTENIMIENTO WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM DETALLE_CONTRATO WHERE id_contrato = ?').run(c.id);
        db.prepare('DELETE FROM CONTRATO WHERE id = ?').run(c.id);
      })();
      eliminados++;
    } catch (e) {
      log('[autoEliminarPapelera] Error eliminando contrato #' + c.id + ': ' + e.message);
    }
  }

  if (eliminados > 0) {
    log('[autoEliminarPapelera] ' + eliminados + ' contrato(s) eliminado(s) permanentemente.');
  }

  return { eliminados };
}

module.exports = { crearContrato, crearReserva, convertirReserva, cancelarReserva, autoCancelarReservas, registrarDevolucion, getContratos, registrarPagoAdicional, revertirDevolucionItem, revertirDevolucionGranel, getDevolucionesGranel, anularPago, editarContrato, editarReserva, eliminarContrato, restaurarContrato, autoEliminarPapelera };
