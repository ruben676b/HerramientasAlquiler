const db = require('../db/database');
const { localDate } = require('../utils/date');

/**
 * Registra un egreso directo de caja.
 *
 * @param {object} data - { monto, descripcion, metodo }
 * @returns {object} { success: boolean, id: number }
 */
function registrarEgreso({ monto, descripcion, metodo = 'efectivo' }) {
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) {
    throw new Error('El monto del egreso debe ser un número mayor a 0.');
  }

  if (!descripcion || !descripcion.trim()) {
    throw new Error('Debe especificar una descripción o motivo para el egreso.');
  }

  const metodosValidos = ['efectivo', 'yape', 'plin'];
  const metodoPago = metodosValidos.includes(metodo) ? metodo : 'efectivo';

  const stmt = db.prepare(`
    INSERT INTO EGRESO_CAJA (monto, descripcion, metodo, fecha)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
  `);

  const result = stmt.run(montoNum, descripcion.trim(), metodoPago);

  return { success: true, id: result.lastInsertRowid };
}

/**
 * Elimina un egreso de caja por su ID.
 *
 * @param {number} id
 * @returns {object} { success: boolean }
 */
function eliminarEgreso(id) {
  const stmt = db.prepare('DELETE FROM EGRESO_CAJA WHERE id = ?');
  const result = stmt.run(id);
  return { success: result.changes > 0 };
}

/**
 * Obtiene el resumen de caja para una fecha específica.
 *
 * @param {string} fecha - Formato YYYY-MM-DD
 * @returns {{ totalesPorMetodo: object, resumenConcepto: Array, movimientos: Array }}
 */
function getResumenCaja(fecha) {
  if (!fecha) {
    fecha = localDate();
  }

  // 1. Totales por método de pago (de PAGO)
  const totalesMetodoPago = db.prepare(`
    SELECT
      metodo,
      SUM(CASE WHEN tipo != 'devolucion_deposito' THEN monto ELSE 0 END) AS ingresos,
      SUM(CASE WHEN tipo = 'devolucion_deposito' THEN monto ELSE 0 END) AS egresos
    FROM PAGO
    WHERE DATE(fecha_pago) = ? AND (anulado IS NULL OR anulado = 0)
    GROUP BY metodo
  `).all(fecha);

  // 2. Totales por método de egresos directos (de EGRESO_CAJA)
  const totalesEgresoCaja = db.prepare(`
    SELECT
      metodo,
      SUM(monto) AS total_egreso
    FROM EGRESO_CAJA
    WHERE DATE(fecha) = ?
    GROUP BY metodo
  `).all(fecha);

  const egresosDirectosMap = { efectivo: 0, yape: 0, plin: 0 };
  for (const row of totalesEgresoCaja) {
    if (egresosDirectosMap[row.metodo] !== undefined) {
      egresosDirectosMap[row.metodo] = row.total_egreso || 0;
    }
  }

  // 2.5 Totales por método de ventas (de VENTA_INVENTARIO)
  const totalesVentaInventario = db.prepare(`
    SELECT
      metodo,
      SUM(total) AS total_venta
    FROM VENTA_INVENTARIO
    WHERE DATE(fecha) = ?
    GROUP BY metodo
  `).all(fecha);

  const ventasMap = { efectivo: 0, yape: 0, plin: 0 };
  for (const row of totalesVentaInventario) {
    if (ventasMap[row.metodo] !== undefined) {
      ventasMap[row.metodo] = row.total_venta || 0;
    }
  }

  // Construir objeto de totales
  const totalesPorMetodo = { efectivo: 0, yape: 0, plin: 0, totalIngresos: 0, totalEgresos: 0 };

  for (const row of totalesMetodoPago) {
    const egresoDirecto = egresosDirectosMap[row.metodo] || 0;
    const venta = ventasMap[row.metodo] || 0;
    const totalEgresosMetodo = (row.egresos || 0) + egresoDirecto;
    const totalIngresosMetodo = (row.ingresos || 0) + venta;
    totalesPorMetodo[row.metodo] = totalIngresosMetodo - totalEgresosMetodo;
    totalesPorMetodo.totalIngresos += totalIngresosMetodo;
    totalesPorMetodo.totalEgresos += totalEgresosMetodo;
    delete egresosDirectosMap[row.metodo];
    delete ventasMap[row.metodo];
  }

  // Agregar egresos directos de métodos sin transacciones en PAGO
  for (const [metodo, egresoDirecto] of Object.entries(egresosDirectosMap)) {
    if (egresoDirecto > 0) {
      totalesPorMetodo[metodo] = (totalesPorMetodo[metodo] || 0) - egresoDirecto;
      totalesPorMetodo.totalEgresos += egresoDirecto;
    }
  }

  // Agregar ventas de métodos sin transacciones en PAGO
  for (const [metodo, venta] of Object.entries(ventasMap)) {
    if (venta > 0) {
      totalesPorMetodo[metodo] = (totalesPorMetodo[metodo] || 0) + venta;
      totalesPorMetodo.totalIngresos += venta;
    }
  }

  // 3. Resumen cruzado: concepto × método
  const resumenRows = db.prepare(`
    SELECT
      tipo,
      metodo,
      SUM(monto) AS total
    FROM PAGO
    WHERE DATE(fecha_pago) = ? AND (anulado IS NULL OR anulado = 0)
    GROUP BY tipo, metodo
    ORDER BY tipo, metodo
  `).all(fecha);

  const conceptos = ['adelanto', 'saldo', 'mora', 'deposito', 'devolucion_deposito'];
  const resumenConcepto = conceptos.map(tipo => {
    const fila = { tipo, efectivo: 0, yape: 0, plin: 0, total: 0 };
    for (const row of resumenRows) {
      if (row.tipo === tipo) {
        fila[row.metodo] = row.total;
        fila.total += row.total;
      }
    }
    return fila;
  }).filter(f => f.total > 0);

  // Agregar fila de Egreso de Caja a resumenConcepto si existe
  const egresoFila = { tipo: 'egreso_caja', efectivo: 0, yape: 0, plin: 0, total: 0 };
  for (const row of totalesEgresoCaja) {
    if (egresoFila[row.metodo] !== undefined) {
      egresoFila[row.metodo] = row.total_egreso || 0;
      egresoFila.total += row.total_egreso || 0;
    }
  }
  if (egresoFila.total > 0) {
    resumenConcepto.push(egresoFila);
  }

  // Agregar fila de Venta de Inventario a resumenConcepto si existe
  const ventaFila = { tipo: 'venta_inventario', efectivo: 0, yape: 0, plin: 0, total: 0 };
  for (const row of totalesVentaInventario) {
    if (ventaFila[row.metodo] !== undefined) {
      ventaFila[row.metodo] = row.total_venta || 0;
      ventaFila.total += row.total_venta || 0;
    }
  }
  if (ventaFila.total > 0) {
    resumenConcepto.push(ventaFila);
  }

  // 4. Listado detallado de movimientos combinados
  const movimientosPago = db.prepare(`
    SELECT
      p.id,
      p.id_contrato,
      p.monto,
      p.fecha_pago,
      p.metodo,
      p.tipo,
      p.notas,
      c.id AS contrato_num,
      cl.nombre AS cliente_nombre,
      cl.dni AS cliente_dni
    FROM PAGO p
    JOIN CONTRATO c ON p.id_contrato = c.id
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE DATE(p.fecha_pago) = ? AND (p.anulado IS NULL OR p.anulado = 0)
  `).all(fecha).map(m => ({ ...m, esEgresoDirecto: false }));

  const movimientosEgreso = db.prepare(`
    SELECT
      id AS id_egreso,
      monto,
      fecha AS fecha_pago,
      metodo,
      'egreso_caja' AS tipo,
      descripcion AS notas,
      NULL AS contrato_num,
      'Egreso de caja' AS cliente_nombre,
      NULL AS cliente_dni
    FROM EGRESO_CAJA
    WHERE DATE(fecha) = ?
  `).all(fecha).map(e => ({ ...e, id: 'egreso_' + e.id_egreso, esEgresoDirecto: true }));

  const movimientosVenta = db.prepare(`
    SELECT
      id AS id_venta,
      total AS monto,
      fecha AS fecha_pago,
      metodo,
      'venta_inventario' AS tipo,
      'Venta: ' || cantidad || 'x ' || nombre_item AS notas,
      NULL AS contrato_num,
      COALESCE(cliente_nombre, 'Venta Mostrador') AS cliente_nombre,
      NULL AS cliente_dni,
      tipo_item,
      id_herramienta,
      id_item_granel,
      cantidad,
      precio_unitario,
      cantidad_devuelta,
      (cantidad - cantidad_devuelta) AS cantidad_devolvable
    FROM VENTA_INVENTARIO
    WHERE DATE(fecha) = ?
  `).all(fecha).map(v => ({ ...v, id: 'venta_' + v.id_venta, esVentaDirecta: true }));

  const movimientos = [...movimientosPago, ...movimientosEgreso, ...movimientosVenta].sort((a, b) => {
    return new Date(b.fecha_pago) - new Date(a.fecha_pago);
  });

  // 5. Contadores rápidos
  const contadoresPago = db.prepare(`
    SELECT
      COUNT(*) AS total_movimientos,
      COUNT(DISTINCT p.id_contrato) AS total_contratos
    FROM PAGO p
    WHERE DATE(p.fecha_pago) = ? AND (p.anulado IS NULL OR p.anulado = 0)
  `).get(fecha);

  const totalEgresoCount = db.prepare(`
    SELECT COUNT(*) AS total FROM EGRESO_CAJA WHERE DATE(fecha) = ?
  `).get(fecha).total;

  const totalVentaCount = db.prepare(`
    SELECT COUNT(*) AS total FROM VENTA_INVENTARIO WHERE DATE(fecha) = ?
  `).get(fecha).total;

  return {
    fecha,
    totalesPorMetodo,
    resumenConcepto,
    movimientos,
    totalMovimientos: (contadoresPago.total_movimientos || 0) + (totalEgresoCount || 0) + (totalVentaCount || 0),
    totalContratos: contadoresPago.total_contratos || 0,
  };
}

/**
 * Guarda un snapshot del resumen de caja diaria para historial.
 *
 * @param {string} fecha - Formato YYYY-MM-DD
 * @param {number} montoInicial - Monto inicial de caja del día
 * @returns {object} { success: boolean, id: number }
 */
function guardarCajaDiaria(fecha, montoInicial) {
  if (!fecha) fecha = localDate();

  const resumen = getResumenCaja(fecha);

  const totalNeto = (resumen.totalesPorMetodo.efectivo || 0) +
    (resumen.totalesPorMetodo.yape || 0) +
    (resumen.totalesPorMetodo.plin || 0);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO CAJA_DIARIA
      (fecha, monto_inicial, total_ingresos, total_egresos, total_neto, totales_metodo, resumen_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    fecha,
    montoInicial || 0,
    resumen.totalesPorMetodo.totalIngresos || 0,
    resumen.totalesPorMetodo.totalEgresos || 0,
    totalNeto,
    JSON.stringify(resumen.totalesPorMetodo),
    JSON.stringify(resumen)
  );

  return { success: true, id: result.lastInsertRowid };
}

/**
 * Obtiene el historial de cajas diarias guardadas.
 *
 * @returns {Array} Lista de registros de caja diaria
 */
function getHistorialCaja() {
  return db.prepare(`
    SELECT id, fecha, monto_inicial, total_ingresos, total_egresos,
           total_neto, totales_metodo, fecha_cierre
    FROM CAJA_DIARIA
    ORDER BY fecha DESC
  `).all().map(r => ({
    ...r,
    totales_metodo: JSON.parse(r.totales_metodo || '{}'),
  }));
}

/**
 * Obtiene una caja diaria específica por fecha.
 *
 * @param {string} fecha
 * @returns {object|null}
 */
function getCajaDiariaPorFecha(fecha) {
  const row = db.prepare(`
    SELECT id, fecha, monto_inicial, total_ingresos, total_egresos,
           total_neto, totales_metodo, resumen_json, fecha_cierre
    FROM CAJA_DIARIA
    WHERE fecha = ?
  `).get(fecha);

  if (!row) return null;

  return {
    ...row,
    totales_metodo: JSON.parse(row.totales_metodo || '{}'),
    resumen_json: JSON.parse(row.resumen_json || '{}'),
  };
}

module.exports = {
  getResumenCaja,
  registrarEgreso,
  eliminarEgreso,
  guardarCajaDiaria,
  getHistorialCaja,
  getCajaDiariaPorFecha,
};
