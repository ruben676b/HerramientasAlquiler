const db = require('../db/database');

/**
 * Devuelve ventas de inventario con su cantidad devolvable.
 * @param {{ id_herramienta?: string, id_item_granel?: number, soloDevolvibles?: boolean }} filtro
 */
function getVentasInventario(filtro = {}) {
  let sql = `
    SELECT v.*,
           v.id AS id_venta,
           (v.cantidad - v.cantidad_devuelta) AS cantidad_devolvable
    FROM VENTA_INVENTARIO v
    WHERE 1=1
  `;
  const params = [];

  if (filtro.id_herramienta) {
    sql += ' AND v.id_herramienta = ?';
    params.push(filtro.id_herramienta);
  }
  if (filtro.id_item_granel) {
    sql += ' AND v.id_item_granel = ?';
    params.push(filtro.id_item_granel);
  }
  if (filtro.soloDevolvibles) {
    sql += ' AND (v.cantidad - v.cantidad_devuelta) > 0';
  }

  sql += ' ORDER BY v.id DESC';
  return db.prepare(sql).all(...params);
}

/**
 * Anula (devuelve) una venta de inventario total o parcialmente.
 * Restaura el inventario y registra el reembolso como egreso de caja
 * con el mismo método de pago de la venta.
 * @param {number} idVenta - ID del registro VENTA_INVENTARIO
 * @param {number} cantidadDevolver - Unidades a devolver (1 = venta individual completa)
 */
function anularVentaInventario(idVenta, cantidadDevolver) {
  const venta = db.prepare('SELECT * FROM VENTA_INVENTARIO WHERE id = ?').get(idVenta);
  if (!venta) throw new Error('Venta no encontrada.');

  const cantidadDevolverN = parseInt(cantidadDevolver, 10);
  if (!cantidadDevolverN || cantidadDevolverN < 1) {
    throw new Error('Cantidad a devolver debe ser al menos 1.');
  }

  const devolvable = venta.cantidad - (venta.cantidad_devuelta || 0);
  if (cantidadDevolverN > devolvable) {
    throw new Error('Solo quedan ' + devolvable + ' unidad(es) por devolver de esta venta.');
  }

  const tx = db.transaction(() => {
    // 1. Restaurar inventario
    if (venta.tipo_item === 'individual') {
      if (cantidadDevolverN !== 1) {
        throw new Error('La venta de una herramienta se devuelve completa.');
      }
      const upd = db.prepare("UPDATE HERRAMIENTA SET estado = 'disponible' WHERE id = ? AND estado = 'vendido'")
        .run(venta.id_herramienta);
      if (upd.changes === 0) {
        const h = db.prepare("SELECT estado FROM HERRAMIENTA WHERE id = ?").get(venta.id_herramienta);
        if (!h) throw new Error('Herramienta no encontrada.');
        throw new Error('La herramienta ya no está vendida (estado: ' + h.estado + '). No se puede devolver.');
      }
    } else {
      // Granel: devolver unidades a cantidad_vendida (el trigger recalcula cantidad_disponible)
      const g = db.prepare('SELECT cantidad_vendida FROM ITEM_GRANEL WHERE id = ?').get(venta.id_item_granel);
      if (!g) throw new Error('Material a granel no encontrado.');
      if ((g.cantidad_vendida || 0) < cantidadDevolverN) {
        throw new Error('No hay suficientes unidades vendidas para devolver.');
      }
      db.prepare('UPDATE ITEM_GRANEL SET cantidad_vendida = cantidad_vendida - ? WHERE id = ?')
        .run(cantidadDevolverN, venta.id_item_granel);
    }

    // 2. Acumular cantidad devuelta en la venta
    db.prepare('UPDATE VENTA_INVENTARIO SET cantidad_devuelta = cantidad_devuelta + ? WHERE id = ?')
      .run(cantidadDevolverN, idVenta);

    // 3. Registrar el reembolso como egreso de caja (mismo método de pago)
    const montoReembolso = cantidadDevolverN * venta.precio_unitario;
    const detalleItem = venta.tipo_item === 'individual' && venta.id_herramienta
      ? (venta.nombre_item + ' (' + venta.id_herramienta + ')')
      : venta.nombre_item;
    db.prepare(`
      INSERT INTO EGRESO_CAJA (monto, descripcion, metodo)
      VALUES (?, ?, ?)
    `).run(
      montoReembolso,
      'Devolución de venta: ' + cantidadDevolverN + 'x ' + detalleItem + ' (venta #' + idVenta + ')',
      venta.metodo
    );
  });

  tx();
  return { id_venta: idVenta, cantidad_devuelta: cantidadDevolverN, monto_reembolsado: cantidadDevolverN * venta.precio_unitario };
}

const ventaService = {
  registrarVentaInventario: (datosVenta) => {
    const {
      tipo_item,
      id_herramienta,
      id_item_granel,
      nombre_item,
      cantidad,
      precio_unitario,
      total,
      metodo,
      cliente_nombre
    } = datosVenta;

    // Validación básica
    if (!['individual', 'granel'].includes(tipo_item)) {
      throw new Error("Tipo de ítem inválido. Debe ser 'individual' o 'granel'.");
    }
    if (cantidad <= 0) {
      throw new Error("La cantidad debe ser mayor a 0.");
    }
    if (precio_unitario < 0 || total < 0) {
      throw new Error("El precio y el total no pueden ser negativos.");
    }
    if (!['efectivo', 'yape', 'plin'].includes(metodo)) {
      throw new Error("Método de pago inválido.");
    }

    const insertVenta = db.prepare(`
      INSERT INTO VENTA_INVENTARIO (
        tipo_item, id_herramienta, id_item_granel, nombre_item,
        cantidad, precio_unitario, total, metodo, cliente_nombre
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateHerramienta = db.prepare(`
      UPDATE HERRAMIENTA SET estado = 'vendido' WHERE id = ? AND estado != 'vendido'
    `);

    const checkGranel = db.prepare(`
      SELECT cantidad_disponible FROM ITEM_GRANEL WHERE id = ?
    `);

    const updateGranel = db.prepare(`
      UPDATE ITEM_GRANEL 
      SET cantidad_vendida = cantidad_vendida + ? 
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      // 1. Verificar stock si es granel
      if (tipo_item === 'granel') {
        const item = checkGranel.get(id_item_granel);
        if (!item) {
          throw new Error("Ítem a granel no encontrado.");
        }
        if (item.cantidad_disponible < cantidad) {
          throw new Error(`Stock insuficiente. Disponible: ${item.cantidad_disponible}, Solicitado: ${cantidad}`);
        }
      } else {
         // Verificar si es individual
         if (!id_herramienta) {
             throw new Error("Se requiere el ID de la herramienta para una venta individual.");
         }
      }

      // 2. Insertar registro de venta
      const info = insertVenta.run(
        tipo_item,
        tipo_item === 'individual' ? id_herramienta : null,
        tipo_item === 'granel' ? id_item_granel : null,
        nombre_item,
        cantidad,
        precio_unitario,
        total,
        metodo,
        cliente_nombre || null
      );

      // 3. Actualizar inventario
      if (tipo_item === 'individual') {
        const updateInfo = updateHerramienta.run(id_herramienta);
        if (updateInfo.changes === 0) {
           throw new Error("La herramienta no existe o ya está vendida.");
        }
      } else {
        updateGranel.run(cantidad, id_item_granel);
      }

      return { id_venta: info.lastInsertRowid };
    });

    try {
      return transaction();
    } catch (error) {
      console.error("[VentaService] Error al registrar venta:", error);
      throw error;
    }
  }
};

module.exports = {
  ventaService,
  registrarVentaInventario: ventaService.registrarVentaInventario,
  anularVentaInventario,
  getVentasInventario,
};
