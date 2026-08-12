const db = require('../db/database');

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

module.exports = ventaService;
