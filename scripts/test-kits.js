// Smoke test: sistema de kits (backend) — Fase 1
// Requiere ejecutarse desde la raíz del proyecto con node.
const path = require('path');
const os = require('os');
const Module = require('module');

// Stub de electron para poder cargar los servicios en node plano
const tmpUserData = path.join(os.tmpdir(), 'kit-test-userdata-' + Date.now());
require('fs').mkdirSync(tmpUserData, { recursive: true });
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => tmpUserData },
      ipcMain: { handle: () => {} },
      shell: {},
      dialog: {},
    };
  }
  return originalLoad.apply(this, arguments);
};

const db = require('../src/main/db/database');
const { initDatabase } = require('../src/main/db/init');
const { crearKit, getKits, getKitById, editarKit, desactivarKit } = require('../src/main/services/kitService');
const {
  crearContrato,
  registrarDevolucion,
  getContratos,
  revertirDevolucionItem,
  revertirDevolucionGranel,
} = require('../src/main/services/contratoService');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('ok - ' + msg);
}

initDatabase();

// --- Seed ---
const idCli = db.prepare("INSERT INTO CLIENTE (tipo, nombre, dni, telefono) VALUES ('persona', 'Test Kits', '12345678', '999')").run().lastInsertRowid;

// Herramienta para componente individual (requiere categoría por FK)
db.prepare("INSERT INTO CATEGORIA_HERRAMIENTA (id, nombre) VALUES ('CAT-TEST', 'General')").run();
db.prepare("INSERT INTO HERRAMIENTA (id, id_categoria, nombre, precio_dia, precio_venta, estado, activo) VALUES ('MAT-9001', 'CAT-TEST', 'Taladro Test', 25, 350, 'disponible', 1)").run();
// Ítem granel para componente
const idGranel = db.prepare("INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, cantidad_total, cantidad_disponible, cantidad_alquilada, cantidad_danada, cantidad_perdida, activo) VALUES ('Tubo PVC 2m', 'usado', 5, 50, 50, 0, 0, 0, 1)").run().lastInsertRowid;

// --- 1. CRUD kits ---
const kit1 = crearKit({
  nombre: 'Kit Taladro + Tubos',
  descripcion: 'Kit de prueba',
  precio_dia: 40,
  precio_minimo: 20,
  precio_mes: 800,
  precio_venta: 1200,
  componentes: [
    { tipo_item: 'individual', id_herramienta: 'MAT-9001', cantidad: 1 },
    { tipo_item: 'granel', id_item_granel: idGranel, cantidad: 2 },
  ],
});
assert(kit1.id > 0, 'crearKit crea kit #' + kit1.id);

const kits = getKits();
assert(kits.length === 1, 'getKits devuelve 1 kit');
assert(kits[0].componentes.length === 2, 'kit tiene 2 componentes');
assert(kits[0].disponibilidad === 1, 'disponibilidad = 1 (taladro disponible, 50/2 tubos)');

const kitDet = getKitById(kit1.id);
assert(kitDet.nombre === 'Kit Taladro + Tubos', 'getKitById devuelve nombre correcto');

// --- 2. Contrato con kit ---
const c1 = crearContrato(
  idCli, 1, '2026-08-01', '2026-08-03', 0, 0,
  [{ tipo_item: 'kit', id_kit: kit1.id, cantidad: 1 }],
  [{ monto: 40, metodo: 'efectivo', tipo: 'saldo' }],
  null, null, null
);
assert(c1.idContrato > 0, 'crearContrato con kit crea contrato #' + c1.idContrato);

// Estado del stock tras el alquiler
const taladro = db.prepare("SELECT estado FROM HERRAMIENTA WHERE id = 'MAT-9001'").get();
assert(taladro.estado === 'alquilado', 'herramienta componente pasa a alquilado');
const tubo = db.prepare('SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id = ?').get(idGranel);
assert(tubo.cantidad_alquilada === 2, 'granel componente: cantidad_alquilada = 2');

const cs1 = getContratos({}).find(c => c.id === c1.idContrato);
assert(cs1, 'getContratos incluye el contrato');
const kitLine = cs1.items.find(i => i.tipo_item === 'kit');
const compLines = cs1.items.filter(i => i.tipo_item !== 'kit');
assert(kitLine && kitLine.item_nombre === 'Kit Taladro + Tubos', 'línea kit con nombre y precio');
assert(kitLine.total_item === 120, 'línea kit factura 120 (3 días × 40)');
assert(kitLine.item_codigo === 'KIT-' + kit1.id, 'línea kit código KIT-n');
assert(compLines.length === 2, '2 líneas componente en el contrato');
const compInd = compLines.find(i => i.tipo_item === 'individual');
const compGr = compLines.find(i => i.tipo_item === 'granel');
assert(compInd.kit_nombre === 'Kit Taladro + Tubos', 'componente individual con kit_nombre');
assert(compGr.cantidad === 2 && compGr.precio_dia_aplicado === 0, 'componente granel cantidad 2, precio 0');
assert(compInd.precio_dia_aplicado === 0, 'componente individual precio 0');
assert(cs1.total_contrato === 120, 'total contrato = 120 (solo la línea kit factura)');

// --- 3. Devolución parcial (solo taladro) ---
const dev1 = registrarDevolucion(c1.idContrato, '2026-08-03', [
  { id_detalle: compInd.id, estado_devolucion: 'bien' },
], {});
const cs1b = getContratos({}).find(c => c.id === c1.idContrato);
assert(dev1.completado === false, 'devolución parcial: contrato incompleto');
assert(cs1b.estado === 'devolución incompleta', 'estado = devolución incompleta');
const kitLineB = cs1b.items.find(i => i.tipo_item === 'kit');
assert(kitLineB.estado_devolucion === 'pendiente', 'kit sigue pendiente tras devolución parcial');
assert(kitLineB.fecha_devolucion_real == null, 'kit sin fecha real tras parcial');
assert(cs1b.items.find(i => i.id === compGr.id).granel_pendiente === 2, 'componente granel sigue pendiente (2)');

// --- 4. Devolución completa (tubos en bien) ---
const dev2 = registrarDevolucion(c1.idContrato, '2026-08-03', [
  { id_detalle: compGr.id, estado_devolucion: 'bien', cantidad_devuelta: 2 },
], {});
assert(dev2.completado === true, 'devolución completa: contrato devuelto');
const cs1c = getContratos({}).find(c => c.id === c1.idContrato);
assert(cs1c.estado === 'devuelto', 'estado = devuelto');
const kitLineC = cs1c.items.find(i => i.tipo_item === 'kit');
assert(kitLineC.estado_devolucion === 'bien', 'kit pasa a bien al completarse');
assert(kitLineC.fecha_devolucion_real === '2026-08-03', 'kit con fecha de devolución real');
const tuboFin = db.prepare('SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id = ?').get(idGranel);
assert(tuboFin.cantidad_alquilada === 0, 'stock granel liberado tras devolución');

// --- 5. Contrato 2: kit perdido completo ---
const c2 = crearContrato(
  idCli, 1, '2026-08-04', '2026-08-05', 0, 0,
  [{ tipo_item: 'kit', id_kit: kit1.id, cantidad: 1 }],
  [], null, null, null
);
const cs2 = getContratos({}).find(c => c.id === c2.idContrato);
const kitLine2 = cs2.items.find(i => i.tipo_item === 'kit');
const grLine2 = cs2.items.find(i => i.tipo_item === 'granel');
const indLine2 = cs2.items.find(i => i.tipo_item === 'individual');

const dev3 = registrarDevolucion(c2.idContrato, '2026-08-06', [
  { id_detalle: kitLine2.id, estado_devolucion: 'perdido', costo_perdida: 1200 },
], {});
assert(dev3.completado === true, 'kit perdido: contrato completado');
assert(dev3.totalDanos === 1200, 'costo perdida kit sumado a totalDanos');
const cs2b = getContratos({}).find(c => c.id === c2.idContrato);
const kitLine2b = cs2b.items.find(i => i.tipo_item === 'kit');
assert(kitLine2b.estado_devolucion === 'perdido', 'kit línea = perdido');
assert(kitLine2b.costo_perdida === 1200, 'costo_perdida en línea kit');
assert(cs2b.total_perdidas === 1200, 'total_perdidas del contrato incluye kit');
const indLine2b = cs2b.items.find(i => i.tipo_item === 'individual');
assert(indLine2b.estado_devolucion === 'perdido', 'componente individual marcado perdido');
const grLine2b = cs2b.items.find(i => i.tipo_item === 'granel');
assert(grLine2b.granel_dev_perdida === 2, 'componente granel perdido registrado en DEVOLUCION_GRANEL');
const tuboPerd = db.prepare('SELECT cantidad_perdida FROM ITEM_GRANEL WHERE id = ?').get(idGranel);
assert(tuboPerd.cantidad_perdida === 2, 'stock granel movido a perdida');

// --- 6a. Revertir componente granel del kit perdido ---
const dgRow = db.prepare('SELECT id FROM DEVOLUCION_GRANEL WHERE id_contrato = ? AND id_detalle = ? LIMIT 1').get(c2.idContrato, grLine2.id);
assert(dgRow, 'existe fila DEVOLUCION_GRANEL del componente granel');
revertirDevolucionGranel(dgRow.id);
const cs2c = getContratos({}).find(c => c.id === c2.idContrato);
const kitLine2c = cs2c.items.find(i => i.tipo_item === 'kit');
assert(kitLine2c.estado_devolucion === 'perdido', 'kit explícitamente perdido se mantiene perdido');
assert(cs2c.estado === 'devolución incompleta', 'contrato vuelve a devolución incompleta (granel pendiente)');

// --- 6b. Revertir devolución individual de un kit devuelto 'bien' (contrato 1) ---
revertirDevolucionItem(compInd.id);
const cs1d = getContratos({}).find(c => c.id === c1.idContrato);
const kitLineD = cs1d.items.find(i => i.tipo_item === 'kit');
assert(kitLineD.estado_devolucion === 'pendiente', 'kit vuelve a pendiente al revertir componente individual');
assert(kitLineD.fecha_devolucion_real == null, 'kit sin fecha tras revertir');
assert(cs1d.estado === 'devolución incompleta', 'contrato 1 vuelve a devolución incompleta');
const taladroRev = db.prepare("SELECT estado FROM HERRAMIENTA WHERE id = 'MAT-9001'").get();
assert(taladroRev.estado === 'alquilado', 'herramienta componente vuelve a alquilado al revertir');

// --- 7. editarKit + desactivarKit ---
editarKit(kit1.id, {
  nombre: 'Kit Taladro Pro',
  descripcion: 'editado',
  precio_dia: 45,
  componentes: [
    { tipo_item: 'individual', id_herramienta: 'MAT-9001', cantidad: 1 },
  ],
});
const kitEdit = getKitById(kit1.id);
assert(kitEdit.nombre === 'Kit Taladro Pro' && kitEdit.componentes.length === 1, 'editarKit actualiza nombre y componentes');
desactivarKit(kit1.id);
assert(getKits().length === 0, 'desactivarKit oculta el kit');

console.log('\nTODOS LOS TESTS DE KITS PASARON');
process.exit(process.exitCode || 0);
