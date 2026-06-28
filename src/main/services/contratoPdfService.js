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

function generarPdf(idContrato) {
  ensureDir();

  const contrato = db.prepare(`
    SELECT c.*, cl.nombre AS cliente_nombre, cl.dni AS cliente_dni,
           cl.telefono AS cliente_telefono, cl.direccion AS cliente_direccion
    FROM CONTRATO c
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE c.id = ?
  `).get(idContrato);

  if (!contrato) throw new Error('Contrato no encontrado.');

  const detalles = db.prepare(`
    SELECT d.*, COALESCE(h.nombre, i.nombre) AS item_nombre,
           COALESCE(h.id, i.nombre || ' (' || i.condicion || ')') AS item_codigo
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

  const clausulasRaw = getConfig('contrato_clausulas');
  const dias = Math.max(1, Math.ceil(
    (new Date(contrato.fecha_devolucion_pactada + 'T00:00:00') - new Date(contrato.fecha_salida + 'T00:00:00')) / 86400000
  ));

  const totalItems = detalles.reduce((a, d) => a + d.precio_dia_aplicado * dias * d.cantidad, 0);
  const total = totalItems + (contrato.deposito_monto || 0);

  const numContrato = String(idContrato).padStart(6, '0');
  const filePath = path.join(CONTRATOS_DIR, `contrato_${numContrato}.pdf`);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 50, right: 50 },
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // === HEADER ===
  doc.fontSize(18).font('Helvetica-Bold').text('CONTRATO DE ALQUILER', { align: 'center' });
  doc.fontSize(11).font('Helvetica').text(`N° ${numContrato}`, { align: 'center' });
  doc.moveDown(0.5);

  // === ARRENDADORA ===
  doc.fontSize(9).font('Helvetica-Bold').text('ARRENDADORA:', { continued: true });
  doc.font('Helvetica').text(`  ${arrendadora.nombre}`);
  doc.fontSize(8).text(`DNI: ${arrendadora.dni}  |  RUC: ${arrendadora.ruc}  |  Tel: ${arrendadora.telefono}`);
  doc.text(`Dirección: ${arrendadora.direccion}, Andahuaylas`);
  doc.moveDown(0.3);

  // === CLIENTE ===
  doc.fontSize(9).font('Helvetica-Bold').text('ARRENDATARIO:', { continued: true });
  doc.font('Helvetica').text(`  ${contrato.cliente_nombre}`);
  doc.fontSize(8).text(`DNI: ${contrato.cliente_dni || '—'}  |  Tel: ${contrato.cliente_telefono || '—'}`);
  if (contrato.cliente_direccion) doc.text(`Dirección: ${contrato.cliente_direccion}`);
  doc.moveDown(0.5);

  // === TABLA DE EQUIPOS ===
  doc.fontSize(9).font('Helvetica-Bold').text('EQUIPOS ALQUILADOS:');
  doc.moveDown(0.2);

  const tableTop = doc.y;
  const colX = [50, 200, 320, 400, 480];
  const headers = ['Código', 'Descripción', 'Cant.', 'Precio/día', 'Subtotal'];

  doc.fontSize(7).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], tableTop));
  doc.moveDown(0.3);

  doc.font('Helvetica').fontSize(7);
  let y = doc.y;
  detalles.forEach((d) => {
    const sub = d.precio_dia_aplicado * dias * d.cantidad;
    doc.text(d.item_codigo || '—', colX[0], y);
    doc.text(d.item_nombre || '—', colX[1], y, { width: 110 });
    doc.text(String(d.cantidad), colX[2], y, { align: 'center' });
    doc.text(`S/ ${d.precio_dia_aplicado.toFixed(2)}`, colX[3], y, { align: 'right' });
    doc.text(`S/ ${sub.toFixed(2)}`, colX[4], y, { align: 'right' });
    y += 12;
  });

  // Línea divisoria
  y += 3;
  doc.moveTo(50, y).lineTo(545, y).stroke();
  y += 8;

  doc.font('Helvetica-Bold').fontSize(7);
  doc.text('TOTAL EQUIPOS:', colX[3], y, { align: 'right' });
  doc.text(`S/ ${totalItems.toFixed(2)}`, colX[4], y, { align: 'right' });
  y += 12;

  if (contrato.deposito_monto > 0) {
    doc.font('Helvetica').text('Depósito:', colX[3], y, { align: 'right' });
    doc.text(`S/ ${contrato.deposito_monto.toFixed(2)}`, colX[4], y, { align: 'right' });
    y += 12;
  }

  doc.font('Helvetica-Bold').text('TOTAL:', colX[3], y, { align: 'right' });
  doc.text(`S/ ${total.toFixed(2)}`, colX[4], y, { align: 'right' });
  y += 12;

  doc.font('Helvetica').fontSize(7);
  doc.text(`Período: ${contrato.fecha_salida} → ${contrato.fecha_devolucion_pactada} (${dias} día${dias !== 1 ? 's' : ''})`, 50, y);
  if (contrato.deposito_dni) doc.text('Garantía: DNI retenido + depósito monetario', 50, y + 10);

  doc.moveDown(1.5);

  // === CLÁUSULAS ===
  const clausulas = clausulasRaw
    .replace('[ARRENDADORA_DNI]', arrendadora.dni)
    .replace('[ARRENDADORA_DIRECCION]', arrendadora.direccion)
    .replace('[TOTAL]', `S/ ${total.toFixed(2)}`)
    .replace('[FECHA_INICIO]', contrato.fecha_salida)
    .replace('[FECHA_DEVOLUCION]', contrato.fecha_devolucion_pactada)
    .replace('[CLIENTE_DNI]', contrato.cliente_dni || '—')
    .replace('[DEPOSITO_TEXTO]', contrato.deposito_monto > 0 ? `+ S/ ${contrato.deposito_monto.toFixed(2)} como depósito` : '');

  doc.fontSize(7).font('Helvetica');
  clausulas.split('\n\n').forEach((p) => {
    if (doc.y > 720) doc.addPage();
    doc.text(p.trim(), 50, doc.y, { width: 495, align: 'justify' });
    doc.moveDown(0.3);
  });

  // === FIRMAS ===
  doc.moveDown(1);
  const firmaY = Math.max(doc.y + 20, 620);
  doc.moveTo(50, firmaY).lineTo(545, firmaY).stroke();

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('ARRENDADORA', 50, firmaY + 10, { width: 150, align: 'center' });
  doc.text('ARRENDATARIO', 220, firmaY + 10, { width: 150, align: 'center' });
  doc.text('GARANTE', 400, firmaY + 10, { width: 145, align: 'center' });

  doc.fontSize(7).font('Helvetica');
  doc.text(arrendadora.nombre, 50, firmaY + 28, { width: 150, align: 'center' });
  doc.text(`DNI: ${arrendadora.dni}`, 50, firmaY + 40, { width: 150, align: 'center' });

  doc.text(contrato.cliente_nombre, 220, firmaY + 28, { width: 150, align: 'center' });
  doc.text(`DNI: ${contrato.cliente_dni || '—'}`, 220, firmaY + 40, { width: 150, align: 'center' });

  // Firma del cliente si existe
  if (contrato.firma_digital_path && fs.existsSync(contrato.firma_digital_path)) {
    doc.image(contrato.firma_digital_path, 250, firmaY, { width: 100, height: 40 });
  }

  // Fecha
  const fechaHoy = new Date().toLocaleDateString('es-PE');
  doc.fontSize(7).text(`Andahuaylas, ${fechaHoy}`, 50, firmaY + 55, { align: 'center', width: 495 });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
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

module.exports = { generarPdf, guardarFirma };
