const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Catálogo
  getCategorias: () => ipcRenderer.invoke('get-categorias'),
  getGranel: () => ipcRenderer.invoke('get-granel'),
  getHerramientasDisponibles: () =>
    ipcRenderer.invoke('get-herramientas-disponibles'),

  // Clientes
  getClientes: () => ipcRenderer.invoke('get-clientes'),
  buscarClientes: (termino) => ipcRenderer.invoke('buscar-clientes', termino),

  // Contratos
  crearContrato: (data) => ipcRenderer.invoke('crear-contrato', data),
  crearReserva: (data) => ipcRenderer.invoke('crear-reserva', data),
  convertirReserva: (id) => ipcRenderer.invoke('convertir-reserva', id),
  cancelarReserva: (id, devolverAdelanto) => ipcRenderer.invoke('cancelar-reserva', id, devolverAdelanto),
  registrarDevolucion: (data) =>
    ipcRenderer.invoke('registrar-devolucion', data),
  revertirDevolucion: (data) =>
    ipcRenderer.invoke('revertir-devolucion', data),
  getDevolucionesGranel: (contratoId, itemGranelId) =>
    ipcRenderer.invoke('get-devoluciones-granel', contratoId, itemGranelId),
  revertirDevolucionGranel: (idDevolucionGranel) =>
    ipcRenderer.invoke('revertir-devolucion-granel', idDevolucionGranel),
  getContratos: (filtros) => ipcRenderer.invoke('get-contratos', filtros),
  registrarPago: (data) => ipcRenderer.invoke('registrar-pago', data),
  anularPago: (data) => ipcRenderer.invoke('anular-pago', data),
  editarContrato: (id, data) => ipcRenderer.invoke('editar-contrato', id, data),
  editarReserva: (id, data) => ipcRenderer.invoke('editar-reserva', id, data),
  eliminarContrato: (id, motivo) => ipcRenderer.invoke('eliminar-contrato', id, motivo),
  restaurarContrato: (id) => ipcRenderer.invoke('restaurar-contrato', id),

  // Sistema
  closeApp: () => ipcRenderer.send('force-quit'),
  onCloseRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('close-requested', handler);
    return () => ipcRenderer.removeListener('close-requested', handler);
  },
  checkDbStatus: () => ipcRenderer.invoke('check-db-status'),

  // Inventario
  getHerramientas: (filtros) => ipcRenderer.invoke('get-herramientas', filtros),
  crearHerramienta: (data) => ipcRenderer.invoke('crear-herramienta', data),
  actualizarHerramienta: (id, data) => ipcRenderer.invoke('actualizar-herramienta', id, data),
  bajaHerramienta: (id) => ipcRenderer.invoke('baja-herramienta', id),
  getGranelFull: () => ipcRenderer.invoke('get-granel-full'),
  crearMaterial: (data) => ipcRenderer.invoke('crear-material', data),
  agregarStockGranel: (id, cant) => ipcRenderer.invoke('agregar-stock-granel', id, cant),
  editarGranelFull: (nombreOrig, data) => ipcRenderer.invoke('editar-granel-full', nombreOrig, data),
  eliminarVariante: (id) => ipcRenderer.invoke('eliminar-variante', id),
  ajustarStock: (id, delta) => ipcRenderer.invoke('ajustar-stock', id, delta),
  repararGranel: (id, cantidad) => ipcRenderer.invoke('reparar-granel', id, cantidad),
  darBajaGranel: (id, cantidad, motivo) => ipcRenderer.invoke('dar-baja-granel', id, cantidad, motivo),
  getAuditGranel: (itemId) => ipcRenderer.invoke('get-audit-granel', itemId),
  revertirAuditGranel: (auditId) => ipcRenderer.invoke('revertir-audit-granel', auditId),
  crearGranel: (data) => ipcRenderer.invoke('crear-granel', data),
  actualizarGranel: (id, data) => ipcRenderer.invoke('actualizar-granel', id, data),
  bajaGranel: (id) => ipcRenderer.invoke('baja-granel', id),
  crearCategoria: (data) => ipcRenderer.invoke('crear-categoria', data),
  crearLote: (data) => ipcRenderer.invoke('crear-lote', data),
  agregarUnidades: (idCat, cant) => ipcRenderer.invoke('agregar-unidades', idCat, cant),
  editarFamilia: (idCat, data) => ipcRenderer.invoke('editar-familia', idCat, data),
  eliminarFamilia: (idCat) => ipcRenderer.invoke('eliminar-familia', idCat),
  eliminarHerramienta: (id) => ipcRenderer.invoke('eliminar-herramienta', id),
  cambiarEstado: (id, estado) => ipcRenderer.invoke('cambiar-estado', id, estado),
  getHistorialUnidad: (id) => ipcRenderer.invoke('get-historial-unidad', id),
  getHerramientasPorCategoria: () => ipcRenderer.invoke('get-herramientas-por-categoria'),
  consultarDni: (dni) => ipcRenderer.invoke('consultar-dni', dni),
  generarContratoPdf: (idContrato) => ipcRenderer.invoke('generar-contrato-pdf', idContrato),
  guardarFirma: (idContrato, firma) => ipcRenderer.invoke('guardar-firma', idContrato, firma),
  getConfig: (clave) => ipcRenderer.invoke('get-config', clave),
  abrirArchivo: (ruta) => ipcRenderer.invoke('abrir-archivo', ruta),
  generarPdfPreview: (datos) => ipcRenderer.invoke('generar-pdf-preview', datos),
  leerArchivoBase64: (ruta) => ipcRenderer.invoke('leer-archivo-base64', ruta),

  // Imágenes de referencia
  guardarImagenHerramienta: (idCategoria, base64) => ipcRenderer.invoke('guardar-imagen-herramienta', idCategoria, base64),
  eliminarImagenHerramienta: (idCategoria) => ipcRenderer.invoke('eliminar-imagen-herramienta', idCategoria),
  guardarImagenGranel: (nombre, base64) => ipcRenderer.invoke('guardar-imagen-granel', nombre, base64),
  eliminarImagenGranel: (nombre) => ipcRenderer.invoke('eliminar-imagen-granel', nombre),
  getImagenItem: (tipo, id) => ipcRenderer.invoke('get-imagen-item', tipo, id),
  leerImagen: (ruta) => ipcRenderer.invoke('leer-imagen', ruta),

  // Daños predefinidos
  getDañosPredefinidos: (tipoItem, ref) => ipcRenderer.invoke('get-danos-predefinidos', tipoItem, ref),
  guardarDañoPredefinido: (datos) => ipcRenderer.invoke('guardar-dano-predefinido', datos),
  eliminarDañoPredefinido: (id) => ipcRenderer.invoke('eliminar-dano-predefinido', id),
  getDañosItem: (tipo, id) => ipcRenderer.invoke('get-danos-item', tipo, id),
  getAllConfig: () => ipcRenderer.invoke('get-all-config'),
  saveConfig: (clave, valor) => ipcRenderer.invoke('save-config', clave, valor),

  // Calificación de clientes
  guardarCalificacion: (idContrato, estrellas, comentario) => ipcRenderer.invoke('guardar-calificacion', idContrato, estrellas, comentario),

  // Panel de clientes
  getClientesPanel: () => ipcRenderer.invoke('get-clientes-panel'),
  buscarClientesPanel: (termino) => ipcRenderer.invoke('buscar-clientes-panel', termino),
  getContratosCliente: (id) => ipcRenderer.invoke('get-contratos-cliente', id),
  getDetalleContrato: (id) => ipcRenderer.invoke('get-detalle-contrato', id),

// Kits
  getKits: () => ipcRenderer.invoke('get-kits'),
  getKit: (id) => ipcRenderer.invoke('get-kit', id),
  crearKit: (data) => ipcRenderer.invoke('crear-kit', data),
  editarKit: (id, data) => ipcRenderer.invoke('editar-kit', id, data),
  desactivarKit: (id) => ipcRenderer.invoke('desactivar-kit', id),
  getKitDisponibilidad: (id) => ipcRenderer.invoke('get-kit-disponibilidad', id),

// Debug
  log: (msg) => ipcRenderer.invoke('log', msg),

  // Caja
  getResumenCaja: (fecha) => ipcRenderer.invoke('get-resumen-caja', fecha),

  // Backup
  crearBackup: () => ipcRenderer.invoke('crear-backup'),
  restaurarBackup: () => ipcRenderer.invoke('restaurar-backup'),

  // Licencia
  license: {
    check: () => ipcRenderer.invoke('license:check'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    getMachineId: () => ipcRenderer.invoke('license:getMachineId'),
    getRawMachineId: () => ipcRenderer.invoke('license:getRawMachineId'),
  },
});
