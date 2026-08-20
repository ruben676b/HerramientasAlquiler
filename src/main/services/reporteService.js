const db = require('../db/database');
const { localDateTime } = require('../utils/date');

function generarReporte() {
  const ahora = localDateTime();

  const ultimoReporte = db.prepare(`
    SELECT fecha_fin FROM REPORTE ORDER BY id DESC LIMIT 1
  `).get();

  const fechaCorte = ultimoReporte ? ultimoReporte.fecha_fin : '1900-01-01 00:00:00';

  const contratos = obtenerContratosCompletados(fechaCorte, ahora);
  const ventas = db.prepare(`
    SELECT id, nombre_item, total, metodo, fecha, cliente_nombre
    FROM VENTA_INVENTARIO
    WHERE fecha > ? AND fecha <= ?
    ORDER BY fecha
  `).all(fechaCorte, ahora);

  const egresos = db.prepare(`
    SELECT id, descripcion, monto, metodo, fecha
    FROM EGRESO_CAJA
    WHERE fecha > ? AND fecha <= ?
    ORDER BY fecha
  `).all(fechaCorte, ahora);

  if (contratos.length === 0 && ventas.length === 0 && egresos.length === 0) {
    throw new Error('No hay transacciones nuevas desde el último reporte.');
  }

  const totalesMetodo = { efectivo: 0, yape: 0, plin: 0 };
  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const c of contratos) {
    for (const p of c.pagos) {
      if (p.tipo === 'devolucion_deposito') {
        totalesMetodo[p.metodo] = (totalesMetodo[p.metodo] || 0) - p.monto;
        totalEgresos += p.monto;
      } else {
        totalesMetodo[p.metodo] = (totalesMetodo[p.metodo] || 0) + p.monto;
        totalIngresos += p.monto;
      }
    }
    if (c.total_danos) totalIngresos += c.total_danos;
    if (c.total_perdidas) totalIngresos += c.total_perdidas;
  }

  for (const v of ventas) {
    totalesMetodo[v.metodo] = (totalesMetodo[v.metodo] || 0) + v.total;
    totalIngresos += v.total;
  }

  for (const e of egresos) {
    totalesMetodo[e.metodo] = (totalesMetodo[e.metodo] || 0) - e.monto;
    totalEgresos += e.monto;
  }

  const totalNeto = totalIngresos - totalEgresos;

  const datos = {
    contratos: contratos.map(c => ({
      id: c.id,
      cliente_nombre: c.cliente_nombre,
      cliente_dni: c.cliente_dni,
      fecha_salida: c.fecha_salida,
      fecha_devolucion_pactada: c.fecha_devolucion_pactada,
      fecha_devolucion_real: c.fecha_devolucion_real,
      items: c.items.map(i => ({
        nombre: i.nombre,
        tipo_item: i.tipo_item,
        cantidad: i.cantidad,
        precio_dia_aplicado: i.precio_dia_aplicado,
        tarifa_aplicada: i.tarifa_aplicada,
        estado_devolucion: i.estado_devolucion,
        total_item_snapshot: i.total_item_snapshot,
      })),
      pagos: c.pagos.map(p => ({
        monto: p.monto,
        metodo: p.metodo,
        tipo: p.tipo,
        fecha_pago: p.fecha_pago,
        notas: p.notas,
      })),
      total_contrato: c.total_contrato,
      total_atraso: c.total_atraso || 0,
      total_danos: c.total_danos || 0,
      total_perdidas: c.total_perdidas || 0,
      total_pagado: c.total_pagado,
      deposito_monto: c.deposito_monto || 0,
    })),
    ventas: ventas.map(v => ({
      id: v.id,
      nombre_item: v.nombre_item,
      total: v.total,
      metodo: v.metodo,
      fecha: v.fecha,
      cliente_nombre: v.cliente_nombre,
    })),
    egresos: egresos.map(e => ({
      id: e.id,
      descripcion: e.descripcion,
      monto: e.monto,
      metodo: e.metodo,
      fecha: e.fecha,
    })),
  };

  const fechaInicio = fechaCorte === '1900-01-01 00:00:00'
    ? (contratos[0]?.fecha_salida || ventas[0]?.fecha || egresos[0]?.fecha || ahora)
    : fechaCorte;

  const stmt = db.prepare(`
    INSERT INTO REPORTE (fecha_generacion, fecha_inicio, fecha_fin, total_ingresos, total_egresos, total_neto, totales_metodo, datos_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    ahora, fechaInicio, ahora,
    totalIngresos, totalEgresos, totalNeto,
    JSON.stringify(totalesMetodo),
    JSON.stringify(datos)
  );

  return {
    id: result.lastInsertRowid,
    fecha_generacion: ahora,
    fecha_inicio: fechaInicio,
    fecha_fin: ahora,
    total_ingresos: totalIngresos,
    total_egresos: totalEgresos,
    total_neto: totalNeto,
    totales_metodo: totalesMetodo,
    datos_json: datos,
  };
}

function obtenerContratosCompletados(fechaCorte, fechaFin) {
  const contratos = db.prepare(`
    SELECT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
      (SELECT COALESCE(SUM(monto), 0) FROM PAGO WHERE id_contrato = c.id AND tipo NOT IN ('deposito', 'devolucion_deposito') AND (anulado IS NULL OR anulado = 0)) AS total_pagado
    FROM CONTRATO c
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE c.estado = 'devuelto'
      AND c.fecha_devolucion_real > ? AND c.fecha_devolucion_real <= ?
      AND c.papelera = 0
    ORDER BY c.fecha_devolucion_real
  `).all(fechaCorte, fechaFin);

  return contratos.map(c => {
    const items = db.prepare(`
      SELECT d.*,
        CASE
          WHEN d.tipo_item = 'individual' THEN COALESCE(h.nombre, d.id_herramienta)
          WHEN d.tipo_item = 'granel' THEN COALESCE(g.nombre, 'Ítem granel #' || d.id_item_granel)
          WHEN d.tipo_item = 'kit' THEN COALESCE(k.nombre, 'Kit #' || d.id_kit)
          ELSE 'Ítem'
        END AS nombre
      FROM DETALLE_CONTRATO d
      LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
      LEFT JOIN ITEM_GRANEL g ON d.id_item_granel = g.id
      LEFT JOIN KIT k ON d.id_kit = k.id
      WHERE d.id_contrato = ?
    `).all(c.id);

    const pagos = db.prepare(`
      SELECT monto, metodo, tipo, fecha_pago, notas
      FROM PAGO
      WHERE id_contrato = ? AND (anulado IS NULL OR anulado = 0)
      ORDER BY fecha_pago
    `).all(c.id);

    let totalAtraso = 0;
    let totalDanos = 0;
    let totalPerdidas = 0;
    let totalBase = 0;

    for (const item of items) {
      const fechaSalidaItem = item.fecha_salida_item || c.fecha_salida;
      const fechaPactadaItem = item.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
      const diasItem = Math.max(1, Math.ceil(
        (new Date(fechaPactadaItem + 'T00:00:00') - new Date(fechaSalidaItem + 'T00:00:00')) / 86400000
      ) + 1);
      const totalItem = item.total_item_snapshot != null
        ? item.total_item_snapshot
        : diasItem * item.precio_dia_aplicado * item.cantidad;
      totalBase += totalItem;

      if (item.fecha_devolucion_real) {
        const refDate = new Date(item.fecha_devolucion_real + 'T00:00:00');
        const pactadaDate = new Date(fechaPactadaItem + 'T00:00:00');
        const diasAtrasoItem = Math.max(0, Math.ceil((refDate - pactadaDate) / 86400000));
        totalAtraso += diasAtrasoItem * item.precio_dia_aplicado * item.cantidad;
      }

      if (item.costo_perdida) totalPerdidas += item.costo_perdida;
    }

    const devolucionesGranel = db.prepare(`
      SELECT COALESCE(SUM(costo_reparacion), 0) AS total_reparacion
      FROM DEVOLUCION_GRANEL
      WHERE id_contrato = ? AND revertido = 0
    `).get(c.id);
    totalDanos += devolucionesGranel.total_reparacion || 0;

    const danosIndividuales = db.prepare(`
      SELECT COALESCE(SUM(costo), 0) AS total_danos
      FROM DAÑO_DEVOLUCION
      WHERE id_contrato = ? AND revertido = 0
    `).get(c.id);
    totalDanos += danosIndividuales.total_danos || 0;

    const totalContrato = totalBase + (c.deposito_monto || 0);
    const totalGeneral = totalContrato + totalAtraso + totalDanos + totalPerdidas;

    if (totalGeneral - c.total_pagado > 0.01) return null;

    return {
      ...c,
      items,
      pagos,
      total_contrato: totalContrato,
      total_atraso: totalAtraso,
      total_danos: totalDanos,
      total_perdidas: totalPerdidas,
    };
  }).filter(Boolean);
}

function getReportes() {
  return db.prepare(`
    SELECT id, fecha_generacion, fecha_inicio, fecha_fin,
           total_ingresos, total_egresos, total_neto, totales_metodo
    FROM REPORTE
    ORDER BY id DESC
  `).all().map(r => ({
    ...r,
    totales_metodo: JSON.parse(r.totales_metodo || '{}'),
  }));
}

function getReporteById(id) {
  const row = db.prepare(`
    SELECT * FROM REPORTE WHERE id = ?
  `).get(id);

  if (!row) throw new Error('Reporte no encontrado.');

  return {
    ...row,
    totales_metodo: JSON.parse(row.totales_metodo || '{}'),
    datos_json: JSON.parse(row.datos_json || '{}'),
  };
}

module.exports = { generarReporte, getReportes, getReporteById };
