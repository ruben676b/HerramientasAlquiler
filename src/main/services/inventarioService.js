const db = require('../db/database');

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

function crearHerramienta({ id, id_categoria, nombre, descripcion, precio_dia, mora_dia, valor_reposicion, fecha_adquisicion }) {
  if (!id || !id_categoria || !nombre) throw new Error('Código, categoría y nombre son obligatorios.');

  const existente = db.prepare('SELECT id FROM HERRAMIENTA WHERE id = ?').get(id);
  if (existente) throw new Error('Ya existe una herramienta con el código ' + id);

  db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, valor_reposicion, fecha_adquisicion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, id_categoria, nombre, descripcion || null, precio_dia || 0, mora_dia || 0, valor_reposicion || null, fecha_adquisicion || null);

  return { id };
}

function actualizarHerramienta(id, datos) {
  const h = db.prepare('SELECT * FROM HERRAMIENTA WHERE id = ? AND activo = 1').get(id);
  if (!h) throw new Error('Herramienta no encontrada: ' + id);

  const fields = [];
  const params = [];

  for (const [k, v] of Object.entries(datos)) {
    const allowed = ['nombre', 'descripcion', 'precio_dia', 'mora_dia', 'valor_reposicion', 'estado', 'fecha_adquisicion', 'id_categoria'];
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

function crearGranel({ nombre, condicion, precio_dia, mora_dia, cantidad_total }) {
  if (!nombre || !condicion) throw new Error('Nombre y condición son obligatorios.');

  const r = db.prepare(`
    INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, cantidad_total, cantidad_disponible)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nombre, condicion, precio_dia || 0, mora_dia || 0, cantidad_total || 0, cantidad_total || 0);

  return { id: r.lastInsertRowid };
}

function actualizarGranel(id, datos) {
  const g = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!g) throw new Error('Ítem no encontrado: ' + id);

  const fields = [];
  const params = [];

  for (const [k, v] of Object.entries(datos)) {
    const allowed = ['nombre', 'condicion', 'precio_dia', 'mora_dia', 'cantidad_total'];
    if (allowed.includes(k) && v !== undefined) {
      fields.push(k + ' = ?');
      params.push(v);
    }
  }

  if (!fields.length) return { id };

  params.push(id);
  db.prepare('UPDATE ITEM_GRANEL SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);

  // Sincronizar cantidad_disponible con cantidad_total si corresponde
  if (datos.cantidad_total !== undefined) {
    db.prepare('UPDATE ITEM_GRANEL SET cantidad_disponible = cantidad_total WHERE id = ?').run(id);
  }

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
        variantes: [],
      };
    }
    const g = mapa[item.nombre];
    g.total += item.cantidad_total;
    g.disponibles += item.cantidad_disponible;
    g.variantes.push(item);
  }

  return Object.values(mapa);
}

function crearMaterial({ nombre, precio_nuevo, mora_nuevo, precio_usado, mora_usado }) {
  if (!nombre) throw new Error('El nombre del material es obligatorio.');

  const insert = db.prepare(`
    INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, cantidad_total, cantidad_disponible)
    VALUES (?, ?, ?, ?, 0, 0)
  `);

  const tx = db.transaction(() => {
    insert.run(nombre, 'nuevo', precio_nuevo || 0, mora_nuevo || 0);
    insert.run(nombre, 'usado', precio_usado || 0, mora_usado || 0);
  });
  tx();

  return { nombre };
}

function agregarStockGranel(id, cantidad) {
  if (!cantidad || cantidad < 1) throw new Error('Cantidad debe ser al menos 1.');

  const item = db.prepare('SELECT * FROM ITEM_GRANEL WHERE id = ? AND activo = 1').get(id);
  if (!item) throw new Error('Material no encontrado.');

  db.prepare(`
    UPDATE ITEM_GRANEL SET cantidad_total = cantidad_total + ?, cantidad_disponible = cantidad_disponible + ?
    WHERE id = ?
  `).run(cantidad, cantidad, id);

  return { id, agregado: cantidad };
}

function editarGranelFull(nombreOriginal, { nombre, precio_nuevo, mora_nuevo, precio_usado, mora_usado }) {
  if (!nombre) throw new Error('El nombre es obligatorio.');

  const tx = db.transaction(() => {
    if (nombre !== nombreOriginal) {
      db.prepare('UPDATE ITEM_GRANEL SET nombre = ? WHERE nombre = ? AND activo = 1').run(nombre, nombreOriginal);
    }
    if (precio_nuevo !== undefined) {
      db.prepare('UPDATE ITEM_GRANEL SET precio_dia = ? WHERE nombre = ? AND condicion = ? AND activo = 1').run(precio_nuevo || 0, nombre, 'nuevo');
    }
    if (mora_nuevo !== undefined) {
      db.prepare('UPDATE ITEM_GRANEL SET mora_dia = ? WHERE nombre = ? AND condicion = ? AND activo = 1').run(mora_nuevo || 0, nombre, 'nuevo');
    }
    if (precio_usado !== undefined) {
      db.prepare('UPDATE ITEM_GRANEL SET precio_dia = ? WHERE nombre = ? AND condicion = ? AND activo = 1').run(precio_usado || 0, nombre, 'usado');
    }
    if (mora_usado !== undefined) {
      db.prepare('UPDATE ITEM_GRANEL SET mora_dia = ? WHERE nombre = ? AND condicion = ? AND activo = 1').run(mora_usado || 0, nombre, 'usado');
    }
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

  const nuevoDisponible = item.cantidad_disponible + delta;
  if (nuevoDisponible < 0) throw new Error('No se puede dejar stock negativo. Disponible: ' + item.cantidad_disponible);

  const nuevoTotal = item.cantidad_total + delta;
  if (nuevoTotal < 0) throw new Error('No se puede dejar stock total negativo.');

  db.prepare(`
    UPDATE ITEM_GRANEL SET cantidad_total = ?, cantidad_disponible = ?
    WHERE id = ?
  `).run(nuevoTotal, nuevoDisponible, id);

  return { id, disponible: nuevoDisponible, total: nuevoTotal };
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

function crearLote({ id_categoria, nombre, precio_dia, mora_dia, cantidad, descripcion }) {
  if (!id_categoria || !nombre || !cantidad || cantidad < 1) {
    throw new Error('Categoría, nombre y cantidad son obligatorios.');
  }

  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(id_categoria);
  if (!cat) throw new Error('Categoría no encontrada: ' + id_categoria);

  // Guardar precios en la categoría para persistencia
  db.prepare('UPDATE CATEGORIA_HERRAMIENTA SET nombre = ?, precio_dia = ?, mora_dia = ? WHERE id = ?')
    .run(nombre, precio_dia || 0, mora_dia || 0, id_categoria);

  const existentes = db
    .prepare("SELECT id FROM HERRAMIENTA WHERE id_categoria = ? AND id LIKE ? ORDER BY id DESC LIMIT 1")
    .get(id_categoria, id_categoria + '-%');

  let inicio = 1;
  if (existentes) {
    const partes = existentes.id.split('-');
    inicio = parseInt(partes[1], 10) + 1;
  }

  const insert = db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, estado)
    VALUES (?, ?, ?, ?, ?, ?, 'disponible')
  `);

  const creadas = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < cantidad; i++) {
      const num = String(inicio + i);
      const id = id_categoria + '-' + num;
      insert.run(id, id_categoria, nombre, descripcion || null, precio_dia || 0, mora_dia || 0);
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
    .prepare("SELECT id, nombre, precio_dia, mora_dia, descripcion FROM HERRAMIENTA WHERE id_categoria = ? AND activo = 1 ORDER BY id DESC LIMIT 1")
    .get(id_categoria);

  let inicio = 1;
  if (ultima) {
    const partes = ultima.id.split('-');
    inicio = parseInt(partes[1], 10) + 1;
  }

  const insert = db.prepare(`
    INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, estado)
    VALUES (?, ?, ?, ?, ?, ?, 'disponible')
  `);

  const creadas = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < cantidad; i++) {
      const num = String(inicio + i);
      const id = id_categoria + '-' + num;
      const nombre = ultima?.nombre || cat.nombre;
      const precio = ultima?.precio_dia ?? cat.precio_dia ?? 0;
      const mora = ultima?.mora_dia ?? cat.mora_dia ?? 0;
      insert.run(id, id_categoria, nombre, null, precio, mora);
      creadas.push(id);
    }
  });
  tx();

  return { creadas, cantidad: creadas.length };
}

function editarFamilia(id_categoria, { nombre, precio_dia, mora_dia, descripcion, valor_reposicion }) {
  const cat = db.prepare('SELECT * FROM CATEGORIA_HERRAMIENTA WHERE id = ?').get(id_categoria);
  if (!cat) throw new Error('Categoría no encontrada.');

  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries({ nombre, precio_dia, mora_dia, descripcion, valor_reposicion })) {
    if (v !== undefined && v !== null && v !== '') {
      fields.push(k + ' = ?');
      params.push(v);
    }
  }

  if (fields.length > 0) {
    // Actualizar herramientas existentes
    params.push(id_categoria);
    db.prepare('UPDATE HERRAMIENTA SET ' + fields.join(', ') + ' WHERE id_categoria = ? AND activo = 1').run(...params);

    // También actualizar la categoría (para cuando no hay unidades)
    const catFields = [];
    const catParams = [];
    if (nombre !== undefined && nombre !== null && nombre !== '') {
      catFields.push('nombre = ?');
      catParams.push(nombre);
    }
    if (precio_dia !== undefined && precio_dia !== null) {
      catFields.push('precio_dia = ?');
      catParams.push(precio_dia);
    }
    if (mora_dia !== undefined && mora_dia !== null) {
      catFields.push('mora_dia = ?');
      catParams.push(mora_dia);
    }
    if (catFields.length > 0) {
      catParams.push(id_categoria);
      db.prepare('UPDATE CATEGORIA_HERRAMIENTA SET ' + catFields.join(', ') + ' WHERE id = ?').run(...catParams);
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
    const hoy = new Date().toISOString().slice(0, 10);

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
  const ultimoAlquiler = db.prepare(`
    SELECT c.id AS contrato_id, c.fecha_salida, c.fecha_devolucion_real, cl.nombre AS cliente_nombre
    FROM DETALLE_CONTRATO d
    JOIN CONTRATO c ON d.id_contrato = c.id
    JOIN CLIENTE cl ON c.id_cliente = cl.id
    WHERE d.id_herramienta = ?
    ORDER BY c.fecha_creacion DESC LIMIT 1
  `).get(id);

  const ultimoMantenimiento = db.prepare(`
    SELECT fecha_inicio, fecha_fin, descripcion, tipo, costo
    FROM MANTENIMIENTO
    WHERE id_herramienta = ?
    ORDER BY id DESC LIMIT 3
  `).all(id);

  return { ultimoAlquiler: ultimoAlquiler || null, mantenimientos: ultimoMantenimiento };
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
      precio_dia: herramientas[0]?.precio_dia || cat.precio_dia || 0,
      mora_dia: herramientas[0]?.mora_dia || cat.mora_dia || 0,
      nombre: herramientas[0]?.nombre || cat.nombre,
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
};
