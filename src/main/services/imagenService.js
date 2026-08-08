const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('../db/database');

const IMAGENES_DIR = path.join(app.getPath('documents'), 'AlquilerImagenes');

function ensureDir() {
  if (!fs.existsSync(IMAGENES_DIR)) {
    fs.mkdirSync(IMAGENES_DIR, { recursive: true });
  }
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Extraer mime y buffer de un data URL base64 (o base64 puro)
function decodificarBase64(base64) {
  if (!base64 || typeof base64 !== 'string') throw new Error('Imagen inválida.');
  let mime = null;
  let data = base64;
  const m = base64.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,/);
  if (m) {
    mime = m[1];
    data = base64.slice(m[0].length);
  }
  if (!mime) mime = 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
  return { buffer: Buffer.from(data, 'base64'), ext };
}

function mimeDesdeExt(ruta) {
  const ext = path.extname(ruta || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function borrarArchivoSiExiste(ruta) {
  try {
    if (ruta && fs.existsSync(ruta)) fs.unlinkSync(ruta);
  } catch (e) {
    console.error('[IMAGEN] No se pudo borrar archivo:', ruta, e.message);
  }
}

// ================================================================
// HERRAMIENTAS (imagen a nivel de familia / categoría)
// ================================================================

function guardarImagenHerramienta(idCategoria, base64) {
  if (!idCategoria) throw new Error('id de categoría requerido.');
  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(idCategoria);
  if (!cat) throw new Error('Categoría no encontrada: ' + idCategoria);

  ensureDir();
  const { buffer, ext } = decodificarBase64(base64);
  const ruta = path.join(IMAGENES_DIR, 'her_' + sanitizeId(idCategoria) + '.' + ext);

  // Si ya existía una imagen previa con otra extensión, borrarla
  if (cat.imagen_path && cat.imagen_path !== ruta) borrarArchivoSiExiste(cat.imagen_path);

  fs.writeFileSync(ruta, buffer);
  db.prepare('UPDATE CATEGORIA_HERRAMIENTA SET imagen_path = ? WHERE id = ?').run(ruta, idCategoria);
  return { ruta };
}

function eliminarImagenHerramienta(idCategoria) {
  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(idCategoria);
  if (!cat) throw new Error('Categoría no encontrada: ' + idCategoria);
  if (cat.imagen_path) borrarArchivoSiExiste(cat.imagen_path);
  db.prepare('UPDATE CATEGORIA_HERRAMIENTA SET imagen_path = NULL WHERE id = ?').run(idCategoria);
  return { ok: true };
}

// ================================================================
// MATERIALES (imagen compartida por nombre entre variantes)
// ================================================================

function guardarImagenGranel(nombre, base64) {
  if (!nombre) throw new Error('Nombre del material requerido.');
  const existentes = db.prepare('SELECT id FROM ITEM_GRANEL WHERE nombre = ? AND activo = 1').all(nombre);
  if (existentes.length === 0) throw new Error('Material no encontrado: ' + nombre);

  ensureDir();
  const { buffer, ext } = decodificarBase64(base64);
  const ruta = path.join(IMAGENES_DIR, 'mat_' + sanitizeId(nombre) + '.' + ext);

  // Borrar imagen previa con otra extensión
  const prev = db.prepare('SELECT imagen_path FROM ITEM_GRANEL WHERE nombre = ? AND activo = 1 AND imagen_path IS NOT NULL LIMIT 1').get(nombre);
  if (prev && prev.imagen_path && prev.imagen_path !== ruta) borrarArchivoSiExiste(prev.imagen_path);

  fs.writeFileSync(ruta, buffer);
  db.prepare('UPDATE ITEM_GRANEL SET imagen_path = ? WHERE nombre = ? AND activo = 1').run(ruta, nombre);
  return { ruta };
}

function eliminarImagenGranel(nombre) {
  const prev = db.prepare('SELECT imagen_path FROM ITEM_GRANEL WHERE nombre = ? AND activo = 1 AND imagen_path IS NOT NULL LIMIT 1').get(nombre);
  if (prev && prev.imagen_path) borrarArchivoSiExiste(prev.imagen_path);
  db.prepare('UPDATE ITEM_GRANEL SET imagen_path = NULL WHERE nombre = ? AND activo = 1').run(nombre);
  return { ok: true };
}

// ================================================================
// RESOLUCIÓN + LECTURA
// ================================================================

/**
 * Resuelve la ruta de imagen de un ítem.
 * @param {'herramienta'|'granel'} tipo
 * @param {string|number} id - id_herramienta (unidad) o id_item_granel
 */
function getImagenItem(tipo, id) {
  if (tipo === 'herramienta' && id != null) {
    const row = db.prepare(`
      SELECT c.imagen_path AS imagen_path
      FROM HERRAMIENTA h
      JOIN CATEGORIA_HERRAMIENTA c ON h.id_categoria = c.id
      WHERE h.id = ?
    `).get(id);
    return { ruta: row?.imagen_path || null };
  }
  if (tipo === 'granel' && id != null) {
    const row = db.prepare('SELECT imagen_path FROM ITEM_GRANEL WHERE id = ?').get(id);
    return { ruta: row?.imagen_path || null };
  }
  return { ruta: null };
}

/** Lee un archivo de imagen y lo devuelve como data URL (mime según extensión). */
function leerImagen(ruta) {
  if (!ruta || !fs.existsSync(ruta)) throw new Error('Imagen no encontrada: ' + ruta);
  const buffer = fs.readFileSync(ruta);
  return 'data:' + mimeDesdeExt(ruta) + ';base64,' + buffer.toString('base64');
}

module.exports = {
  IMAGENES_DIR,
  guardarImagenHerramienta,
  eliminarImagenHerramienta,
  guardarImagenGranel,
  eliminarImagenGranel,
  getImagenItem,
  leerImagen,
};
