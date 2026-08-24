const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('../db/database');
const { localDateTime, contarHabiles, desglosarMensual } = require('../utils/date');

const CONTRATOS_DIR = path.join(app.getPath('documents'), 'AlquilerContratos');

function ensureDir() {
  if (!fs.existsSync(CONTRATOS_DIR)) {
    fs.mkdirSync(CONTRATOS_DIR, { recursive: true });
  }
}

function getConfig(clave) {
  const row = db.prepare('SELECT valor FROM CONFIGURACION WHERE clave = ?').get(clave);
  return row ? row.valor : '';
}

/**
 * Agrupa ítems del contrato por (nombre + precio + tarifa + fecha de devolución),
 * sumando la cantidad. Permite mostrar "3 × Amoladora" en una sola línea sin exponer códigos.
 */
function agruparItems(items) {
  const grupos = [];
  const idx = new Map();
  for (const item of items) {
    const desgloseKey =
      item.desglose && item.desglose.length > 0
        ? JSON.stringify(item.desglose.map(d => String(d.cantidad) + '::' + String(d.nombre)))
        : '';
    const key = [
      item.nombre || '',
      item.precio_dia,
      item.tarifa || 'dia',
      item.fecha_salida_item || '',
      item.fecha_devolucion_pactada || '',
      desgloseKey,
    ].join('|');
    if (idx.has(key)) {
      const exist = idx.get(key);
      exist.cantidad = (exist.cantidad || 1) + (item.cantidad || 1);
      if (item.snapshot != null && exist.snapshotValido) exist.snapshot += item.snapshot;
      if (item.snapshot == null) exist.snapshotValido = false;
    } else {
      const nuevo = {
        ...item,
        snapshot: item.snapshot != null ? item.snapshot : undefined,
        snapshotValido: item.snapshot != null,
      };
      idx.set(key, nuevo);
      grupos.push(nuevo);
    }
  }
  for (const g of grupos) {
    if (!g.snapshotValido) delete g.snapshot;
    delete g.snapshotValido;
  }
  return grupos;
}

function generarPdfDesdeDatos(datos) {
  ensureDir();
  const { arrendadora, cliente, fechas, total, numContrato, firmaPath, deposito, firmaBase64 } = datos;
  const cuenta = datos.cuenta || null;
  const totalMostrar = cuenta ? cuenta.total_general : total;
  const items = agruparItems(datos.items || []);

  // Si hay firma en base64, guardarla temporal para previsualización
  let firmaPreviewPath = firmaPath;
  if (!firmaPreviewPath && firmaBase64) {
    const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    firmaPreviewPath = path.join(CONTRATOS_DIR, `firma_preview_${Date.now()}.png`);
    fs.writeFileSync(firmaPreviewPath, buffer);
  }
  const dias = Math.max(1, Math.ceil(
    (new Date(fechas.devolucion + 'T00:00:00') - new Date(fechas.salida + 'T00:00:00')) / 86400000
  ) + 1);
  const totalItems = items.reduce((a, i) => {
    if (i.snapshot != null) return a + i.snapshot;
    const fechaSalidaItem = i.fecha_salida_item || fechas.salida;
    const fechaDevItem = i.fecha_devolucion_pactada || fechas.devolucion;
    if (i.tarifa === 'mes') {
      const desg = desglosarMensual(fechaSalidaItem, fechaDevItem);
      const diaria = i.precio_dia / 30;
      if (desg.meses > 0) return a + (i.precio_dia * desg.meses + diaria * desg.diasExtra) * i.cantidad;
      return a + diaria * desg.totalHabiles * i.cantidad;
    }
    return a + i.precio_dia * contarHabiles(fechaSalidaItem, fechaDevItem) * i.cantidad;
  }, 0);

  const nro = numContrato || 'PREVIEW';
  const filePath = numContrato
    ? path.join(CONTRATOS_DIR, `contrato_${numContrato}.pdf`)
    : path.join(CONTRATOS_DIR, `preview_${Date.now()}.pdf`);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 35, bottom: 35, left: 45, right: 45 },
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // ===== ENCABEZADO (#1: N° siempre visible) =====
  doc.fontSize(22).font('Helvetica-Bold').text('QUISPE', { align: 'center' });
  doc.fontSize(12).text('CONTRATO DE ALQUILER DE MAQUINARIAS', { align: 'center' });
  doc.fontSize(12).text('DE CONSTRUCCION', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica-Bold').text(`N° ${nro}`, { align: 'center' });
  doc.moveDown(0.3);

  const tel2 = getConfig('arrendadora_telefono2');
  doc.fontSize(8).font('Helvetica').text(
    `RUC: ${arrendadora.ruc}  |  Tel: ${arrendadora.telefono}${tel2 ? ' / ' + tel2 : ''}`,
    { align: 'center' }
  );
  doc.moveDown(0.3);

  // Línea separadora
  doc.moveTo(45, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  // ===== DATOS ARRENDADORA =====
  doc.fontSize(9).font('Helvetica-Bold').text('ARRENDADORA:', { continued: true });
  doc.font('Helvetica').text(`  ${arrendadora.nombre}`);
  doc.fontSize(8).text(`DNI N° ${arrendadora.dni}  |  Dirección: ${arrendadora.direccion}, Andahuaylas`);
  doc.moveDown(0.3);

  // ===== DATOS ARRENDATARIO (#8: Domicilio legible) =====
  doc.fontSize(9).font('Helvetica-Bold').text('ARRENDATARIO:', { continued: true });
  doc.font('Helvetica').text(`  ${cliente.nombre}`);
  const dom = cliente.direccion || 'No registrado';
  doc.fontSize(8).text(`DNI N° ${cliente.dni || '—'}  |  Tel: ${cliente.telefono || '—'}  |  Domicilio: ${dom}`);
  if (cliente.ubicacionObra) {
    doc.fontSize(8).text(`Ubicación de obra: ${cliente.ubicacionObra}`);
  }
  doc.moveDown(0.5);

  // ===== CLÁUSULAS (#10: [TOTAL] sin S/ duplicado) =====
  const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  const formatFechaLarga = (f) => {
    if (!f) return '';
    const p = f.split('-');
    if (p.length !== 3) return f;
    const dia = parseInt(p[2], 10);
    const mes = MESES[parseInt(p[1], 10) - 1];
    const anio = p[0];
    return `${dia} de ${mes} del ${anio}`;
  };

  const clausulasRaw = getConfig('contrato_clausulas');
  const clausulas = clausulasRaw
    .replaceAll('[ARRENDADORA_NOMBRE]', arrendadora.nombre)
    .replaceAll('[ARRENDADORA_DNI]', arrendadora.dni)
    .replaceAll('[ARRENDADORA_DIRECCION]', arrendadora.direccion)
    .replaceAll('[CLIENTE_NOMBRE]', cliente.nombre)
    .replaceAll('[CLIENTE_DNI]', cliente.dni || '—')
    .replaceAll('[CLIENTE_DIRECCION_TEXTO]', cliente.direccion ? `con domicilio en ${cliente.direccion}` : 'sin domicilio registrado')
    .replaceAll('[TOTAL]', totalMostrar.toFixed(2))
    .replaceAll('[DEPOSITO_TEXTO]', '').trimEnd();

  doc.fontSize(7).font('Helvetica');
  const parrafos = clausulas.split('\n\n');
  parrafos.forEach((p) => {
    if (!p.trim()) return;
    if (doc.y > 700) doc.addPage();
    const isClausula = /^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO):/.test(p.trim());
    if (isClausula) {
      doc.font('Helvetica-Bold');
    } else {
      doc.font('Helvetica');
    }
    doc.text(p.trim(), 45, doc.y, { width: 505, align: 'justify' });
    doc.moveDown(0.3);
  });

  doc.moveDown(0.5);

  // ===== EQUIPOS ALQUILADOS (#5: columna Mora/día, #9: granel como Material) =====
  doc.fontSize(9).font('Helvetica-Bold').text('EQUIPOS ALQUILADOS:');
  doc.moveDown(0.3);

  const formatFechaCorta = (f) => {
    if (!f) return '—';
    const p = f.split('-');
    if (p.length !== 3) return f;
    const dia = parseInt(p[2], 10);
    const mes = MESES[parseInt(p[1], 10) - 1].substring(0, 3);
    return `${dia} ${mes} ${p[0]}`;
  };

  const colX = [45, 80, 310, 395, 480];
  const colWidths = [30, 225, 80, 80, 65];
  const headers = ['Cant.', 'Descripción', 'Salida', 'Entrega', 'Subtotal'];
  const headerAlign = ['center', 'left', 'center', 'center', 'right'];
  const tableTop = doc.y;

  doc.fontSize(6.5).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: colWidths[i], align: headerAlign[i] }));
  doc.moveDown(0.3);
  doc.moveTo(45, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.1);

  doc.font('Helvetica').fontSize(6.5);
  let y = doc.y;
  items.forEach((item) => {
    const tarifa = item.tarifa || 'dia';
    const fechaSalidaItem = item.fecha_salida_item || fechas.salida;
    const fechaDevItem = item.fecha_devolucion_pactada || fechas.devolucion;
    const sub = item.snapshot != null
      ? item.snapshot
      : (tarifa === 'mes'
          ? (() => {
              const desg = desglosarMensual(fechaSalidaItem, fechaDevItem);
              const diaria = item.precio_dia / 30;
              if (desg.meses > 0) return (item.precio_dia * desg.meses + diaria * desg.diasExtra) * item.cantidad;
              return diaria * desg.totalHabiles * item.cantidad;
            })()
          : item.precio_dia * contarHabiles(fechaSalidaItem, fechaDevItem) * item.cantidad);
    const esGranel = item.codigo && item.codigo.includes('(') && !/^[A-Z]+-\d/.test(item.codigo);
    const descripcion = (esGranel ? 'Material: ' : '') + (item.nombre || '—');
    const subTxt = `S/ ${sub.toFixed(2)}`;
    const salidaTxt = formatFechaCorta(fechaSalidaItem);
    const entregaTxt = formatFechaCorta(fechaDevItem);

    if (y > 720) { doc.addPage(); y = 45; }

    const hDesc = doc.heightOfString(descripcion, { width: colWidths[1] });
    const hSalida = doc.heightOfString(salidaTxt, { width: colWidths[2] });
    const hEntrega = doc.heightOfString(entregaTxt, { width: colWidths[3] });
    const hSub = doc.heightOfString(subTxt, { width: colWidths[4] });
    const altoFila = Math.max(hDesc, hSalida, hEntrega, hSub) + 2;

    doc.text(String(item.cantidad), colX[0], y, { width: colWidths[0], align: 'center' });
    doc.text(descripcion, colX[1], y, { width: colWidths[1] });
    doc.text(salidaTxt, colX[2], y, { width: colWidths[2], align: 'center' });
    doc.text(entregaTxt, colX[3], y, { width: colWidths[3], align: 'center' });
    doc.text(subTxt, colX[4], y, { width: colWidths[4], align: 'right' });
    y += altoFila;
    if (item.desglose) {
      const lineas = Array.isArray(item.desglose)
        ? item.desglose
        : [{ cantidad: '', nombre: 'Incluye: ' + item.desglose }];
      doc.font('Helvetica-Oblique').fontSize(7);
      for (const c of lineas) {
        if (y > 720) { doc.addPage(); y = 45; }
        const hLinea = doc.heightOfString('• ' + (c.cantidad ? c.cantidad + ' × ' : '') + (c.nombre || '—'), { width: colX[2] - colX[1] - 5 });
        doc.text('• ' + (c.cantidad ? c.cantidad + ' × ' : '') + (c.nombre || '—'), colX[1], y, { width: colX[2] - colX[1] - 5 });
        y += hLinea + 1;
      }
      doc.font('Helvetica').fontSize(6.5);
    }
  });

  // Total
  y += 2;
  doc.moveTo(45, y).lineTo(550, y).stroke();
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(8);
  doc.text(`TOTAL:  S/ ${totalItems.toFixed(2)}`, { align: 'right' });
  doc.moveDown(0.5);

  doc.moveDown(0.5);

  // ===== PAGOS =====
  const pagosY = doc.y;

  // Cálculos
  const totalBase = totalItems;
  const mora = cuenta?.total_atraso || 0;
  const danos = cuenta?.total_danos || 0;
  const perdidas = cuenta?.total_perdidas || 0;
  const totalAPagar = totalBase + mora + danos + perdidas;
  const pagado = cuenta?.total_pagado || 0;
  const saldo = Math.max(0, totalAPagar - pagado);

  // Columna izquierda: PAGOS
  const pagosX = 45;
  const pagosAncho = 260;
  const colDerX = 320;
  const lineH = 12;
  let py = pagosY;

  // Título PAGOS
  doc.fontSize(8).font('Helvetica-Bold').text('PAGOS:', pagosX, py);
  py += 14;

  // Título GARANTÍA (columna derecha)
  doc.text('GARANTÍA:', colDerX, pagosY);

  // Garantía (columna derecha)
  doc.font('Helvetica').fontSize(8);
  const garantiaMonto = deposito?.monto || 0;
  if (garantiaMonto > 0) {
    doc.text(`S/ ${garantiaMonto.toFixed(2)} como depósito`, colDerX, pagosY + 14);
  } else {
    doc.text('Ninguna', colDerX, pagosY + 14);
  }

  // Total base
  doc.font('Helvetica').text('Total', pagosX, py);
  doc.font('Helvetica-Bold').text(`S/ ${totalBase.toFixed(2)}`, pagosX, py + 10);
  py += 24;

  // Mora (solo si > 0)
  if (mora > 0) {
    doc.font('Helvetica').text('Mora', pagosX, py);
    doc.font('Helvetica-Bold').text(`+ S/ ${mora.toFixed(2)}`, pagosX, py + 10);
    py += 24;
  }

  // Daños (solo si > 0)
  if (danos > 0) {
    doc.font('Helvetica').text('Daños', pagosX, py);
    doc.font('Helvetica-Bold').text(`+ S/ ${danos.toFixed(2)}`, pagosX, py + 10);
    py += 24;
  }

  // Pérdidas (solo si > 0)
  if (perdidas > 0) {
    doc.font('Helvetica').text('Pérdidas', pagosX, py);
    doc.font('Helvetica-Bold').text(`+ S/ ${perdidas.toFixed(2)}`, pagosX, py + 10);
    py += 24;
  }

  // Total a pagar
  doc.font('Helvetica').text('Total a pagar', pagosX, py);
  doc.font('Helvetica-Bold').text(`S/ ${totalAPagar.toFixed(2)}`, pagosX, py + 10);
  py += 24;

  // Pagado a la fecha
  if (cuenta) {
    doc.font('Helvetica').text('Pagado a la fecha', pagosX, py);
    doc.font('Helvetica-Bold').text(`- S/ ${pagado.toFixed(2)}`, pagosX, py + 10);
    py += 24;
  }

  // SALDO PENDIENTE
  doc.font('Helvetica-Bold').text('SALDO PENDIENTE', pagosX, py);
  doc.text(`S/ ${saldo.toFixed(2)}`, pagosX, py + 12);

  // Fecha de devolución real
  if (cuenta?.fecha_devolucion_real) {
    doc.font('Helvetica-Oblique').fontSize(7);
    doc.text(`Devuelto el ${formatFechaLarga(cuenta.fecha_devolucion_real)}`, colDerX, pagosY + 28);
    doc.font('Helvetica').fontSize(8);
  }

  doc.moveDown(6);

  // Firma de la arrendadora (desde Configuración)
  let firmaArrPath = null;
  const firmaArrBase64 = getConfig('arrendadora_firma_base64');
  if (firmaArrBase64) {
    const buf = Buffer.from(firmaArrBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    firmaArrPath = path.join(CONTRATOS_DIR, 'firma_arrendadora.png');
    fs.writeFileSync(firmaArrPath, buf);
  }

  // ===== FIRMAS (3 líneas individuales) =====
  const firmaY = doc.y;
  const colFirmas = [45, 220, 400];
  const anchoLinea = 140;

  // Líneas individuales para cada firmante
  doc.moveTo(colFirmas[0], firmaY).lineTo(colFirmas[0] + anchoLinea, firmaY).stroke();
  doc.moveTo(colFirmas[1], firmaY).lineTo(colFirmas[1] + anchoLinea, firmaY).stroke();
  doc.moveTo(colFirmas[2], firmaY).lineTo(colFirmas[2] + anchoLinea, firmaY).stroke();

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('ARRENDADORA', colFirmas[0], firmaY + 8, { width: anchoLinea, align: 'center' });
  doc.text('ARRENDATARIO', colFirmas[1], firmaY + 8, { width: anchoLinea, align: 'center' });
  doc.text('GARANTE', colFirmas[2], firmaY + 8, { width: anchoLinea, align: 'center' });

  // Firma de la arrendadora (arriba de su línea)
  if (firmaArrPath && fs.existsSync(firmaArrPath)) {
    doc.image(firmaArrPath, colFirmas[0] + 10, firmaY - 55, { fit: [120, 45], align: 'center', valign: 'middle' });
  }

  // Firma del cliente: imagen grande arriba de la línea
  if (firmaPreviewPath && fs.existsSync(firmaPreviewPath)) {
    doc.image(firmaPreviewPath, colFirmas[1] + 10, firmaY - 55, { fit: [120, 45], align: 'center', valign: 'middle' });
  }

  doc.fontSize(7).font('Helvetica');
  const alturaNombreArr = doc.heightOfString(arrendadora.nombre, { width: anchoLinea });
  const alturaNombreCli = doc.heightOfString(cliente.nombre, { width: anchoLinea });
  const nombreY = firmaY + 38;
  const dniY = nombreY + Math.max(alturaNombreArr, alturaNombreCli) + 5;

  doc.text(arrendadora.nombre, colFirmas[0], nombreY, { width: anchoLinea, align: 'center' });
  doc.text(`DNI N° ${arrendadora.dni}`, colFirmas[0], dniY, { width: anchoLinea, align: 'center' });

  doc.text(cliente.nombre, colFirmas[1], nombreY, { width: anchoLinea, align: 'center' });
  doc.text(`DNI N° ${cliente.dni || '—'}`, colFirmas[1], dniY, { width: anchoLinea, align: 'center' });

  const fechaHoy = new Date().toLocaleDateString('es-PE', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  doc.fontSize(8).font('Helvetica-Bold');
  doc.text(`Andahuaylas, ${fechaHoy}`, 45, dniY + 50, { align: 'center', width: 505 });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

function generarPdf(idContrato) {
  const contrato = db.prepare(`
    SELECT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
           cl.telefono AS cliente_telefono, cl.direccion AS cliente_direccion
    FROM CONTRATO c JOIN CLIENTE cl ON c.id_cliente = cl.id WHERE c.id = ?
  `).get(idContrato);
  if (!contrato) throw new Error('Contrato no encontrado.');

  const detalles = db.prepare(`
    SELECT d.*,
           COALESCE(h.nombre, json_extract(d.item_snapshot, '$.nombre'), i.nombre, k.nombre) AS item_nombre,
           COALESCE(h.id, json_extract(d.item_snapshot, '$.codigo'), i.nombre || ' (' || i.condicion || ')', k.nombre) AS item_codigo
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
    LEFT JOIN KIT k ON d.tipo_item = 'kit' AND d.id_kit = k.id
    WHERE d.id_contrato = ?
  `).all(idContrato);

  const arrendadora = {
    nombre: getConfig('arrendadora_nombre'),
    dni: getConfig('arrendadora_dni'),
    ruc: getConfig('arrendadora_ruc'),
    direccion: getConfig('arrendadora_direccion'),
    telefono: getConfig('arrendadora_telefono'),
  };

  const totalItems = detalles.reduce((a, d) => {
    if (d.total_item_snapshot != null) return a + d.total_item_snapshot;
    const fechaSalidaItem = d.fecha_salida_item || contrato.fecha_salida;
    const fechaDevItem = d.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada;
    if ((d.tarifa_aplicada || 'dia') === 'mes') {
      const desg = desglosarMensual(fechaSalidaItem, fechaDevItem);
      const diaria = d.precio_dia_aplicado / 30;
      if (desg.meses > 0) return a + (d.precio_dia_aplicado * desg.meses + diaria * desg.diasExtra) * d.cantidad;
      return a + diaria * desg.totalHabiles * d.cantidad;
    }
    return a + d.precio_dia_aplicado * contarHabiles(fechaSalidaItem, fechaDevItem) * d.cantidad;
  }, 0);
  const total = totalItems + (contrato.deposito_monto || 0);

  const { getDetalleContrato } = require('./clienteService');
  const det = getDetalleContrato(idContrato);
  const cuenta = {
    fecha_devolucion_real: contrato.fecha_devolucion_real,
    total_pagado: det.total_pagado,
    saldo: Math.max(0, det.total_general - det.total_pagado),
    total_atraso: det.total_atraso,
    total_danos: det.total_danos,
    total_perdidas: det.total_perdidas,
    total_general: det.total_general,
  };

  return generarPdfDesdeDatos({
    arrendadora,
    cliente: {
      nombre: contrato.cliente_nombre,
      dni: contrato.cliente_dni,
      telefono: contrato.cliente_telefono,
      direccion: contrato.cliente_direccion,
      ubicacionObra: contrato.ubicacion_obra || '',
    },
    items: (() => {
      const filas = [];
      for (const d of detalles) {
        const fechaSalidaItem = d.fecha_salida_item || contrato.fecha_salida;
        const fechaDevItem = d.fecha_devolucion_pactada_item || contrato.fecha_devolucion_pactada;
        if (d.tipo_item === 'kit') {
          const hijos = detalles.filter(x => x.id_kit === d.id_kit && x.tipo_item !== 'kit');
          const desglose = hijos.map(x => ({ cantidad: x.cantidad, nombre: x.item_nombre }));
          filas.push({
            codigo: d.item_codigo,
            nombre: d.item_nombre,
            cantidad: d.cantidad,
            precio_dia: d.precio_dia_aplicado,
            fecha_salida_item: fechaSalidaItem,
            fecha_devolucion_pactada: fechaDevItem,
            tarifa: d.tarifa_aplicada || 'dia',
            snapshot: d.total_item_snapshot,
            desglose,
          });
        } else if (!d.id_kit) {
          filas.push({
            codigo: d.item_codigo,
            nombre: d.item_nombre,
            cantidad: d.cantidad,
            precio_dia: d.precio_dia_aplicado,
            fecha_salida_item: fechaSalidaItem,
            fecha_devolucion_pactada: fechaDevItem,
            tarifa: d.tarifa_aplicada || 'dia',
            snapshot: d.total_item_snapshot,
          });
        }
      }
      return filas;
    })(),
    fechas: { salida: contrato.fecha_salida, devolucion: contrato.fecha_devolucion_pactada },
    total,
    cuenta,
    deposito: (() => {
      let monto = contrato.deposito_monto || 0;
      // Fallback: si deposito_monto es 0, consultar pagos tipo 'deposito'
      if (monto === 0) {
        const row = db.prepare("SELECT COALESCE(SUM(monto), 0) AS total FROM PAGO WHERE id_contrato = ? AND tipo = 'deposito'").get(idContrato);
        if (row && row.total > 0) monto = row.total;
      }
      return { monto, dniRetenido: !!contrato.deposito_dni };
    })(),
    numContrato: String(idContrato).padStart(6, '0'),
    firmaPath: contrato.firma_digital_path,
  });
}

function guardarFirma(idContrato, firmaBase64) {
  ensureDir();
  const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const filePath = path.join(CONTRATOS_DIR, `firma_${idContrato}.png`);
  fs.writeFileSync(filePath, buffer);
  db.prepare('UPDATE CONTRATO SET firma_digital_path = ?, fecha_modificacion = ? WHERE id = ?').run(filePath, localDateTime(), idContrato);
  return filePath;
}

module.exports = { generarPdf, guardarFirma, generarPdfDesdeDatos };
