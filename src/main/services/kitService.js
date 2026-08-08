const db = require('../db/database');

/**
 * Obtiene todos los kits activos con sus componentes y disponibilidad calculada.
 * @returns {Array} [{ id, nombre, descripcion, precio_dia, precio_minimo, precio_mes, precio_venta,
 *                     activo, componentes: [{ id, tipo_item, id_item_granel, id_herramienta, cantidad,
 *                                             nombre, condicion, precio_venta }], disponibilidad }]
 */
function getKits() {
  const kits = db.prepare('SELECT * FROM KIT WHERE activo = 1 ORDER BY nombre').all();
  return kits.map(k => {
    const componentes = getComponentes(k.id);
    const disponibilidad = calcularDisponibilidad(componentes);
    return { ...k, componentes, disponibilidad };
  });
}

function getKitById(idKit) {
  const kit = db.prepare('SELECT * FROM KIT WHERE id = ? AND activo = 1').get(idKit);
  if (!kit) return null;
  const componentes = getComponentes(idKit);
  return { ...kit, componentes, disponibilidad: calcularDisponibilidad(componentes) };
}

function getComponentes(idKit) {
  return db.prepare(`
    SELECT kc.*,
      COALESCE(i.nombre, h.nombre) AS nombre,
      i.condicion AS condicion,
      i.precio_venta AS precio_venta_parte,
      h.estado AS estado_herramienta,
      h.precio_venta AS precio_venta_herramienta,
      i.cantidad_disponible AS cantidad_disponible
    FROM KIT_COMPONENTE kc
    LEFT JOIN ITEM_GRANEL i ON kc.tipo_item = 'granel' AND kc.id_item_granel = i.id
    LEFT JOIN HERRAMIENTA h ON kc.tipo_item = 'individual' AND kc.id_herramienta = h.id
    WHERE kc.id_kit = ?
    ORDER BY kc.id
  `).all(idKit);
}

/**
 * Calcula cuántos kits completos pueden armarse con el stock actual.
 * min entre: floor(disponible_granel / cantidad) por componente granel
 *            1 si la unidad individual está disponible, 0 si no.
 * @returns {number}
 */
function calcularDisponibilidad(componentes) {
  if (!componentes || componentes.length === 0) return 0;
  let min = Infinity;
  for (const c of componentes) {
    if (c.tipo_item === 'granel') {
      const cant = c.cantidad_disponible || 0;
      min = Math.min(min, Math.floor(cant / c.cantidad));
    } else if (c.tipo_item === 'individual') {
      min = Math.min(min, c.estado_herramienta === 'disponible' ? 1 : 0);
    }
  }
  return min === Infinity ? 0 : min;
}

function getKitDisponibilidad(idKit) {
  const kit = getKitById(idKit);
  if (!kit) return { ok: false, error: 'Kit no encontrado' };
  return { ok: true, disponibilidad: kit.disponibilidad, componentes: kit.componentes };
}

/**
 * Crea un kit con sus componentes.
 * @param {object} data { nombre, descripcion, precio_dia, precio_minimo, precio_mes, precio_venta,
 *                        componentes: [{ tipo_item, id_item_granel?, id_herramienta?, cantidad }] }
 */
function crearKit(data) {
  if (!data?.nombre || !data.nombre.trim()) throw new Error('El kit debe tener un nombre.');
  if (data.precio_dia == null || data.precio_dia < 0) throw new Error('El precio diario es obligatorio.');
  if (!data.componentes || data.componentes.length === 0) throw new Error('El kit debe tener al menos un componente.');

  const ejecutar = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO KIT (nombre, descripcion, precio_dia, precio_minimo, precio_mes, precio_venta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.nombre.trim(),
      data.descripcion || null,
      data.precio_dia,
      data.precio_minimo != null ? data.precio_minimo : null,
      data.precio_mes != null ? data.precio_mes : null,
      data.precio_venta != null ? data.precio_venta : null
    );
    const idKit = r.lastInsertRowid;
    validarYInsertarComponentes(idKit, data.componentes);
    return { id: idKit };
  });

  return ejecutar();
}

function validarYInsertarComponentes(idKit, componentes) {
  const insert = db.prepare(`
    INSERT INTO KIT_COMPONENTE (id_kit, tipo_item, id_item_granel, id_herramienta, cantidad)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const c of componentes) {
    if (c.tipo_item === 'granel') {
      if (!c.id_item_granel) throw new Error('Componente granel sin ítem seleccionado.');
      const granel = db.prepare('SELECT id FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(c.id_item_granel);
      if (!granel) throw new Error('Ítem a granel no encontrado o inactivo.');
      insert.run(idKit, 'granel', c.id_item_granel, null, Math.max(1, Math.floor(c.cantidad || 1)));
    } else if (c.tipo_item === 'individual') {
      if (!c.id_herramienta) throw new Error('Componente individual sin herramienta seleccionada.');
      const herr = db.prepare('SELECT id FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(c.id_herramienta);
      if (!herr) throw new Error('Herramienta no encontrada o inactiva.');
      insert.run(idKit, 'individual', null, c.id_herramienta, 1);
    } else {
      throw new Error('Tipo de componente inválido: ' + c.tipo_item);
    }
  }
}

function editarKit(idKit, data) {
  const kit = db.prepare('SELECT id FROM KIT WHERE id = ?').get(idKit);
  if (!kit) throw new Error('Kit no encontrado.');
  if (!data?.nombre || !data.nombre.trim()) throw new Error('El kit debe tener un nombre.');
  if (data.precio_dia == null || data.precio_dia < 0) throw new Error('El precio diario es obligatorio.');
  if (!data.componentes || data.componentes.length === 0) throw new Error('El kit debe tener al menos un componente.');

  const ejecutar = db.transaction(() => {
    db.prepare(`
      UPDATE KIT SET nombre = ?, descripcion = ?, precio_dia = ?, precio_minimo = ?, precio_mes = ?, precio_venta = ?
      WHERE id = ?
    `).run(
      data.nombre.trim(),
      data.descripcion || null,
      data.precio_dia,
      data.precio_minimo != null ? data.precio_minimo : null,
      data.precio_mes != null ? data.precio_mes : null,
      data.precio_venta != null ? data.precio_venta : null,
      idKit
    );
    db.prepare('DELETE FROM KIT_COMPONENTE WHERE id_kit = ?').run(idKit);
    validarYInsertarComponentes(idKit, data.componentes);
    return { ok: true };
  });

  return ejecutar();
}

function desactivarKit(idKit) {
  const r = db.prepare('UPDATE KIT SET activo = 0 WHERE id = ?').run(idKit);
  if (r.changes === 0) throw new Error('Kit no encontrado.');
  return { ok: true };
}

module.exports = {
  getKits,
  getKitById,
  getKitDisponibilidad,
  crearKit,
  editarKit,
  desactivarKit,
};
