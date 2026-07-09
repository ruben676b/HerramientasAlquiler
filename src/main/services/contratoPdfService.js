const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('../db/database');

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

function generarPdfDesdeDatos(datos) {
  ensureDir();
  const { arrendadora, cliente, items, fechas, total, numContrato, firmaPath, deposito, firmaBase64 } = datos;

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
  const totalItems = items.reduce((a, i) => a + i.precio_dia * dias * i.cantidad, 0);

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
  doc.moveDown(0.5);

  // ===== CLÁUSULAS (#10: [TOTAL] sin S/ duplicado) =====
  const clausulasRaw = getConfig('contrato_clausulas');
  const clausulas = clausulasRaw
    .replaceAll('[ARRENDADORA_NOMBRE]', arrendadora.nombre)
    .replaceAll('[ARRENDADORA_DNI]', arrendadora.dni)
    .replaceAll('[ARRENDADORA_DIRECCION]', arrendadora.direccion)
    .replaceAll('[CLIENTE_NOMBRE]', cliente.nombre)
    .replaceAll('[CLIENTE_DNI]', cliente.dni || '—')
    .replaceAll('[CLIENTE_DIRECCION]', cliente.direccion || '—')
    .replaceAll('[TOTAL]', `S/ ${total.toFixed(2)}`)
    .replaceAll('[FECHA_INICIO]', fechas.salida)
    .replaceAll('[FECHA_DEVOLUCION]', fechas.devolucion)
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

  const colX = [45, 105, 185, 255, 340, 430];
  const colWidths = [55, 75, 25, 55, 55, 55];
  const headers = ['Código', 'Descripción', 'Cant.', 'Precio/día', 'Mora/día', 'Subtotal'];
  const tableTop = doc.y;

  doc.fontSize(6.5).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: colWidths[i] }));
  doc.moveDown(0.3);
  doc.moveTo(45, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.1);

  doc.font('Helvetica').fontSize(6.5);
  let y = doc.y;
  items.forEach((item) => {
    if (y > 720) { doc.addPage(); y = 45; }
    const sub = item.precio_dia * dias * item.cantidad;
    const esGranel = item.codigo && item.codigo.includes('(') && !/^[A-Z]+-\d/.test(item.codigo);
    const codigo = esGranel ? 'Material' : (item.codigo || '—');
    doc.text(codigo, colX[0], y, { width: colWidths[0] });
    doc.text(item.nombre || '—', colX[1], y, { width: colWidths[1] });
    doc.text(String(item.cantidad), colX[2], y, { width: colWidths[2], align: 'center' });
    doc.text(`S/ ${item.precio_dia.toFixed(2)}`, colX[3], y, { width: colWidths[3], align: 'right' });
    doc.text(`S/ ${(item.mora_dia || 0).toFixed(2)}`, colX[4], y, { width: colWidths[4], align: 'right' });
    doc.text(`S/ ${sub.toFixed(2)}`, colX[5], y, { width: colWidths[5], align: 'right' });
    y += 11;
  });

  // Total
  y += 2;
  doc.moveTo(45, y).lineTo(550, y).stroke();
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(8);
  doc.text(`TOTAL:  S/ ${total.toFixed(2)}`, { align: 'right' });
  doc.moveDown(0.5);

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

  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9);
  const textoPeriodo = `Fecha del ${formatFechaLarga(fechas.salida)} hasta el ${formatFechaLarga(fechas.devolucion)} (${dias} día${dias !== 1 ? 's' : ''})`;
  doc.text(textoPeriodo, 45, doc.y, { width: 505, align: 'right' });
  doc.moveDown(1);

  // ===== PAGOS (#6: S/ 0.00, #7: Garantía) =====
  const pagosY = doc.y;
  doc.fontSize(8).font('Helvetica-Bold').text('PAGOS:', 45, pagosY);
  doc.font('Helvetica').fontSize(8);
  doc.text(`A CUENTA: S/ ${(deposito?.aCuenta || 0).toFixed(2)}`, 45, pagosY + 14);
  doc.text(`SALDO:    S/ ${(deposito?.saldo || total).toFixed(2)}`, 250, pagosY + 14);
  doc.text(`TOTAL:    S/ ${total.toFixed(2)}`, 250, pagosY + 28);

  const garantiaText = [];
  if (deposito?.dniRetenido) garantiaText.push(`DNI retenido N° ${cliente.dni}`);
  if (deposito?.monto > 0) garantiaText.push(`S/ ${deposito.monto.toFixed(2)} como depósito`);
  const garantia = garantiaText.length > 0 ? `GARANTÍA: ${garantiaText.join(' + ')}` : 'GARANTÍA: Ninguna';
  doc.text(garantia, 45, pagosY + 34);

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
    doc.image(firmaArrPath, colFirmas[0] + 10, firmaY - 55, { width: 120, height: 45 });
  }

  // Firma del cliente: imagen grande arriba de la línea
  if (firmaPreviewPath && fs.existsSync(firmaPreviewPath)) {
    doc.image(firmaPreviewPath, colFirmas[1] + 10, firmaY - 55, { width: 120, height: 45 });
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
    SELECT d.*, COALESCE(h.nombre, i.nombre) AS item_nombre,
           COALESCE(h.id, i.nombre || ' (' || i.condicion || ')') AS item_codigo,
           COALESCE(h.mora_dia, i.mora_dia) AS item_mora
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
    WHERE d.id_contrato = ?
  `).all(idContrato);

  const arrendadora = {
    nombre: getConfig('arrendadora_nombre'),
    dni: getConfig('arrendadora_dni'),
    ruc: getConfig('arrendadora_ruc'),
    direccion: getConfig('arrendadora_direccion'),
    telefono: getConfig('arrendadora_telefono'),
  };

  const dias = Math.max(1, Math.ceil(
    (new Date(contrato.fecha_devolucion_pactada + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
  ) + 1);
  const totalItems = detalles.reduce((a, d) => a + d.precio_dia_aplicado * dias * d.cantidad, 0);
  const total = totalItems + (contrato.deposito_monto || 0);

  return generarPdfDesdeDatos({
    arrendadora,
    cliente: {
      nombre: contrato.cliente_nombre,
      dni: contrato.cliente_dni,
      telefono: contrato.cliente_telefono,
      direccion: contrato.cliente_direccion,
    },
    items: detalles.map(d => ({
      codigo: d.item_codigo,
      nombre: d.item_nombre,
      cantidad: d.cantidad,
      precio_dia: d.precio_dia_aplicado,
      mora_dia: d.item_mora || d.mora_dia_aplicada || 0,
    })),
    fechas: { salida: contrato.fecha_salida, devolucion: contrato.fecha_devolucion_pactada },
    total,
    deposito: {
      monto: contrato.deposito_monto || 0,
      dniRetenido: !!contrato.deposito_dni,
    },
    numContrato: String(idContrato).padStart(6, '0'),
    firmaPath: contrato.firma_digital_path,
  });
}

function guardarFirma(idContrato, firmaBase64) {
  ensureDir();
  const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const filePath = path.join(CONTRATOS_DIR, `firma_${idContrato}.png`);
  fs.writeFileSync(filePath, buffer);
  db.prepare('UPDATE CONTRATO SET firma_digital_path = ? WHERE id = ?').run(filePath, idContrato);
  return filePath;
}

module.exports = { generarPdf, guardarFirma, generarPdfDesdeDatos };
