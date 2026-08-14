const os = require('os');
const fs = require('fs');
const path = require('path');
const { ipcMain, app, shell, dialog } = require('electron');
const db = require('./db/database');
const {
  crearContrato,
  crearReserva,
  convertirReserva,
  cancelarReserva,
  registrarDevolucion,
  getContratos,
  registrarPagoAdicional,
  revertirDevolucionItem,
  revertirDevolucionGranel,
  getDevolucionesGranel,
  anularPago,
  editarContrato,
  editarReserva,
  eliminarContrato,
  restaurarContrato,
  autoEliminarPapelera,
} = require('./services/contratoService');
const { checkActivation, activateLicense, getMachineId } = require('./services/licenseService');
const { registrarVentaInventario } = require('./services/ventaService');
const {
  getHerramientas,
  crearHerramienta,
  actualizarHerramienta,
  bajaHerramienta,
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
} = require('./services/inventarioService');
const { consultarDni } = require('./services/reniecService');
const { generarPdf, guardarFirma, generarPdfDesdeDatos } = require('./services/contratoPdfService');
const {
  guardarImagenHerramienta,
  eliminarImagenHerramienta,
  guardarImagenGranel,
  eliminarImagenGranel,
  getImagenItem,
  leerImagen,
} = require('./services/imagenService');
const {
  getDañosPredefinidos,
  guardarDañoPredefinido,
  eliminarDañoPredefinido,
  getDañosItem,
} = require('./services/dañoService');
const { guardarCalificacion } = require('./services/calificacionService');
const {
  getClientesConCalificacion,
  buscarClientesConCalificacion,
  getEtiquetas,
  crearEtiqueta,
  editarEtiqueta,
  eliminarEtiqueta,
  asignarEtiquetasCliente,
  adjuntarEtiquetas,
  getContratosCliente,
  getDetalleContrato,
} = require('./services/clienteService');
const { getResumenCaja, registrarEgreso, eliminarEgreso, guardarCajaDiaria, getHistorialCaja, getCajaDiariaPorFecha, getEstadoCaja, abrirCaja, cerrarCaja } = require('./services/cajaService');
const { generarReporte, getReportes, getReporteById } = require('./services/reporteService');
const { exportarReportePDF } = require('./services/reportePdfService');
const {
  getKits,
  getKitById,
  getKitDisponibilidad,
  crearKit,
  editarKit,
  desactivarKit,
} = require('./services/kitService');

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
        `SELECT id, nombre, condicion, precio_dia, precio_minimo, precio_mes,
                cantidad_total, cantidad_disponible, cantidad_danada,
                cantidad_alquilada, cantidad_perdida, cantidad_vendida, cantidad_baja,
                imagen_path
         FROM ITEM_GRANEL WHERE activo = 1 ORDER BY nombre, condicion`
      )
      .all();
  });

  ipcMain.handle('get-herramientas-disponibles', () => {
    return db
      .prepare(
        `SELECT h.id, h.nombre, h.precio_dia, h.precio_minimo, h.precio_mes,
                c.nombre AS categoria_nombre, c.id AS categoria_id,
                c.imagen_path AS imagen_path
         FROM HERRAMIENTA h
         JOIN CATEGORIA_HERRAMIENTA c ON h.id_categoria = c.id
         WHERE h.estado = 'disponible' AND h.activo = 1
         ORDER BY h.id`
      )
      .all();
  });

  // --- Clientes ---

  ipcMain.handle('get-clientes', () => {
    const clientes = db
      .prepare(
        `SELECT id, tipo, nombre, dni, telefono, direccion, email,
                en_lista_negra, fecha_registro
         FROM CLIENTE WHERE activo = 1 ORDER BY nombre`
      )
      .all();
    return adjuntarEtiquetas(clientes);
  });

  ipcMain.handle('buscar-clientes', (_event, termino) => {
    return buscarClientesConCalificacion(termino);
  });

  // --- Etiquetas de clientes ---

  ipcMain.handle('get-etiquetas', () => {
    return getEtiquetas();
  });

  ipcMain.handle('crear-etiqueta', (_e, nombre, color) => {
    return crearEtiqueta(nombre, color);
  });

  ipcMain.handle('editar-etiqueta', (_e, id, nombre, color) => {
    return editarEtiqueta(id, nombre, color);
  });

  ipcMain.handle('eliminar-etiqueta', (_e, id) => {
    return eliminarEtiqueta(id);
  });

  ipcMain.handle('asignar-etiquetas-cliente', (_e, idCliente, idsEtiquetas) => {
    return asignarEtiquetasCliente(idCliente, idsEtiquetas);
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

  ipcMain.handle('registrar-pago', (_e, data) => {
    const { idContrato, monto, metodo, tipo, idDetalle, ajustes } = data;
    return registrarPagoAdicional(idContrato, monto, metodo, tipo, idDetalle, ajustes);
  });

  ipcMain.handle('revertir-devolucion', (_e, data) => {
    const { idDetalle } = data;
    return revertirDevolucionItem(idDetalle);
  });

  ipcMain.handle('get-devoluciones-granel', (_e, contratoId, itemGranelId) => {
    return getDevolucionesGranel(contratoId, itemGranelId);
  });

  ipcMain.handle('revertir-devolucion-granel', (_e, idDevolucionGranel) => {
    return revertirDevolucionGranel(idDevolucionGranel);
  });

  ipcMain.handle('anular-pago', (_e, data) => {
    const { idPago, motivo } = data;
    return anularPago(idPago, motivo);
  });

  ipcMain.handle('editar-contrato', (_e, idContrato, data) => {
    return editarContrato(idContrato, data);
  });

  ipcMain.handle('editar-reserva', (_e, idContrato, data) => {
    return editarReserva(idContrato, data);
  });

  ipcMain.handle('eliminar-contrato', (_e, idContrato, motivo) => {
    return eliminarContrato(idContrato, motivo);
  });

  ipcMain.handle('restaurar-contrato', (_e, idContrato) => {
    return restaurarContrato(idContrato);
  });

// --- Kits ---

  ipcMain.handle('get-kits', () => getKits());

  ipcMain.handle('get-kit', (_e, idKit) => getKitById(idKit));

  ipcMain.handle('crear-kit', (_e, data) => crearKit(data));

  ipcMain.handle('editar-kit', (_e, idKit, data) => editarKit(idKit, data));

  ipcMain.handle('desactivar-kit', (_e, idKit) => desactivarKit(idKit));

  ipcMain.handle('get-kit-disponibilidad', (_e, idKit) => getKitDisponibilidad(idKit));

  // --- Reservas ---

  ipcMain.handle('crear-reserva', (_event, data) => {
    const {
      idCliente,
      idUsuario,
      fechaReserva,
      fechaDevolucionPactada,
      depositoMonto,
      depositoDni,
      items,
      pagos,
      dniCliente,
      nombreCliente,
      telefonoCliente,
    } = data;

    return crearReserva(
      idCliente,
      idUsuario,
      fechaReserva,
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

  ipcMain.handle('convertir-reserva', (_event, idContrato) => {
    return convertirReserva(idContrato);
  });

  ipcMain.handle('cancelar-reserva', (_event, idContrato, devolverAdelanto) => {
    return cancelarReserva(idContrato, devolverAdelanto);
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

  ipcMain.handle('reparar-granel', (_e, id, cantidad) => {
    return repararGranel(id, cantidad);
  });

  ipcMain.handle('dar-baja-granel', (_e, id, cantidad, motivo) => {
    return darBajaGranel(id, cantidad, motivo);
  });

  ipcMain.handle('get-audit-granel', (_e, itemId) => {
    return getAuditGranel(itemId);
  });

  ipcMain.handle('revertir-audit-granel', (_e, auditId) => {
    return revertirAuditGranel(auditId);
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

  // --- Imágenes de referencia ---
  ipcMain.handle('guardar-imagen-herramienta', (_e, idCategoria, base64) => {
    return guardarImagenHerramienta(idCategoria, base64);
  });

  ipcMain.handle('eliminar-imagen-herramienta', (_e, idCategoria) => {
    return eliminarImagenHerramienta(idCategoria);
  });

  ipcMain.handle('guardar-imagen-granel', (_e, nombre, base64) => {
    return guardarImagenGranel(nombre, base64);
  });

  ipcMain.handle('eliminar-imagen-granel', (_e, nombre) => {
    return eliminarImagenGranel(nombre);
  });

  ipcMain.handle('get-imagen-item', (_e, tipo, id) => {
    return getImagenItem(tipo, id);
  });

  ipcMain.handle('leer-imagen', (_e, ruta) => {
    return leerImagen(ruta);
  });

  // --- Daños predefinidos ---
  ipcMain.handle('get-danos-predefinidos', (_e, tipoItem, ref) => {
    return getDañosPredefinidos(tipoItem, ref);
  });

  ipcMain.handle('guardar-dano-predefinido', (_e, datos) => {
    return guardarDañoPredefinido(datos);
  });

  ipcMain.handle('eliminar-dano-predefinido', (_e, id) => {
    return eliminarDañoPredefinido(id);
  });

  ipcMain.handle('get-danos-item', (_e, tipo, id) => {
    return getDañosItem(tipo, id);
  });

  // --- Configuración ---
  ipcMain.handle('get-all-config', () => {
    const rows = db.prepare('SELECT clave, valor, descripcion FROM CONFIGURACION').all();
    const obj = {};
    rows.forEach(r => { obj[r.clave] = r.valor; });
    
    // Merge from JSON
    const configService = require('./services/configService');
    const jsonConfig = configService.readConfigJson();
    return { ...obj, ...jsonConfig };
  });

  ipcMain.handle('save-config', (_e, clave, valor) => {
    const jsonKeys = ['api_reniec_key', 'licencia_activacion'];
    if (jsonKeys.includes(clave)) {
      const configService = require('./services/configService');
      configService.setJsonConfigValue(clave, valor);
    } else {
      db.prepare('INSERT OR REPLACE INTO CONFIGURACION (clave, valor) VALUES (?, ?)').run(clave, valor);
    }
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

  // --- Calificación de clientes ---
  ipcMain.handle('guardar-calificacion', (_e, idContrato, estrellas, comentario) => {
    return guardarCalificacion(idContrato, estrellas, comentario);
  });

  // --- Panel de clientes ---
  ipcMain.handle('get-clientes-panel', () => {
    return getClientesConCalificacion();
  });

  ipcMain.handle('buscar-clientes-panel', (_e, termino) => {
    return buscarClientesConCalificacion(termino);
  });

  ipcMain.handle('get-contratos-cliente', (_e, idCliente) => {
    return getContratosCliente(idCliente);
  });

  ipcMain.handle('get-detalle-contrato', (_e, idContrato) => {
    return getDetalleContrato(idContrato);
  });

ipcMain.handle('log', (_e, msg) => {
    const logFile = path.join(os.tmpdir(), 'sistema-alquiler-debug.log');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log('[RENDERER LOG]', msg);
  });

  // --- Caja ---
  ipcMain.handle('get-resumen-caja', (event, fecha) => {
    return getResumenCaja(fecha);
  });

  ipcMain.handle('registrar-venta-inventario', (event, data) => {
    return registrarVentaInventario(data);
  });

  ipcMain.handle('registrar-egreso-caja', (_e, data) => {
    return registrarEgreso(data);
  });

  ipcMain.handle('eliminar-egreso-caja', (_e, id) => {
    return eliminarEgreso(id);
  });

  ipcMain.handle('guardar-caja-diaria', (_e, fecha, montoInicial) => {
    return guardarCajaDiaria(fecha, montoInicial);
  });

  ipcMain.handle('get-historial-caja', () => {
    return getHistorialCaja();
  });

  ipcMain.handle('get-caja-diaria', (_e, fecha) => {
    return getCajaDiariaPorFecha(fecha);
  });

  ipcMain.handle('get-estado-caja', () => {
    return getEstadoCaja();
  });

  ipcMain.handle('abrir-caja', (_e, monto) => {
    return abrirCaja(monto);
  });

  ipcMain.handle('cerrar-caja', () => {
    return cerrarCaja();
  });

  // --- Reportes ---
  ipcMain.handle('reporte:generar', () => {
    return generarReporte();
  });

  ipcMain.handle('reporte:listar', () => {
    return getReportes();
  });

  ipcMain.handle('reporte:obtener', (_e, id) => {
    return getReporteById(id);
  });

  ipcMain.handle('reporte:exportar-pdf', async (_e, id) => {
    return await exportarReportePDF(id);
  });

  // --- Backup ---
  ipcMain.handle('crear-backup', async () => {
    try {
      const dbPath = db.name;
      const defaultPath = path.join(app.getPath('documents'), `backup_alquiler_${Date.now()}.db`);
      const result = await dialog.showSaveDialog({
        title: 'Guardar Backup de la Base de Datos',
        defaultPath,
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
      });

      if (result.canceled) return { success: false, cancelado: true };

      // better-sqlite3 provide a .backup() method
      await db.backup(result.filePath);
      return { success: true, ruta: result.filePath };
    } catch (error) {
      console.error('[Backup Error]', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('restaurar-backup', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Seleccionar Backup para Restaurar',
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
      });

      if (result.canceled || result.filePaths.length === 0) return { success: false, cancelado: true };

      const backupPath = result.filePaths[0];
      const targetDbPath = db.name;

      // Close current db connection
      db.close();

      // Overwrite the .db file
      fs.copyFileSync(backupPath, targetDbPath);
      
      // Delete WAL and SHM files to avoid corruption when opening the copied db
      if (fs.existsSync(targetDbPath + '-wal')) fs.unlinkSync(targetDbPath + '-wal');
      if (fs.existsSync(targetDbPath + '-shm')) fs.unlinkSync(targetDbPath + '-shm');

      // Restart the application to load the new database
      app.relaunch();
      app.exit(0);
      
      return { success: true };
    } catch (error) {
      console.error('[Restaurar Error]', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('license:check', () => checkActivation());
  ipcMain.handle('license:activate', (_e, key) => activateLicense(key));
  ipcMain.handle('license:getMachineId', () => getMachineId());
  ipcMain.handle('license:getRawMachineId', () => {
    const { machineIdSync } = require('node-machine-id');
    return machineIdSync({ original: true });
  });

  console.log('[IPC] Manejadores IPC registrados.');
}

module.exports = { registerIpcHandlers };
