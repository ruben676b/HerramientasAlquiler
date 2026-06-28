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
  registrarDevolucion: (data) =>
    ipcRenderer.invoke('registrar-devolucion', data),
  getContratos: (filtros) => ipcRenderer.invoke('get-contratos', filtros),

  // Sistema
  closeApp: () => ipcRenderer.invoke('close-app'),
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
});
