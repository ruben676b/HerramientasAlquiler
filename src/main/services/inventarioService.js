const db = require('../db/database');
const { localDate } = require('../utils/date');

/* ================================================================
   HERRAMIENTAS
   ================================================================ */

function getHerramientas(filtros = {}) {
  let sql = `
    SELECT h.*, c.nombre AS categoria_nombre
    FROM HERRAMIENTA h
    JOIN CATEGORIA_HERRAMIENTA c ON h.id_categoria = c.id
    WHERE h.activo = 1
  `;
  const params = [];

  if (filtros.categoria) {
    sql += ' AND h.id_categoria = ?';
    params.push(filtros.categoria);
  }
  if (filtros.estado) {
    sql += ' AND h.estado = ?';
    params.push(filtros.estado);
  }
  if (filtros.busqueda) {
    sql += ' AND (h.id LIKE ? OR h.nombre LIKE ?)';
    const p = '%' + filtros.busqueda + '%';
    params.push(p, p);
  }

  sql += ' ORDER BY h.id';
  return db.prepare(sql).all(...params);
}

function crearHerramienta({ id, id_categoria, nombre, descripcion, precio_dia, valor_reposicion, fecha_adquisicion }) {
  if (!id || !id_categoria || !nombre) throw new Error('Código, categoría y nombre son obligatorios.');

  const existente = db.prepare('SELECT id FROM HERRAMIENTA WHERE id = ?').get(id);
  if (existente) throw new Error('Ya existe una herramienta con el código ' + id);

  db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, valor_reposicion, fecha_adquisicion, estado)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'disponible')
  `).run(id, id_categoria, nombre, descripcion || null, precio_dia || 0, valor_reposicion || null, fecha_adquisicion || null);

  return { id };
}

function actualizarHerramienta(id, datos) {
  const h = db.prepare('SELECT * FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(id);
  if (!h) throw new Error('Herramienta no encontrada: ' + id);

  const fields = [];
  const params = [];

  for (const [k, v] of Object.entries(datos)) {
    const allowed = ['nombre', 'descripcion', 'precio_dia', 'valor_reposicion', 'estado', 'fecha_adquisicion', 'id_categoria'];
    if (allowed.includes(k) && v !== undefined) {
      fields.push(k + ' = ?');
      params.push(v);
    }
  }

  if (!fields.length) return { id };

  params.push(id);
  db.prepare('UPDATE HERRAMIENTA SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
  return { id };
}

function bajaHerramienta(id) {
  const h = db.prepare('SELECT * FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(id);
  if (!h) throw new Error('Herramienta no encontrada: ' + id);
  if (h.estado === 'alquilado') throw new Error('No se puede dar de baja una herramienta alquilada.');

  db.prepare('UPDATE HERRAMIENTA SET activo = 0 WHERE id = ?').run(id);
  return { id };
}

/* ================================================================
   ÍTEMS A GRANEL
   ================================================================ */

function getGranelFull() {
  return db.prepare(`
    SELECT * FROM ITEM_GRANEL WHERE activo = 1 ORDER BY nombre, condicion
  `).all();
}

function crearGranel({ nombre, condicion, precio_dia, cantidad_total }) {
  if (!nombre || !condicion) throw new Error('Nombre y condición son obligatorios.');

  const r = db.prepare(`
    INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, cantidad_total, cantidad_disponible)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(nombre, condicion, precio_dia || 0, cantidad_total || 0, cantidad_total || 0);

  return { id: r.lastInsertRowid };
}

function actualizarGranel(id, datos) {
  const g = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!g) throw new Error('Ítem no encontrado: ' + id);

  const fields = [];
  const params = [];

  for (const [k, v] of Object.entries(datos)) {
    const allowed = ['nombre', 'condicion', 'precio_dia', 'cantidad_total'];
    if (allowed.includes(k) && v !== undefined) {
      fields.push(k + ' = ?');
      params.push(v);
    }
  }

  if (!fields.length) return { id };

  params.push(id);
  db.prepare('UPDATE ITEM_GRANEL SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);

  // NOTE: no es necesario sincronizar cantidad_disponible — el trigger trg_granel_disponible lo recalcula

  return { id };
}

function bajaGranel(id) {
  const g = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!g) throw new Error('Ítem no encontrado: ' + id);

  db.prepare('UPDATE ITEM_GRANEL SET activo = 0 WHERE id = ?').run(id);
  return { id };
}

function getGranelAgrupado() {
  const todos = db.prepare(`
    SELECT * FROM ITEM_GRANEL WHERE activo = 1 ORDER BY nombre, condicion
  `).all();

  const mapa = {};
  for (const item of todos) {
    if (!mapa[item.nombre]) {
      mapa[item.nombre] = {
        nombre: item.nombre,
        total: 0,
        disponibles: 0,
        alquiladas: 0,
        danadas: 0,
        perdidas: 0,
        vendidas: 0,
        bajas: 0,
        variantes: [],
      };
    }
    const g = mapa[item.nombre];
    g.total += item.cantidad_total;
    g.disponibles += item.cantidad_disponible;
    g.alquiladas += item.cantidad_alquilada || 0;
    g.danadas += item.cantidad_danada || 0;
    g.perdidas += item.cantidad_perdida || 0;
    g.vendidas += item.cantidad_vendida || 0;
    g.bajas += item.cantidad_baja || 0;
    g.variantes.push(item);
  }

  return Object.values(mapa);
}

function crearMaterial({ nombre, precio_nuevo, precio_minimo_nuevo, precio_mes_nuevo, precio_venta_nuevo, precio_usado, precio_minimo_usado, precio_mes_usado, precio_venta_usado }) {
  if (!nombre) throw new Error('El nombre del material es obligatorio.');

  const insert = db.prepare(`
    INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, precio_minimo, precio_mes, precio_venta, cantidad_total, cantidad_disponible)
    VALUES (?, ?, ?, 0, ?, ?, ?, 0, 0)
  `);

  const tx = db.transaction(() => {
    insert.run(nombre, 'nuevo', precio_nuevo || 0,
      precio_minimo_nuevo != null ? precio_minimo_nuevo : null,
      precio_mes_nuevo != null ? precio_mes_nuevo : null,
      precio_venta_nuevo != null ? precio_venta_nuevo : null);
    insert.run(nombre, 'usado', precio_usado || 0,
      precio_minimo_usado != null ? precio_minimo_usado : null,
      precio_mes_usado != null ? precio_mes_usado : null,
      precio_venta_usado != null ? precio_venta_usado : null);
  });
  tx();

  return { nombre };
}

// Helper: leer estado actual de columnas auditables
function readGranelState(id) {
  return db.prepare(`
    SELECT cantidad_total, cantidad_alquilada, cantidad_danada, cantidad_perdida, cantidad_vendida, cantidad_baja
    FROM ITEM_GRANEL WHERE id = ? AND activo = 1
  `).get(id);
}

// Helper: insertar entrada en AUDIT_GRANEL
function insertAudit(itemId, accion, cantidad, prev, next) {
  db.prepare(`
    INSERT INTO AUDIT_GRANEL
      (item_id, accion, cantidad, prev_total, prev_alquilada, prev_danada, prev_perdida, prev_vendida, prev_baja,
       new_total, new_alquilada, new_danada, new_perdida, new_vendida, new_baja)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId, accion, cantidad,
    prev.cantidad_total, prev.cantidad_alquilada || 0, prev.cantidad_danada || 0,
    prev.cantidad_perdida || 0, prev.cantidad_vendida || 0, prev.cantidad_baja || 0,
    next.cantidad_total, next.cantidad_alquilada || 0, next.cantidad_danada || 0,
    next.cantidad_perdida || 0, next.cantidad_vendida || 0, next.cantidad_baja || 0
  );
}

function agregarStockGranel(id, cantidad) {
  if (!cantidad || cantidad < 1) throw new Error('Cantidad debe ser al menos 1.');

  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  const prev = readGranelState(id);

  db.prepare(`
    UPDATE ITEM_GRANEL SET cantidad_total = cantidad_total + ?
    WHERE id = ?
  `).run(cantidad, id);

  const next = readGranelState(id);
  insertAudit(id, 'compra', cantidad, prev, next);

  return { id, agregado: cantidad };
}

function editarGranelFull(nombreOriginal, { nombre, precio_nuevo, precio_minimo_nuevo, precio_mes_nuevo, precio_venta_nuevo, precio_usado, precio_minimo_usado, precio_mes_usado, precio_venta_usado }) {
  if (!nombre) throw new Error('El nombre es obligatorio.');

  const tx = db.transaction(() => {
    if (nombre !== nombreOriginal) {
      db.prepare('UPDATE ITEM_GRANEL SET nombre = ? WHERE nombre = ? AND activo = 1').run(nombre, nombreOriginal);
    }
    const updateCond = (cond, fields) => {
      const entries = Object.entries(fields).filter(([k, v]) => v !== undefined);
      if (entries.length === 0) return;
      const sql = 'UPDATE ITEM_GRANEL SET ' + entries.map(([k]) => k + ' = ?').join(', ') + ' WHERE nombre = ? AND condicion = ? AND activo = 1';
      const params = entries.map(([, v]) => (v != null ? v : null));
      params.push(nombre, cond);
      db.prepare(sql).run(...params);
    };
    updateCond('nuevo', {
      precio_dia: precio_nuevo,
      precio_minimo: precio_minimo_nuevo,
      precio_mes: precio_mes_nuevo,
      precio_venta: precio_venta_nuevo,
    });
    updateCond('usado', {
      precio_dia: precio_usado,
      precio_minimo: precio_minimo_usado,
      precio_mes: precio_mes_usado,
      precio_venta: precio_venta_usado,
    });
  });
  tx();

  return { nombre };
}

function eliminarVariante(id) {
  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  // Verificar que no esté en uso
  const enUso = db.prepare('SELECT COUNT(*) AS c FROM DETALLE_CONTRATO WHERE id_item_granel = ?').get(id);
  if (enUso.c > 0) throw new Error('No se puede eliminar: tiene historial de alquiler.');

  db.prepare('DELETE FROM ITEM_GRANEL WHERE id = ?').run(id);

  // Si era la última variante, eliminar también la otra
  const restantes = db.prepare('SELECT COUNT(*) AS c FROM ITEM_GRANEL WHERE nombre = ? AND activo = 1').get(item.nombre);
  if (restantes.c === 1) {
    db.prepare('DELETE FROM ITEM_GRANEL WHERE nombre = ?').run(item.nombre);
  }

  return { id };
}

function ajustarStock(id, delta) {
  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  if (delta <= 0) {
    throw new Error('Para restar stock use darBajaGranel con un motivo específico.');
  }

  const prev = readGranelState(id);

  db.prepare(`
    UPDATE ITEM_GRANEL SET cantidad_total = cantidad_total + ?
    WHERE id = ?
  `).run(delta, id);

  const next = readGranelState(id);
  insertAudit(id, 'ajuste', delta, prev, next);

  return { id, total: item.cantidad_total + delta };
}

/**
 * Da de baja unidades de un material con un motivo específico.
 * @param {number} id - ID del ITEM_GRANEL
 * @param {number} cantidad - Unidades a dar de baja
 * @param {'baja'|'perdido'|'dañado'|'vendido'} motivo - Motivo de la baja
 */
function darBajaGranel(id, cantidad, motivo) {
  if (!cantidad || cantidad < 1) throw new Error('Cantidad debe ser al menos 1.');
  if (!['baja', 'perdido', 'dañado', 'vendido'].includes(motivo)) {
    throw new Error('Motivo inválido. Use: baja, perdido, dañado o vendido.');
  }

  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  if (item.cantidad_disponible < cantidad) {
    throw new Error(
      'Solo hay ' + item.cantidad_disponible + ' unidades disponibles, no suficientes para dar de baja ' + cantidad + '.'
    );
  }

  const prev = readGranelState(id);

  const colMap = { baja: 'cantidad_baja', perdido: 'cantidad_perdida', dañado: 'cantidad_danada', vendido: 'cantidad_vendida' };
  const col = colMap[motivo];

  db.prepare('UPDATE ITEM_GRANEL SET ' + col + ' = ' + col + ' + ? WHERE id = ?')
    .run(cantidad, id);

  const next = readGranelState(id);
  insertAudit(id, motivo, cantidad, prev, next);

  return { id, motivo, cantidad };
}

/**
 * Repara una cantidad de unidades dañadas, moviéndolas de cantidad_danada a cantidad_disponible.
 */
function repararGranel(id, cantidad) {
  if (!cantidad || cantidad < 1) throw new Error('Cantidad debe ser al menos 1.');

  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  if ((item.cantidad_danada || 0) < cantidad) {
    throw new Error('Solo hay ' + (item.cantidad_danada || 0) + ' unidades dañadas, no suficientes para reparar ' + cantidad + '.');
  }

  const prev = readGranelState(id);

  db.prepare(`
    UPDATE ITEM_GRANEL SET cantidad_danada = cantidad_danada - ?
    WHERE id = ?
  `).run(cantidad, id);

  const next = readGranelState(id);
  insertAudit(id, 'reparacion', cantidad, prev, next);

  return { id, reparadas: cantidad, danadaRestante: (item.cantidad_danada || 0) - cantidad };
}

/* ================================================================
   AUDITORÍA — historial de modificaciones de stock granel
   ================================================================ */

function getAuditGranel(itemId) {
  return db.prepare(`
    SELECT * FROM AUDIT_GRANEL
    WHERE item_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).all(itemId);
}

function revertirAuditGranel(auditId) {
  const entry = db.prepare('SELECT * FROM AUDIT_GRANEL WHERE id = ?').get(auditId);
  if (!entry) throw new Error('Entrada de auditoría no encontrada.');
  if (entry.revertido) throw new Error('Esta entrada ya fue revertida.');
  if (entry.accion === 'undo') throw new Error('No se puede deshacer una operación de deshacer.');

  // Verificar que sea la última entrada no revertida para este ítem
  const ultima = db.prepare(`
    SELECT id FROM AUDIT_GRANEL
    WHERE item_id = ? AND revertido = 0
    ORDER BY id DESC LIMIT 1
  `).get(entry.item_id);

  if (!ultima || ultima.id !== entry.id) {
    throw new Error('Solo se puede deshacer la última modificación no revertida.');
  }

  const ejecutar = db.transaction(() => {
    const actual = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ?').get(entry.item_id);
    if (!actual) throw new Error('Ítem no encontrado.');

    // Restaurar valores previos
    db.prepare(`
      UPDATE ITEM_GRANEL SET
        cantidad_total = ?, cantidad_alquilada = ?, cantidad_danada = ?,
        cantidad_perdida = ?, cantidad_vendida = ?, cantidad_baja = ?
      WHERE id = ?
    `).run(
      entry.prev_total, entry.prev_alquilada, entry.prev_danada,
      entry.prev_perdida, entry.prev_vendida, entry.prev_baja,
      entry.item_id
    );

    // Marcar entrada original como revertida
    db.prepare('UPDATE AUDIT_GRANEL SET revertido = 1 WHERE id = ?').run(auditId);

    // Insertar entrada de undo
    db.prepare(`
      INSERT INTO AUDIT_GRANEL
        (item_id, accion, cantidad, prev_total, prev_alquilada, prev_danada, prev_perdida, prev_vendida, prev_baja,
         new_total, new_alquilada, new_danada, new_perdida, new_vendida, new_baja)
      VALUES (?, 'undo', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.item_id,
      actual.cantidad_total, actual.cantidad_alquilada || 0, actual.cantidad_danada || 0,
      actual.cantidad_perdida || 0, actual.cantidad_vendida || 0, actual.cantidad_baja || 0,
      entry.prev_total, entry.prev_alquilada, entry.prev_danada,
      entry.prev_perdida, entry.prev_vendida, entry.prev_baja
    );
  });

  ejecutar();
  return { revertido: auditId };
}

/* ================================================================
   CATEGORÍAS — prefijo automático
   ================================================================ */

function generarPrefijo(nombre) {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

  if (limpio.length < 3) return limpio.padEnd(3, 'X');

  let prefijo = limpio.substring(0, 3);

  const existente = db.prepare('SELECT id FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(prefijo);
  if (!existente) return prefijo;

  for (let i = 1; i <= limpio.length - 3; i++) {
    prefijo = limpio[0] + limpio[1] + limpio[2 + i];
    const colision = db.prepare('SELECT id FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(prefijo);
    if (!colision) return prefijo;
  }

  throw new Error('No se pudo generar un prefijo único para: ' + nombre);
}

function crearCategoria({ nombre, descripcion }) {
  if (!nombre) throw new Error('El nombre de la categoría es obligatorio.');

  const prefijo = generarPrefijo(nombre);

  const existente = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(prefijo);
  if (existente) return { id: existente.id, nombre: existente.nombre };

  db.prepare(
    'INSERT INTO CATEGORIA_HERRAMIENTA (id, nombre, descripcion) VALUES (?, ?, ?)'
  ).run(prefijo, nombre, descripcion || null);

  return { id: prefijo, nombre };
}

/* ================================================================
   FAMILIAS — lote, unidades, edición masiva
   ================================================================ */

function crearLote({ id_categoria, nombre, precio_dia, precio_minimo, precio_mes, precio_venta, cantidad, descripcion }) {
  if (!id_categoria || !nombre || !cantidad || cantidad < 1) {
    throw new Error('Categoría, nombre y cantidad son obligatorios.');
  }

  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(id_categoria);
  if (!cat) throw new Error('Categoría no encontrada: ' + id_categoria);

  // Guardar precios en la categoría para persistencia
  db.prepare(`
    UPDATE CATEGORIA_HERRAMIENTA
    SET nombre = ?, precio_dia = ?, precio_minimo = ?, precio_mes = ?, precio_venta = ?
    WHERE id = ?
  `).run(nombre, precio_dia || 0,
    precio_minimo != null ? precio_minimo : null,
    precio_mes != null ? precio_mes : null,
    precio_venta != null ? precio_venta : null,
    id_categoria);

  const existentes = db
    .prepare("SELECT id FROM HERRAMIENTA WHERE id_categoria = ? AND id LIKE ? ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER) DESC LIMIT 1")
    .get(id_categoria, id_categoria + '-%');

  let inicio = 1;
  if (existentes) {
    const partes = existentes.id.split('-');
    inicio = parseInt(partes[1], 10) + 1;
  }

  const insert = db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, precio_minimo, precio_mes, precio_venta, estado)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'disponible')
  `);

  const creadas = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < cantidad; i++) {
      const num = String(inicio + i);
      const id = id_categoria + '-' + num;
      insert.run(id, id_categoria, nombre, descripcion || null,
        precio_dia || 0,
        precio_minimo != null ? precio_minimo : null,
        precio_mes != null ? precio_mes : null,
        precio_venta != null ? precio_venta : null);
      creadas.push(id);
    }
  });
  tx();

  return { creadas, cantidad: creadas.length };
}

function agregarUnidades(id_categoria, cantidad) {
  if (!cantidad || cantidad < 1) throw new Error('Cantidad debe ser al menos 1.');

  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(id_categoria);
  if (!cat) throw new Error('Categoría no encontrada.');

  const ultima = db
    .prepare("SELECT id, nombre, precio_dia, descripcion FROM HERRAMIENTA WHERE id_categoria = ? AND activo = 1 ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER) DESC LIMIT 1")
    .get(id_categoria);

  let inicio = 1;
  if (ultima) {
    const partes = ultima.id.split('-');
    inicio = parseInt(partes[1], 10) + 1;
  }

  const insert = db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, estado)
    VALUES (?, ?, ?, ?, ?, 0, 'disponible')
  `);

  const creadas = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < cantidad; i++) {
      const num = String(inicio + i);
      const id = id_categoria + '-' + num;
      const nombre = ultima?.nombre || cat.nombre;
      const precio = ultima?.precio_dia ?? cat.precio_dia ?? 0;
      insert.run(id, id_categoria, nombre, null, precio);
      creadas.push(id);
    }
  });
  tx();

  return { creadas, cantidad: creadas.length };
}

function editarFamilia(id_categoria, { nombre, precio_dia, precio_minimo, precio_mes, precio_venta, descripcion, valor_reposicion }) {
  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(id_categoria);
  if (!cat) throw new Error('Categoría no encontrada.');

  // Todos los campos editables, incluyendo nullables
  const updates = {};
  const POSSIBLE = ['nombre', 'precio_dia', 'precio_minimo', 'precio_mes', 'precio_venta', 'descripcion', 'valor_reposicion'];
  for (const k of POSSIBLE) {
    if (arguments[1][k] !== undefined) {
      updates[k] = arguments[1][k];
    }
  }

  if (Object.keys(updates).length > 0) {
    // Actualizar herramientas existentes
    const hFields = Object.keys(updates).map(k => k + ' = ?').join(', ');
    const hParams = Object.values(updates);
    hParams.push(id_categoria);
    db.prepare('UPDATE HERRAMIENTA SET ' + hFields + ' WHERE id_categoria = ? AND activo = 1').run(...hParams);

    // Actualizar categoría (solo campos que aplican a categoría)
    const catValues = {};
    for (const k of ['nombre', 'precio_dia', 'precio_minimo', 'precio_mes', 'precio_venta']) {
      if (updates[k] !== undefined) catValues[k] = updates[k];
    }
    if (Object.keys(catValues).length > 0) {
      const cFields = Object.keys(catValues).map(k => k + ' = ?').join(', ');
      const cParams = Object.values(catValues);
      cParams.push(id_categoria);
      db.prepare('UPDATE CATEGORIA_HERRAMIENTA SET ' + cFields + ' WHERE id = ?').run(...cParams);
    }
  }

  return { ok: true };
}

function eliminarFamilia(id_categoria) {
  // Verificar si alguna herramienta tiene historial de alquiler
  const conHistorial = db.prepare(`
    SELECT DISTINCT h.id, h.estado
    FROM HERRAMIENTA h
    INNER JOIN DETALLE_CONTRATO d ON d.id_herramienta = h.id
    WHERE h.id_categoria = ? AND h.activo = 1
  `).all(id_categoria);

  if (conHistorial.length > 0) {
    const ids = conHistorial.map(h => h.id).join(', ');
    throw new Error(
      'No se puede eliminar: ' + conHistorial.length + ' herramienta(s) tienen historial de alquiler (' + ids + ').'
    );
  }

  // Verificar alquiladas activas (sin historial pero en uso)
  const alquiladas = db.prepare(
    "SELECT COUNT(*) AS c FROM HERRAMIENTA WHERE id_categoria = ? AND estado = 'alquilado' AND activo = 1"
  ).get(id_categoria);

  if (alquiladas.c > 0) {
    throw new Error('No se puede eliminar: hay ' + alquiladas.c + ' herramienta(s) alquilada(s) actualmente.');
  }

  // Eliminar herramientas sin historial
  const r = db.prepare('DELETE FROM HERRAMIENTA WHERE id_categoria = ? AND activo = 1').run(id_categoria);

  // Eliminar categoría
  db.prepare('DELETE FROM CATEGORIA_HERRAMIENTA WHERE id = ?').run(id_categoria);

  return { eliminadas: r.changes };
}

/* ================================================================
   UNIDAD INDIVIDUAL
   ================================================================ */

function eliminarHerramienta(id) {
  const h = db.prepare('SELECT * FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(id);
  if (!h) throw new Error('Herramienta no encontrada: ' + id);

  // Verificar historial de alquiler
  const enContrato = db.prepare(
    'SELECT COUNT(*) AS c FROM DETALLE_CONTRATO WHERE id_herramienta = ?'
  ).get(id);

  if (enContrato.c > 0) {
    throw new Error('No se puede eliminar ' + id + ': tiene historial de alquiler.');
  }

  if (h.estado === 'alquilado') {
    throw new Error('No se puede eliminar ' + id + ': está alquilada actualmente.');
  }

  db.prepare('DELETE FROM HERRAMIENTA WHERE id = ?').run(id);
  return { id };
}

function cambiarEstado(id, nuevoEstado) {
  const h = db.prepare('SELECT * FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(id);
  if (!h) throw new Error('Herramienta no encontrada: ' + id);

  if (h.estado === 'alquilado') {
    throw new Error('No se puede cambiar el estado de una herramienta alquilada. Use Devolución en el Mostrador.');
  }

  const permitidos = {
    disponible: ['mantenimiento', 'malogrado'],
    mantenimiento: ['disponible', 'malogrado'],
    malogrado: ['disponible', 'mantenimiento'],
  };

  const transiciones = permitidos[h.estado];
  if (!transiciones || !transiciones.includes(nuevoEstado)) {
    throw new Error('No se puede cambiar de ' + h.estado + ' a ' + nuevoEstado + '.');
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE HERRAMIENTA SET estado = ? WHERE id = ?').run(nuevoEstado, id);

    // Registrar en bitácora de mantenimiento
    const hoy = localDate();

    if (nuevoEstado === 'mantenimiento') {
      db.prepare(`
        INSERT INTO MANTENIMIENTO (id_herramienta, fecha_inicio, descripcion, tipo)
        VALUES (?, ?, ?, 'correctivo')
      `).run(id, hoy, 'Cambio manual de estado a mantenimiento');
    }

    if (h.estado === 'mantenimiento' && (nuevoEstado === 'disponible' || nuevoEstado === 'malogrado')) {
      db.prepare(`
        UPDATE MANTENIMIENTO SET fecha_fin = ?
        WHERE id_herramienta = ? AND fecha_fin IS NULL
        ORDER BY id DESC LIMIT 1
      `).run(hoy, id);
    }
  });
  tx();

  return { id, estado_anterior: h.estado, estado_nuevo: nuevoEstado };
}

function getHistorialUnidad(id) {
  // Últimos 5 mantenimientos con cliente asociado (si vienen de devolución)
  const mantenimientos = db.prepare(`
    SELECT m.id, m.fecha_inicio, m.fecha_fin, m.descripcion, m.tipo, m.costo, m.id_contrato,
           cl.nombre AS cliente_nombre
    FROM MANTENIMIENTO m
    LEFT JOIN CONTRATO c ON m.id_contrato = c.id
    LEFT JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE m.id_herramienta = ?
    ORDER BY m.id DESC LIMIT 5
  `).all(id);

  // Desglose de daños predefinidos registrados en devoluciones de esta herramienta
  const danos = db.prepare(`
    SELECT d.id_contrato, d.nombre, d.costo, d.fecha
    FROM DAÑO_DEVOLUCION d
    JOIN MANTENIMIENTO m ON m.id_contrato = d.id_contrato
    WHERE m.id_herramienta = ?
    ORDER BY d.fecha DESC
  `).all(id);
  const danosPorContrato = {};
  for (const dd of danos) {
    if (!danosPorContrato[dd.id_contrato]) danosPorContrato[dd.id_contrato] = [];
    danosPorContrato[dd.id_contrato].push({ nombre: dd.nombre, costo: dd.costo });
  }

  return { mantenimientos, danosPorContrato };
}

function getHerramientasPorCategoria() {
  const categorias = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA ORDER BY rowid DESC').all();

  return categorias.map((cat) => {
    const herramientas = db
      .prepare('SELECT * FROM HERRAMIENTA WHERE id_categoria = ? AND activo = 1 ORDER BY id')
      .all(cat.id);

    const conteo = { disponible: 0, alquilado: 0, mantenimiento: 0, malogrado: 0 };
    herramientas.forEach((h) => { conteo[h.estado] = (conteo[h.estado] || 0) + 1; });

    return {
      id_categoria: cat.id,
      categoria_nombre: cat.nombre,
      categoria_desc: cat.descripcion,
      total: herramientas.length,
      conteo,
      herramientas,
      precio_dia: herramientas[0]?.precio_dia ?? cat.precio_dia ?? 0,
      precio_minimo: herramientas[0]?.precio_minimo ?? cat.precio_minimo ?? null,
      precio_mes: herramientas[0]?.precio_mes ?? cat.precio_mes ?? null,
      precio_venta: herramientas[0]?.precio_venta ?? cat.precio_venta ?? null,
      nombre: herramientas[0]?.nombre || cat.nombre,
      imagen_path: cat.imagen_path || null,
    };
  });
}

module.exports = {
  getHerramientas,
  crearHerramienta,
  actualizarHerramienta,
  bajaHerramienta,
  getGranelFull,
  crearGranel,
  actualizarGranel,
  bajaGranel,
  getGranelAgrupado,
  crearMaterial,
  agregarStockGranel,
  editarGranelFull,
  eliminarVariante,
  ajustarStock,
  darBajaGranel,
  repararGranel,
  generarPrefijo,
  crearCategoria,
  crearLote,
  agregarUnidades,
  editarFamilia,
  eliminarFamilia,
  eliminarHerramienta,
  cambiarEstado,
  getHistorialUnidad,
  getHerramientasPorCategoria,
  getAuditGranel,
  revertirAuditGranel,
};
