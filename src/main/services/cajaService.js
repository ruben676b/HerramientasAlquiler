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

  // Construir objeto de totales
  const totalesPorMetodo = { efectivo: 0, yape: 0, plin: 0, totalIngresos: 0, totalEgresos: 0 };

  for (const row of totalesMetodoPago) {
    const egresoDirecto = egresosDirectosMap[row.metodo] || 0;
    const totalEgresosMetodo = (row.egresos || 0) + egresoDirecto;
    totalesPorMetodo[row.metodo] = (row.ingresos || 0) - totalEgresosMetodo;
    totalesPorMetodo.totalIngresos += row.ingresos || 0;
    totalesPorMetodo.totalEgresos += totalEgresosMetodo;
    delete egresosDirectosMap[row.metodo];
  }

  // Agregar egresos directos de métodos sin transacciones en PAGO
  for (const [metodo, egresoDirecto] of Object.entries(egresosDirectosMap)) {
    if (egresoDirecto > 0) {
      totalesPorMetodo[metodo] = (totalesPorMetodo[metodo] || 0) - egresoDirecto;
      totalesPorMetodo.totalEgresos += egresoDirecto;
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

  const movimientos = [...movimientosPago, ...movimientosEgreso].sort((a, b) => {
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

  return {
    fecha,
    totalesPorMetodo,
    resumenConcepto,
    movimientos,
    totalMovimientos: (contadoresPago.total_movimientos || 0) + (totalEgresoCount || 0),
    totalContratos: contadoresPago.total_contratos || 0,
  };
}

module.exports = {
  getResumenCaja,
  registrarEgreso,
  eliminarEgreso,
};
