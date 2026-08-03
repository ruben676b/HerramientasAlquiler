const db = require('../db/database');
const { localDate } = require('../utils/date');

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

  // 1. Totales por método de pago
  const totalesMetodo = db.prepare(`
    SELECT
      metodo,
      SUM(CASE WHEN tipo != 'devolucion_deposito' THEN monto ELSE 0 END) AS ingresos,
      SUM(CASE WHEN tipo = 'devolucion_deposito' THEN monto ELSE 0 END) AS egresos
    FROM PAGO
    WHERE DATE(fecha_pago) = ?
    GROUP BY metodo
  `).all(fecha);

  // Construir objeto de totales
  const totalesPorMetodo = { efectivo: 0, yape: 0, plin: 0, totalIngresos: 0, totalEgresos: 0 };
  for (const row of totalesMetodo) {
    totalesPorMetodo[row.metodo] = (row.ingresos || 0) - (row.egresos || 0);
    totalesPorMetodo.totalIngresos += row.ingresos || 0;
    totalesPorMetodo.totalEgresos += row.egresos || 0;
  }

  // 2. Resumen cruzado: concepto × método
  const resumenRows = db.prepare(`
    SELECT
      tipo,
      metodo,
      SUM(monto) AS total
    FROM PAGO
    WHERE DATE(fecha_pago) = ?
    GROUP BY tipo, metodo
    ORDER BY tipo, metodo
  `).all(fecha);

  // Organizar en tabla cruzada
  const conceptos = ['adelanto', 'saldo', 'mora', 'deposito', 'devolucion_deposito'];
  const metodos = ['efectivo', 'yape', 'plin'];
  const resumenConcepto = conceptos.map(tipo => {
    const fila = { tipo, efectivo: 0, yape: 0, plin: 0, total: 0 };
    for (const row of resumenRows) {
      if (row.tipo === tipo) {
        fila[row.metodo] = row.total;
        fila.total += row.total;
      }
    }
    return fila;
  }).filter(f => f.total > 0); // Solo mostrar conceptos con movimientos

  // 3. Listado detallado de movimientos
  const movimientos = db.prepare(`
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
    WHERE DATE(p.fecha_pago) = ?
    ORDER BY p.fecha_pago DESC
  `).all(fecha);

  // 4. Contadores rápidos
  const contadores = db.prepare(`
    SELECT
      COUNT(*) AS total_movimientos,
      COUNT(DISTINCT p.id_contrato) AS total_contratos
    FROM PAGO p
    WHERE DATE(p.fecha_pago) = ?
  `).get(fecha);

  return {
    fecha,
    totalesPorMetodo,
    resumenConcepto,
    movimientos,
    totalMovimientos: contadores.total_movimientos,
    totalContratos: contadores.total_contratos,
  };
}

module.exports = { getResumenCaja };
