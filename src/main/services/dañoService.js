const db = require('../db/database');

/* ================================================================
   DAÑOS PREDEFINIDOS (catálogo de daños con costo sugerido)
   - individual: asociados a una familia (CATEGORIA_HERRAMIENTA)
   - granel: asociados a un material por nombre (ITEM_GRANEL.nombre,
     compartido entre variantes nuevo/usado)
   ================================================================ */

/** Lista de daños predefinidos activos de una familia o material. */
function getDañosPredefinidos(tipoItem, ref) {
  if (tipoItem === 'individual') {
    return db.prepare(`
      SELECT id, nombre, costo_sugerido
      FROM DAÑO_PREDEFINIDO
      WHERE tipo_item = 'individual' AND id_categoria = ? AND activo = 1
      ORDER BY nombre
    `).all(ref);
  }
  return db.prepare(`
    SELECT id, nombre, costo_sugerido
    FROM DAÑO_PREDEFINIDO
    WHERE tipo_item = 'granel' AND nombre_granel = ? AND activo = 1
    ORDER BY nombre
  `).all(ref);
}

/**
 * Guarda (INSERT o actualiza costo si el nombre ya existe para esa ref).
 * { tipo_item, id_categoria?, nombre_granel?, nombre, costo_sugerido }
 */
function guardarDañoPredefinido({ tipo_item, id_categoria, nombre_granel, nombre, costo_sugerido }) {
  if (!tipo_item || !nombre) throw new Error('Tipo y nombre del daño son obligatorios.');
  const costo = Number(costo_sugerido) || 0;
  if (costo < 0) throw new Error('El costo no puede ser negativo.');

  // Si el nombre ya existe para esa familia/material, actualiza costo (sin duplicar)
  let existente;
  if (tipo_item === 'individual') {
    if (!id_categoria) throw new Error('La familia es obligatoria.');
    existente = db.prepare(
      "SELECT id FROM DAÑO_PREDEFINIDO WHERE tipo_item = 'individual' AND id_categoria = ? AND nombre = ?"
    ).get(id_categoria, nombre);
    if (existente) {
      db.prepare('UPDATE DAÑO_PREDEFINIDO SET costo_sugerido = ?, activo = 1 WHERE id = ?').run(costo, existente.id);
    } else {
      db.prepare(
        "INSERT INTO DAÑO_PREDEFINIDO (tipo_item, id_categoria, nombre_granel, nombre, costo_sugerido, activo) VALUES ('individual', ?, NULL, ?, ?, 1)"
      ).run(id_categoria, nombre, costo);
    }
  } else {
    if (!nombre_granel) throw new Error('El material es obligatorio.');
    existente = db.prepare(
      "SELECT id FROM DAÑO_PREDEFINIDO WHERE tipo_item = 'granel' AND nombre_granel = ? AND nombre = ?"
    ).get(nombre_granel, nombre);
    if (existente) {
      db.prepare('UPDATE DAÑO_PREDEFINIDO SET costo_sugerido = ?, activo = 1 WHERE id = ?').run(costo, existente.id);
    } else {
      db.prepare(
        "INSERT INTO DAÑO_PREDEFINIDO (tipo_item, id_categoria, nombre_granel, nombre, costo_sugerido, activo) VALUES ('granel', NULL, ?, ?, ?, 1)"
      ).run(nombre_granel, nombre, costo);
    }
  }
  return { ok: true };
}

/** Elimina (borrado físico) un daño predefinido por id. */
function eliminarDañoPredefinido(id) {
  const r = db.prepare('DELETE FROM DAÑO_PREDEFINIDO WHERE id = ?').run(id);
  if (!r.changes) throw new Error('Daño predefinido no encontrado.');
  return { ok: true };
}

/**
 * Daños predefinidos aplicables a un ítem concreto de una devolución.
 * tipo: 'herramienta' (id = HERRAMIENTA.id) → familia por JOIN
 *       'granel'       (id = ITEM_GRANEL.id) → material por nombre
 */
function getDañosItem(tipo, id) {
  if (tipo === 'herramienta') {
    const h = db.prepare('SELECT id_categoria FROM HERRAMIENTA WHERE id = ?').get(id);
    if (!h) return [];
    return getDañosPredefinidos('individual', h.id_categoria);
  }
  if (tipo === 'granel') {
    const g = db.prepare('SELECT nombre FROM ITEM_GRANEL WHERE id = ?').get(id);
    if (!g) return [];
    return getDañosPredefinidos('granel', g.nombre);
  }
  return [];
}

module.exports = {
  getDañosPredefinidos,
  guardarDañoPredefinido,
  eliminarDañoPredefinido,
  getDañosItem,
};
