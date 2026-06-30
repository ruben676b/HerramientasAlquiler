const fs = require('fs');
const { ipcMain, app, shell } = require('electron');
const db = require('./db/database');
const {
  crearContrato,
  registrarDevolucion,
  getContratos,
} = require('./services/contratoService');
const {
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
} = require('./services/inventarioService');
const { consultarDni } = require('./services/reniecService');
const { generarPdf, guardarFirma, generarPdfDesdeDatos } = require('./services/contratoPdfService');

function registerIpcHandlers() {
  // --- Catálogo ---

  ipcMain.handle('get-categorias', () => {
    return db
      .prepare(
        'SELECT id, nombre, descripcion FROM CATEGORIA_HERRAMIENTA ORDER BY id'
      )
      .all();
  });

  ipcMain.handle('get-granel', () => {
    return db
      .prepare(
        `SELECT id, nombre, condicion, precio_dia, mora_dia,
                cantidad_total, cantidad_disponible
         FROM ITEM_GRANEL WHERE activo = 1 ORDER BY nombre, condicion`
      )
      .all();
  });

  ipcMain.handle('get-herramientas-disponibles', () => {
    return db
      .prepare(
        `SELECT h.id, h.nombre, h.precio_dia, h.mora_dia,
                c.nombre AS categoria_nombre, c.id AS categoria_id
         FROM HERRAMIENTA h
         JOIN CATEGORIA_HERRAMIENTA c ON h.id_categoria = c.id
         WHERE h.estado = 'disponible' AND h.activo = 1
         ORDER BY h.id`
      )
      .all();
  });

  // --- Clientes ---

  ipcMain.handle('get-clientes', () => {
    return db
      .prepare(
        `SELECT id, tipo, nombre, dni, telefono, direccion, email,
                en_lista_negra, fecha_registro
         FROM CLIENTE WHERE activo = 1 ORDER BY nombre`
      )
      .all();
  });

  ipcMain.handle('buscar-clientes', (_event, termino) => {
    const patron = '%' + termino + '%';
    return db
      .prepare(
        `SELECT id, tipo, nombre, dni, telefono, en_lista_negra
         FROM CLIENTE
         WHERE activo = 1 AND (nombre LIKE ? OR dni LIKE ?)
         ORDER BY nombre
         LIMIT 10`
      )
      .all(patron, patron);
  });

  // --- Contratos ---

  ipcMain.handle('crear-contrato', (_event, data) => {
    const {
      idCliente,
      idUsuario,
      fechaSalida,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni,
      items,
      pagos,
      dniCliente,
      nombreCliente,
      telefonoCliente,
    } = data;

    return crearContrato(
      idCliente,
      idUsuario,
      fechaSalida,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni,
      items,
      pagos,
      dniCliente,
      nombreCliente,
      telefonoCliente
    );
  });

  ipcMain.handle('registrar-devolucion', (_event, data) => {
    const { idContrato, fechaDevolucionReal, itemsDevueltos, observaciones } = data;

    return registrarDevolucion(idContrato, fechaDevolucionReal, itemsDevueltos, observaciones);
  });

  ipcMain.handle('get-contratos', (_e, filtros) => {
    return getContratos(filtros || {});
  });

  // --- Sistema ---

  ipcMain.handle('close-app', () => {
    app.quit();
  });

  ipcMain.handle('check-db-status', () => {
    try {
      db.prepare('SELECT 1').get();
      return { connected: true };
    } catch {
      return { connected: false };
    }
  });

  // --- Inventario ---

  ipcMain.handle('get-herramientas', (_e, filtros) => {
    return getHerramientas(filtros || {});
  });

  ipcMain.handle('crear-herramienta', (_e, data) => {
    return crearHerramienta(data);
  });

  ipcMain.handle('actualizar-herramienta', (_e, id, data) => {
    return actualizarHerramienta(id, data);
  });

  ipcMain.handle('baja-herramienta', (_e, id) => {
    return bajaHerramienta(id);
  });

  ipcMain.handle('get-granel-full', () => {
    return getGranelAgrupado();
  });

  ipcMain.handle('crear-material', (_e, data) => {
    return crearMaterial(data);
  });

  ipcMain.handle('agregar-stock-granel', (_e, id, cantidad) => {
    return agregarStockGranel(id, cantidad);
  });

  ipcMain.handle('editar-granel-full', (_e, nombreOriginal, data) => {
    return editarGranelFull(nombreOriginal, data);
  });

  ipcMain.handle('eliminar-variante', (_e, id) => {
    return eliminarVariante(id);
  });

  ipcMain.handle('ajustar-stock', (_e, id, delta) => {
    return ajustarStock(id, delta);
  });

  // --- RENIEC ---
  ipcMain.handle('consultar-dni', async (_e, dni) => {
    return await consultarDni(dni);
  });

  // --- Contrato PDF ---
  ipcMain.handle('generar-contrato-pdf', async (_e, idContrato) => {
    return await generarPdf(idContrato);
  });

  ipcMain.handle('guardar-firma', async (_e, idContrato, firmaBase64) => {
    return guardarFirma(idContrato, firmaBase64);
  });

  ipcMain.handle('get-config', (_e, clave) => {
    const row = db.prepare('SELECT valor FROM CONFIGURACION WHERE clave = ?').get(clave);
    return row ? row.valor : '';
  });

  ipcMain.handle('abrir-archivo', async (_e, ruta) => {
    return shell.openPath(ruta);
  });

  ipcMain.handle('generar-pdf-preview', async (_e, datos) => {
    return await generarPdfDesdeDatos(datos);
  });

  ipcMain.handle('leer-archivo-base64', async (_e, ruta) => {
    const buffer = fs.readFileSync(ruta);
    return buffer.toString('base64');
  });

  // --- Configuración ---
  ipcMain.handle('get-all-config', () => {
    const rows = db.prepare('SELECT clave, valor, descripcion FROM CONFIGURACION').all();
    const obj = {};
    rows.forEach(r => { obj[r.clave] = r.valor; });
    return obj;
  });

  ipcMain.handle('save-config', (_e, clave, valor) => {
    db.prepare('INSERT OR REPLACE INTO CONFIGURACION (clave, valor) VALUES (?, ?)').run(clave, valor);
    return { ok: true };
  });

  ipcMain.handle('crear-granel', (_e, data) => {
    return crearGranel(data);
  });

  ipcMain.handle('actualizar-granel', (_e, id, data) => {
    return actualizarGranel(id, data);
  });

  ipcMain.handle('baja-granel', (_e, id) => {
    return bajaGranel(id);
  });

  ipcMain.handle('generar-prefijo', (_e, nombre) => {
    return { prefijo: generarPrefijo(nombre) };
  });

  ipcMain.handle('crear-categoria', (_e, data) => {
    return crearCategoria(data);
  });

  ipcMain.handle('crear-lote', (_e, data) => {
    return crearLote(data);
  });

  ipcMain.handle('agregar-unidades', (_e, id_categoria, cantidad) => {
    return agregarUnidades(id_categoria, cantidad);
  });

  ipcMain.handle('editar-familia', (_e, id_categoria, data) => {
    return editarFamilia(id_categoria, data);
  });

  ipcMain.handle('eliminar-familia', (_e, id_categoria) => {
    return eliminarFamilia(id_categoria);
  });

  ipcMain.handle('eliminar-herramienta', (_e, id) => {
    return eliminarHerramienta(id);
  });

  ipcMain.handle('cambiar-estado', (_e, id, estado) => {
    return cambiarEstado(id, estado);
  });

  ipcMain.handle('get-historial-unidad', (_e, id) => {
    return getHistorialUnidad(id);
  });

  ipcMain.handle('get-herramientas-por-categoria', () => {
    return getHerramientasPorCategoria();
  });

  console.log('[IPC] Manejadores IPC registrados.');
}

module.exports = { registerIpcHandlers };
