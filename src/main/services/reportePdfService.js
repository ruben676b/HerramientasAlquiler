const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const { getReporteById } = require('./reporteService');
const db = require('../db/database');

function formatearMoneda(v) {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + 'S/ ' + Math.abs(n).toFixed(2);
}

function formatearFecha(iso) {
  if (!iso) return '';
  const s = iso.includes(' ') ? iso.replace(' ', 'T') : iso;
  const d = new Date(s.includes('T') ? s : s + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function exportarReportePDF(id) {
  const reporte = getReporteById(id);
  const datos = reporte.datos_json;

  const empresa = {};
  const rows = db.prepare('SELECT clave, valor FROM CONFIGURACION WHERE clave LIKE ?').all('arrendadora_%');
  for (const r of rows) {
    empresa[r.clave.replace('arrendadora_', '')] = r.valor;
  }

  const usuarioPath = app ? app.getPath('userData') : path.join(os.homedir(), '.sistema-alquiler');
  const reportesDir = path.join(usuarioPath, 'reportes');
  if (!fs.existsSync(reportesDir)) fs.mkdirSync(reportesDir, { recursive: true });

  const filePath = path.join(reportesDir, `reporte_${id}_${Date.now()}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.registerFont('Inter', path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'fonts', 'Inter-Regular.ttf'));
    try {
      doc.font('Inter');
    } catch (e) {
      doc.font('Helvetica');
    }

    const PAGE_W = 495;
    let y = 50;

    doc.fontSize(16).text('REPORTE DE INGRESOS Y EGRESOS', 50, y, { align: 'center' });
    y += 20;
    doc.fontSize(9)
      .text(`Reporte #${reporte.id}`, 50, y, { align: 'center' });
    y += 12;
    doc.fontSize(8).fillColor('#666')
      .text(`Período: ${formatearFecha(reporte.fecha_inicio)} — ${formatearFecha(reporte.fecha_fin)}`, 50, y, { align: 'center' });
    y += 10;
    doc.text(`Generado: ${formatearFecha(reporte.fecha_generacion)}`, 50, y, { align: 'center' });
    y += 20;

    doc.fillColor('#000');
    doc.fontSize(9).text(`Arrendadora: ${empresa.nombre || ''}`, 50, y);
    y += 10;
    doc.text(`DNI: ${empresa.dni || ''}  |  RUC: ${empresa.ruc || ''}`, 50, y);
    y += 10;
    doc.text(`Dirección: ${empresa.direccion || ''}  |  Teléfono: ${empresa.telefono || ''}`, 50, y);
    y += 25;

    if (datos.contratos && datos.contratos.length > 0) {
      doc.fontSize(12).text('ALQUILERES', 50, y);
      y += 18;
      dibujarTablaAlquileres(doc, y, datos.contratos, PAGE_W);
      y += 10 + (datos.contratos.length + 1) * 18 + 10;
      doc.fontSize(9).fillColor('#444');
    }

    if (datos.ventas && datos.ventas.length > 0) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fontSize(12).fillColor('#000').text('OTROS INGRESOS', 50, y);
      y += 18;
      dibujarTablaVentas(doc, y, datos.ventas, PAGE_W);
      y += 10 + (datos.ventas.length + 1) * 18 + 10;
    }

    if (datos.egresos && datos.egresos.length > 0) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fontSize(12).fillColor('#000').text('EGRESOS', 50, y);
      y += 18;
      dibujarTablaEgresos(doc, y, datos.egresos, PAGE_W);
      y += 10 + (datos.egresos.length + 1) * 18 + 10;
    }

    if (y > 650) { doc.addPage(); y = 50; }
    y += 10;
    doc.fontSize(12).fillColor('#000').text('RESUMEN', 50, y);
    y += 18;

    const tt = reporte.totales_metodo;
    const metodos = [
      { label: 'Efectivo', key: 'efectivo' },
      { label: 'Yape', key: 'yape' },
      { label: 'Plin', key: 'plin' },
    ];

    for (const m of metodos) {
      const val = tt[m.key] || 0;
      const color = val >= 0 ? '#000' : '#c00';
      doc.fontSize(9).fillColor('#444').text(`${m.label}:`, 50, y);
      doc.fillColor(color).text(formatearMoneda(val), 180, y, { width: 150, align: 'right' });
      y += 16;
    }

    y += 8;
    doc.moveTo(50, y).lineTo(545, y).stroke('#ddd');
    y += 10;
    doc.fontSize(11).fillColor('#000').text('Ingresos Netos:', 50, y);
    const neto = reporte.total_neto;
    doc.fontSize(11).fillColor(neto >= 0 ? '#000' : '#c00')
      .text(formatearMoneda(neto), 180, y, { width: 150, align: 'right' });

    doc.end();
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
}

function dibujarTablaAlquileres(doc, startY, contratos, pageW) {
  let y = startY;
  const colX = [50, 180, 285, 385, 495];
  const colW = [130, 105, 100, 110, 50];

  doc.fontSize(8).fillColor('#000');
  doc.rect(50, y - 4, pageW, 16).fill('#f0f0f0');
  doc.fillColor('#000');
  doc.text('Cliente', colX[0] + 2, y);
  doc.text('F. Alquiler', colX[1] + 2, y);
  doc.text('F. Devolución', colX[2] + 2, y);
  doc.text('Pagos', colX[3] + 2, y);
  doc.text('Total', colX[4] + 2, y);
  y += 18;

  for (const c of contratos) {
    if (y > 720) { doc.addPage(); y = 50; }
    const pagosStr = c.pagos.map(p => `${p.tipo === 'devolucion_deposito' ? '-' : ''}${formatearMoneda(p.monto)} (${p.metodo})`).join(', ');
    doc.fontSize(7);
    doc.text(c.cliente_nombre || '', colX[0] + 2, y, { width: colW[0] - 4, ellipsis: true });
    doc.text(formatearFecha(c.fecha_salida), colX[1] + 2, y, { width: colW[1] - 4 });
    doc.text(formatearFecha(c.fecha_devolucion_real), colX[2] + 2, y, { width: colW[2] - 4 });
    doc.text(pagosStr, colX[3] + 2, y, { width: colW[3] - 4 });
    doc.text(formatearMoneda(c.total_pagado), colX[4] + 2, y, { width: colW[4] - 4, align: 'right' });
    y += 16;
  }
}

function dibujarTablaVentas(doc, startY, ventas, pageW) {
  let y = startY;
  const colX = [50, 180, 285, 385, 495];
  const colW = [130, 105, 100, 110, 50];

  doc.fontSize(8).fillColor('#000');
  doc.rect(50, y - 4, pageW, 16).fill('#f0f0f0');
  doc.fillColor('#000');
  doc.text('Descripción', colX[0] + 2, y);
  doc.text('Fecha', colX[1] + 2, y);
  doc.text('Método', colX[2] + 2, y);
  doc.text('Cliente', colX[3] + 2, y);
  doc.text('Total', colX[4] + 2, y);
  y += 18;

  for (const v of ventas) {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.fontSize(7);
    doc.text(v.nombre_item || '', colX[0] + 2, y, { width: colW[0] - 4, ellipsis: true });
    doc.text(formatearFecha(v.fecha), colX[1] + 2, y);
    doc.text(v.metodo || '', colX[2] + 2, y);
    doc.text(v.cliente_nombre || '', colX[3] + 2, y, { width: colW[3] - 4, ellipsis: true });
    doc.text(formatearMoneda(v.total), colX[4] + 2, y, { width: colW[4] - 4, align: 'right' });
    y += 16;
  }
}

function dibujarTablaEgresos(doc, startY, egresos, pageW) {
  let y = startY;
  const colX = [50, 180, 285, 385, 495];
  const colW = [130, 105, 100, 110, 50];

  doc.fontSize(8).fillColor('#000');
  doc.rect(50, y - 4, pageW, 16).fill('#f0f0f0');
  doc.fillColor('#000');
  doc.text('Descripción', colX[0] + 2, y);
  doc.text('Fecha', colX[1] + 2, y);
  doc.text('Método', colX[2] + 2, y);
  doc.text('', colX[3] + 2, y);
  doc.text('Total', colX[4] + 2, y);
  y += 18;

  for (const e of egresos) {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.fontSize(7);
    doc.text(e.descripcion || '', colX[0] + 2, y, { width: colW[0] - 4, ellipsis: true });
    doc.text(formatearFecha(e.fecha), colX[1] + 2, y);
    doc.text(e.metodo || '', colX[2] + 2, y);
    doc.text('-', colX[3] + 2, y);
    doc.text('-' + formatearMoneda(e.monto), colX[4] + 2, y, { width: colW[4] - 4, align: 'right' });
    y += 16;
  }
}

module.exports = { exportarReportePDF };
