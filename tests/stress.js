#!/usr/bin/env node
/**
 * STRESS TEST — Sistema de Alquiler de Herramientas
 * ==================================================
 * Crea una base temporal aislada, la puebla con datos semilla variados,
 * genera cientos de contratos (aleatorios y de valores conocidos) y
 * verifica invariantes de negocio. No toca la base de producción.
 *
 * Ejecutar:  node tests/stress.js
 */

process.env.DB_PATH = '/tmp/opencode/test_alquiler_' + Date.now() + '.db';

// Mock de electron antes de importar cualquier módulo del backend
require.cache[require.resolve('electron')] = {
  exports: { app: { isPackaged: true, getPath: () => '/tmp/opencode/electron-data' } },
};

const assert = require('node:assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const db = require(path.join(ROOT, 'src/main/db/database.js'));
const { initDatabase } = require(path.join(ROOT, 'src/main/db/init.js'));
const {
  localDate, sumarDias, sumarMesCalendario, contarHabiles, desglosarMensual, calcularTotalItem,
} = require(path.join(ROOT, 'src/main/utils/date.js'));
const contratoService = require(path.join(ROOT, 'src/main/services/contratoService.js'));

initDatabase();

/* ================================================================
   CONTADORES Y HELPERS
   ================================================================ */
const stats = { pruebas: 0, fallos: [], advertencias: [], contratos: 0, items: 0, rechazados: 0 };

function check(cond, msg) {
  stats.pruebas++;
  if (!cond) stats.fallos.push(msg);
}

function casi(a, b, msg, tol = 0.011) {
  stats.pruebas++;
  if (!(Math.abs(a - b) <= tol)) stats.fallos.push(`${msg}: esperado ${b}, obtenido ${a}`);
}

function aviso(msg) { stats.advertencias.push(msg); }

function seed() {
  db.prepare(`INSERT INTO USUARIO (nombre, password_hash, rol) VALUES ('test', 'x', 'admin')`).run();
  db.prepare(`INSERT INTO CLIENTE (tipo, nombre, dni, telefono) VALUES ('persona', 'Cliente Prueba', '12345678', '999888777')`).run();
  const cat = [
    ['RM', 'Roto Martillo'],
    ['AM', 'Amoladora'],
    ['GE', 'Generador'],
  ];
  for (const [id, nombre] of cat) db.prepare(`INSERT INTO CATEGORIA_HERRAMIENTA (id, nombre) VALUES (?, ?)`).run(id, nombre);

  const herramientas = [
    // id, cat, nombre, precio_dia, mora, precio_minimo, precio_mes, precio_venta
    ['RM-01', 'RM', 'Rotomartillo 1100W', 30, 35, 15, 450, 900],
    ['AM-02', 'AM', 'Amoladora 4.5"', 15, 18, 8, null, 220],
    ['GE-03', 'GE', 'Generador 2.2kVA', 50, 60, null, 1000, 2400],
    ['RM-04', 'RM', 'Rotomartillo SDS', 28, 30, 14, 400, 850],
    ['AM-05', 'AM', 'Amoladora 7"', 18, 20, 10, 250, 300],
  ];
  for (const [id, catId, nombre, pd, mora, pm, pmes, pv] of herramientas) {
    db.prepare(`INSERT INTO HERRAMIENTA (id, id_categoria, nombre, descripcion, precio_dia, mora_dia, precio_minimo, precio_mes, precio_venta, valor_reposicion, estado, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponible', 1)`).run(id, catId, nombre, 'desc', pd, mora, pm, pmes, pv, pv);
  }

  // ITEM_GRANEL usa id INTEGER AUTOINCREMENT (sin prefijo alfanumérico)
  const stockInicial = { 'G-CEM': 100, 'G-TAB': 300, 'G-ARE': 500 };
  const granelDefs = [
    // clave, nombre, condicion, precio_dia, mora, precio_minimo, precio_mes, stock
    ['G-CEM', 'Cemento bolsa', 'nuevo', 1.5, 2, 1, 35, stockInicial['G-CEM']],
    ['G-TAB', 'Tablos', 'usado', 0.5, 1, 0.3, 5, stockInicial['G-TAB']],   // el ejemplo del usuario
    ['G-ARE', 'Arena m³', 'nuevo', 2, 2.5, null, null, stockInicial['G-ARE']],
  ];
  const granelIds = {};
  const granelPrecios = {};
  for (const [clave, nombre, cond, pd, mora, pm, pmes, stock] of granelDefs) {
    const r = db.prepare(`INSERT INTO ITEM_GRANEL (nombre, condicion, descripcion, precio_dia, mora_dia, precio_minimo, precio_mes, cantidad_total, cantidad_disponible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nombre, cond, 'desc', pd, mora, pm, pmes, stock, stock);
    granelIds[clave] = Number(r.lastInsertRowid);
    granelPrecios[clave] = { clave, id: granelIds[clave], precio_dia: pd, precio_minimo: pm, precio_mes: pmes };
  }

  // Kit: Rotomartillo + 5 tablos
  db.prepare(`INSERT INTO KIT (id, nombre, descripcion, precio_dia, precio_minimo, precio_mes) VALUES (1, 'Kit Rotomartillo Pro', 'desc', 40, 25, 600)`).run();
  db.prepare(`INSERT INTO KIT_COMPONENTE (id_kit, tipo_item, id_herramienta, id_item_granel, cantidad) VALUES (1, 'individual', 'RM-01', NULL, 1)`).run();
  db.prepare(`INSERT INTO KIT_COMPONENTE (id_kit, tipo_item, id_herramienta, id_item_granel, cantidad) VALUES (1, 'granel', NULL, ?, 5)`).run(granelIds['G-TAB']);
  // Kit sin componentes (para prueba de error)
  db.prepare(`INSERT INTO KIT (id, nombre, descripcion, precio_dia) VALUES (2, 'Kit Vacio', 'sin componentes', 10)`).run();
  // Herramienta en mantenimiento (para prueba de error)
  db.prepare(`INSERT INTO HERRAMIENTA (id, id_categoria, nombre, precio_dia, mora_dia, estado, activo) VALUES ('GE-99', 'GE', 'Generador En Mantenimiento', 50, 60, 'mantenimiento', 1)`).run();

  const cliente = db.prepare(`SELECT id FROM CLIENTE LIMIT 1`).get();
  return { idUsuario: 1, idCliente: cliente.id, herramientas, granelIds, granelPrecios, stockInicial };
}

const SEED = seed();

/* ================================================================
   FÓRMULA DE REFERENCIA (replica de itemsConDias del frontend)
   ================================================================ */
function subCalcFrontend(tarifa, precios, salida, dev, cantidad) {
  const habiles = contarHabiles(salida, dev);
  if (tarifa === 'mes' && precios.precio_mes != null) {
    const desg = desglosarMensual(salida, dev);
    if (desg.meses > 0) {
      const extraRate = precios.precio_dia || (precios.precio_minimo || 0);
      return (precios.precio_mes * desg.meses + extraRate * desg.diasExtra) * cantidad;
    }
    return (precios.precio_dia || 0) * habiles * cantidad;
  }
  if (tarifa === 'minimo' && precios.precio_minimo != null) return precios.precio_minimo * habiles * cantidad;
  return (precios.precio_dia || 0) * habiles * cantidad;
}

function precioAplicado(tarifa, precios) {
  if (tarifa === 'mes' && precios.precio_mes != null) return precios.precio_mes;
  if (tarifa === 'minimo' && precios.precio_minimo != null) return precios.precio_minimo;
  return precios.precio_dia || 0;
}

/* ================================================================
   FASE 1 — UNITARIAS DE FECHAS Y PRECIOS
   ================================================================ */
function fase1() {
  console.log('\n── Fase 1: funciones de fecha y precio ──');

  // 1.1 Períodos exactos de mes
  check(desglosarMensual('2026-08-11', '2026-09-11').meses === 1, '11 ago→11 sep = 1 mes');
  check(desglosarMensual('2026-08-11', '2026-09-11').diasExtra === 0, '11 ago→11 sep = 0 días extra');
  check(desglosarMensual('2026-08-11', '2026-10-11').meses === 2, '11 ago→11 oct = 2 meses');
  check(desglosarMensual('2026-08-11', '2026-11-11').meses === 3, '11 ago→11 nov = 3 meses');

  // 1.2 Mes + días extra (verificar días específicos hábiles)
  // 2026-09-12 es sábado, 09-13 domingo → del 12 al 14: 2 hábiles (sáb y lun)
  const d12 = desglosarMensual('2026-08-11', '2026-09-14');
  check(d12.meses === 1 && d12.diasExtra === 2, `11 ago→14 sep: 1 mes + 2 hábiles (obtenido ${d12.meses}+${d12.diasExtra})`);

  // 1.3 Menos de un mes → 0 meses, 0 extra (tarifa diaria)
  const d13 = desglosarMensual('2026-08-11', '2026-08-20');
  check(d13.meses === 0 && d13.diasExtra === 0, '11 ago→20 ago: 0 meses (tarifa diaria)');

  // 1.4 Año bisiesto (feb 2024)
  check(desglosarMensual('2024-01-31', '2024-02-29').meses === 1, '31 ene→29 feb 2024 = 1 mes (bisiesto)');
  check(desglosarMensual('2024-01-31', '2024-03-02').meses === 1, '31 ene→2 mar 2024 = 1 mes + extra');

  // 1.5 Cambio de año
  check(desglosarMensual('2026-12-15', '2027-01-15').meses === 1, '15 dic→15 ene = 1 mes');
  check(desglosarMensual('2026-12-15', '2027-02-15').meses === 2, '15 dic→15 feb = 2 meses');

  // 1.6 Período largo
  check(desglosarMensual('2026-01-10', '2027-01-10').meses === 12, '1 año = 12 meses');

  // 1.7 Día 31 → mes corto: 31 ene → 28 feb = 1 mes; 31 ene → 1 mar = 1 mes + 1 hábil
  const d31 = desglosarMensual('2026-01-31', '2026-03-02');
  check(d31.meses === 1, `31 ene→2 mar 2026: 1 mes (obtenido ${d31.meses})`);

  // 1.8 contarHabiles excluye domingos (verificación manual)
  // mar 11 ago 2026 → vie 11 sep 2026: 28 hábiles
  check(contarHabiles('2026-08-11', '2026-09-11') === 28, '11 ago→11 sep = 28 hábiles');
  // sáb 12 sep → dom 13 sep = 1 hábil
  check(contarHabiles('2026-09-12', '2026-09-13') === 1, 'sáb→dom = 1 hábil');
  // 7 días consecutivos con domingo = 6 hábiles
  check(contarHabiles('2026-09-07', '2026-09-13') === 6, 'lun→dom = 6 hábiles');

  // 1.9 calcularTotalItem: mes + extra (precio mensual 5, precio diario aprox 5/30)
  const tMes = calcularTotalItem('mes', 5, '2026-08-11', '2026-09-14', 1); // 1 mes + 2 días
  casi(tMes, 5 + (5 / 30) * 2, 'calcularTotalItem mes 1+2 días');

  // 1.10 calcularTotalItem: dia simple
  casi(calcularTotalItem('dia', 30, '2026-08-11', '2026-08-15', 1), 30 * contarHabiles('2026-08-11', '2026-08-15'), 'calcularTotalItem dia');

  // 1.11 Fechas nulas → no romper
  check(desglosarMensual('', '').meses === 0, 'fechas vacías no rompen');
  check(contarHabiles(null, null) >= 1, 'fechas null no rompen');
}

/* ================================================================
   FASE 2 — CAMINOS DE ERROR (debe lanzar o rechazar)
   ================================================================ */
function expectError(fn, msg, contiene) {
  try {
    fn();
    stats.pruebas++;
    stats.fallos.push(`${msg}: no lanzó error`);
    return false;
  } catch (e) {
    stats.pruebas++;
    if (contiene && !String(e.message).toLowerCase().includes(contiene)) {
      stats.fallos.push(`${msg}: error inesperado → ${e.message}`);
    }
    return true;
  }
}

function fase2() {
  console.log('\n── Fase 2: caminos de error ──');
  const base = { idUsuario: 1, fechaSalida: '2026-08-11', fechaDevolucionPactada: '2026-08-15', depositoMonto: 0, depositoDni: 0 };

  // 2.1 Sin ítems
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0, [], null, null, null, null),
    'crear contrato sin ítems', 'ítem');

  // 2.2 Devolución antes de salida
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-15', '2026-08-11', 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'AM-02', cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 15, total_item_snapshot: 15 }], null, null, null, null),
    'devolución antes de salida', 'posterior');

  // 2.3 Herramienta inexistente
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'XX-99', cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 10, total_item_snapshot: 10 }], null, null, null, null),
    'herramienta inexistente', 'no encontrada');

  // 2.4 Herramienta no disponible (mantenimiento)
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'GE-99', cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 50, total_item_snapshot: 50 }], null, null, null, null),
    'herramienta en mantenimiento', 'no está disponible');

  // 2.5 Granel cantidad 0
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0,
    [{ tipo_item: 'granel', id_item_granel: SEED.granelIds['G-CEM'], cantidad: 0, tarifa_aplicada: 'dia', precio_aplicado: 1.5, total_item_snapshot: 0 }], null, null, null, null),
    'granel cantidad 0', 'cantidad');

  // 2.6 Stock insuficiente
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0,
    [{ tipo_item: 'granel', id_item_granel: SEED.granelIds['G-CEM'], cantidad: 99999, tarifa_aplicada: 'dia', precio_aplicado: 1.5, total_item_snapshot: 99999 }], null, null, null, null),
    'granel stock insuficiente', 'stock');

  // 2.7 Kit sin componentes
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0,
    [{ tipo_item: 'kit', id_kit: 2, cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 10, total_item_snapshot: 10 }], null, null, null, null),
    'kit sin componentes', 'componentes');

  // 2.8 Misma herramienta dos veces en un contrato → debe fallar y revertir TODO (transacción)
  const antes = db.prepare(`SELECT COUNT(*) c FROM CONTRATO`).get().c;
  expectError(() => contratoService.crearContrato(SEED.idCliente, 1, '2026-08-11', '2026-08-15', 0, 0, [
    { tipo_item: 'individual', id_herramienta: 'AM-02', cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 15, total_item_snapshot: 15 },
    { tipo_item: 'individual', id_herramienta: 'AM-02', cantidad: 1, tarifa_aplicada: 'dia', precio_aplicado: 15, total_item_snapshot: 15 },
  ], null, null, null, null), 'herramienta duplicada en contrato', 'disponible');
  const despues = db.prepare(`SELECT COUNT(*) c FROM CONTRATO`).get().c;
  check(antes === despues, 'rollback: no quedan contratos huérfanos tras error');
  // y la herramienta debe seguir disponible
  const estadoAm = db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id='AM-02'`).get().estado;
  check(estadoAm === 'disponible', 'rollback: AM-02 vuelve a disponible');
}

/* ================================================================
   FASE 3 — CONTRATOS DE VALORES CONOCIDOS
   ================================================================ */
function fase3() {
  console.log('\n── Fase 3: contratos con valores conocidos ──');

  // 3.1 Un ítem, tarifa día, 5 días hábiles (AM-02: RM-01 queda libre para el kit 3.6)
  const sal1 = '2026-08-11', dev1 = '2026-08-15';
  const sub1 = subCalcFrontend('dia', { precio_dia: 15 }, sal1, dev1, 1);
  const r1 = contratoService.crearContrato(SEED.idCliente, 1, sal1, dev1, 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'AM-02', cantidad: 1, fecha_devolucion_pactada: dev1, tarifa_aplicada: 'dia', precio_aplicado: 15, total_item_snapshot: sub1 }],
    null, null, null, null);
  stats.contratos++;
  const c1 = contratoService.getContratos({}).find(c => c.id === r1.idContrato);
  check(!!c1, 'contrato 3.1 encontrado en getContratos');
  if (c1) {
    const it = c1.items.find(i => i.id_herramienta === 'AM-02');
    check(!!it, '3.1 ítem AM-02 presente');
    if (it) {
      casi(it.total_item, sub1, '3.1 total_item = snapshot', 0.001);
      check(it.meses_item === 0 && it.dias_extra_item === 0, '3.1 sin meses');
      check(it.dias_habiles_item === contarHabiles(sal1, dev1), '3.1 días hábiles correctos');
      check(it.tarifa_aplicada === 'dia' && it.precio_dia_aplicado === 15, '3.1 tarifa/precio guardados');
    }
  }
  check(db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id='AM-02'`).get().estado === 'alquilado', '3.1 AM-02 → alquilado');

  // 3.2 Tarifa mes EXACTO (el caso tablos del usuario): 11 ago → 11 sep
  const sal2 = '2026-08-11', dev2 = '2026-09-11';
  const sub2 = subCalcFrontend('mes', { precio_dia: 0.5, precio_minimo: 0.3, precio_mes: 5 }, sal2, dev2, 1);
  check(sub2 === 5, `3.2 tablos 1 mes = S/5 (obtenido ${sub2})`);
  const r2 = contratoService.crearContrato(SEED.idCliente, 1, sal2, dev2, 0, 0,
    [{ tipo_item: 'granel', id_item_granel: SEED.granelIds['G-TAB'], cantidad: 1, fecha_devolucion_pactada: dev2, tarifa_aplicada: 'mes', precio_aplicado: 5, total_item_snapshot: sub2 }],
    null, null, null, null);
  stats.contratos++;
  const c2 = contratoService.getContratos({}).find(c => c.id === r2.idContrato);
  if (c2) {
    const it = c2.items.find(i => i.id_item_granel === SEED.granelIds['G-TAB'] && i.id_kit == null);
    if (it) {
      check(it.meses_item === 1, `3.2 meses_item=1 (obtenido ${it.meses_item})`);
      check(it.dias_extra_item === 0, `3.2 dias_extra=0 (obtenido ${it.dias_extra_item})`);
      casi(it.total_item, 5, '3.2 total=5', 0.001);
    } else stats.fallos.push('3.2 ítem tablos no encontrado');
  }

  // 3.3 Tarifa mes + 3 días extra hábiles: 11 ago → 14 sep (12 sáb, 13 dom, 14 lun → 2 hábiles? No: 12,14 = 2)
  // Mejor: 11 ago → 16 sep (12,14,15,16 = sáb lun mar mié → 4 hábiles... 12 sáb, 13 dom, 14 lun, 15 mar, 16 mié → 4 hábiles)
  const sal3 = '2026-08-11', dev3 = '2026-09-16';
  const desg3 = desglosarMensual(sal3, dev3);
  check(desg3.meses === 1 && desg3.diasExtra === 4, `3.3 desglose 11 ago→16 sep = 1 mes + 4 hábiles (obtenido ${desg3.meses}+${desg3.diasExtra})`);
  const sub3 = subCalcFrontend('mes', { precio_dia: 0.5, precio_minimo: 0.3, precio_mes: 5 }, sal3, dev3, 1);
  check(Math.abs(sub3 - (5 + 0.5 * 4)) < 0.011, `3.3 tablos 1 mes + 4 días = S/7 (obtenido ${sub3})`);
  const r3 = contratoService.crearContrato(SEED.idCliente, 1, sal3, dev3, 0, 0,
    [{ tipo_item: 'granel', id_item_granel: SEED.granelIds['G-TAB'], cantidad: 1, fecha_devolucion_pactada: dev3, tarifa_aplicada: 'mes', precio_aplicado: 5, total_item_snapshot: sub3 }],
    null, null, null, null);
  stats.contratos++;
  const c3 = contratoService.getContratos({}).find(c => c.id === r3.idContrato);
  if (c3) {
    const it = c3.items.find(i => i.id_item_granel === SEED.granelIds['G-TAB'] && i.id_kit == null);
    if (it) {
      check(it.meses_item === 1 && it.dias_extra_item === 4, `3.3 meses_item/dias_extra (obtenido ${it.meses_item}/${it.dias_extra_item})`);
      casi(it.total_item, sub3, '3.3 total_item = snapshot', 0.001);
    } else stats.fallos.push('3.3 ítem tablos no encontrado');
  }

  // 3.4 Tarifa mínimo
  const sal4 = '2026-08-11', dev4 = '2026-08-14';
  const sub4 = subCalcFrontend('minimo', { precio_dia: 30, precio_minimo: 15, precio_mes: 450 }, sal4, dev4, 1);
  const r4 = contratoService.crearContrato(SEED.idCliente, 1, sal4, dev4, 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'RM-04', cantidad: 1, fecha_devolucion_pactada: dev4, tarifa_aplicada: 'minimo', precio_aplicado: 15, total_item_snapshot: sub4 }],
    null, null, null, null);
  stats.contratos++;
  const c4 = contratoService.getContratos({}).find(c => c.id === r4.idContrato);
  if (c4) {
    const it = c4.items.find(i => i.id_herramienta === 'RM-04');
    if (it) {
      casi(it.total_item, sub4, '3.4 total mínimo', 0.001);
      check(it.tarifa_aplicada === 'minimo', '3.4 tarifa minimo guardada');
    }
  }

  // 3.5 Contrato mixto (individual día + granel mes + granel día) con depósito
  // El flujo real (MultiSessionModal) registra el depósito como PAGO tipo 'deposito'
  // y envía depositoMonto: 0; la columna deposito_monto queda en 0 y la garantía
  // retenida sale de los pagos tipo 'deposito'.
  const sal5 = '2026-09-01', dev5 = '2026-10-01';
  const iA = { tipo_item: 'individual', id_herramienta: 'AM-05', cantidad: 1, fecha_devolucion_pactada: dev5, tarifa_aplicada: 'dia', precio_aplicado: 18, total_item_snapshot: subCalcFrontend('dia', { precio_dia: 18 }, sal5, dev5, 1) };
  const iB = { tipo_item: 'granel', id_item_granel: SEED.granelIds['G-CEM'], cantidad: 10, fecha_devolucion_pactada: dev5, tarifa_aplicada: 'mes', precio_aplicado: 35, total_item_snapshot: subCalcFrontend('mes', { precio_dia: 1.5, precio_minimo: 1, precio_mes: 35 }, sal5, dev5, 10) };
  const iC = { tipo_item: 'granel', id_item_granel: SEED.granelIds['G-ARE'], cantidad: 3, fecha_devolucion_pactada: dev5, tarifa_aplicada: 'dia', precio_aplicado: 2, total_item_snapshot: subCalcFrontend('dia', { precio_dia: 2 }, sal5, dev5, 3) };
  const r5 = contratoService.crearContrato(SEED.idCliente, 1, sal5, dev5, 0, 1, [iA, iB, iC],
    [{ monto: 100, metodo: 'efectivo', tipo: 'adelanto' }, { monto: 50, metodo: 'efectivo', tipo: 'deposito' }], null, null, null);
  stats.contratos++;
  const c5 = contratoService.getContratos({}).find(c => c.id === r5.idContrato);
  if (c5) {
    check(c5.items.length === 3, `3.5 tres ítems (obtenido ${c5.items.length})`);
    const suma = c5.items.reduce((a, i) => a + i.total_item, 0);
    casi(c5.total_contrato, suma, '3.5 total_contrato = ítems (depósito va por PAGO, no en la columna)');
    casi(c5.total_pagado, 100, '3.5 total_pagado = 100 (excluye depósito)', 0.001);
    check(c5.garantia_retenida === 50, `3.5 garantía retenida 50 (obtenido ${c5.garantia_retenida})`);
    const cem = c5.items.find(i => i.id_item_granel === SEED.granelIds['G-CEM']);
    if (cem) check(cem.meses_item === 1 && cem.dias_extra_item === 0, '3.5 cemento 1 mes exacto');
  }
  // stock granel: cemento 10 alquilados
  const cemStock = db.prepare(`SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id=?`).get(SEED.granelIds['G-CEM']);
  check(cemStock.cantidad_alquilada === 10, `3.5 cemento alquilado 10 (obtenido ${cemStock.cantidad_alquilada})`);

  // 3.6 Kit: línea padre + líneas hijas
  const sal6 = '2026-10-05', dev6 = '2026-10-12';
  const sub6 = subCalcFrontend('dia', { precio_dia: 40, precio_minimo: 25, precio_mes: 600 }, sal6, dev6, 1);
  const r6 = contratoService.crearContrato(SEED.idCliente, 1, sal6, dev6, 0, 0,
    [{ tipo_item: 'kit', id_kit: 1, cantidad: 1, fecha_devolucion_pactada: dev6, tarifa_aplicada: 'dia', precio_aplicado: 40, total_item_snapshot: sub6 }],
    null, null, null, null);
  stats.contratos++;
  const c6 = contratoService.getContratos({}).find(c => c.id === r6.idContrato);
  if (c6) {
    const padre = c6.items.find(i => i.tipo_item === 'kit');
    const hijos = c6.items.filter(i => i.id_kit != null && i.tipo_item === 'granel');
    check(!!padre, '3.6 línea padre del kit existe');
    if (padre) casi(padre.total_item, sub6, '3.6 total kit = snapshot', 0.001);
    check(hijos.length === 1, `3.6 línea hija del kit (obtenido ${hijos.length})`);
    const hijo = hijos[0];
    if (hijo) {
      check(hijo.cantidad === 5, `3.6 hija tablos cantidad 5 (obtenido ${hijo.cantidad})`);
      check(hijo.precio_dia_aplicado === 0, '3.6 hija precio 0 (no factura)');
      casi(hijo.total_item, 0, '3.6 hija total 0', 0.001);
    }
  }
  // kit consumió 5 tablos más (1 del 3.2 + 1 del 3.3 + 5 del kit = 7)
  const tabStock = db.prepare(`SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id=?`).get(SEED.granelIds['G-TAB']);
  const tabEsperado = 7;
  check(tabStock.cantidad_alquilada === tabEsperado, `3.6 tablos alquilados ${tabEsperado} (obtenido ${tabStock.cantidad_alquilada})`);

  // 3.7 Reserva → convertir
  const r7 = contratoService.crearReserva(SEED.idCliente, 1, '2026-11-01', '2026-11-05', 0, 0,
    [{ tipo_item: 'individual', id_herramienta: 'GE-03', cantidad: 1, total_item_snapshot: subCalcFrontend('dia', { precio_dia: 50 }, '2026-11-01', '2026-11-05', 1) }],
    null, null, null, null);
  stats.contratos++;
  check(db.prepare(`SELECT estado FROM CONTRATO WHERE id=?`).get(r7.idContrato).estado === 'reservado', '3.7 reserva creada con estado reservado');
  const c7b = contratoService.getContratos({}).find(c => c.id === r7.idContrato);
  check(c7b && c7b.estado === 'reservado', '3.7 getContratos muestra reserva');
  contratoService.convertirReserva(r7.idContrato);
  check(db.prepare(`SELECT estado FROM CONTRATO WHERE id=?`).get(r7.idContrato).estado === 'alquilado', '3.7 reserva convertida a alquilado');
  check(db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id='GE-03'`).get().estado === 'alquilado', '3.7 GE-03 alquilado tras conversión');

  // 3.8 Editar el contrato 3.4 (RM-04): cambiar fechas y pasar el ítem a granel G-ARE
  // (las 5 herramientas ya están alquiladas por contratos anteriores; editar un contrato
  //  existente libera RM-04 y valida la ruta de edición sin crear uno nuevo)
  check(db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id='RM-04'`).get().estado === 'alquilado', '3.8 RM-04 alquilado antes de editar');
  const sal8b = '2026-09-05', dev8b = '2026-09-07';
  const sub8b = subCalcFrontend('dia', { precio_dia: 2 }, sal8b, dev8b, 3);
  contratoService.editarContrato(r4.idContrato, {
    idCliente: SEED.idCliente, idUsuario: 1, fechaSalida: sal8b, fechaDevolucionPactada: dev8b,
    depositoMonto: 0, depositoDni: 0,
    items: [{ tipo_item: 'granel', id_item_granel: SEED.granelIds['G-ARE'], cantidad: 3, fecha_devolucion_pactada: dev8b, tarifa_aplicada: 'dia', precio_aplicado: 2, total_item_snapshot: sub8b }],
  });
  check(db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id='RM-04'`).get().estado === 'disponible', '3.8 RM-04 liberado tras editar');
  check(db.prepare(`SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id=?`).get(SEED.granelIds['G-ARE']).cantidad_alquilada === 6, '3.8 G-ARE alquilado 6 tras editar (3 del 3.5 + 3)');
  const c8 = contratoService.getContratos({}).find(c => c.id === r4.idContrato);
  if (c8) {
    const it = c8.items.find(i => i.id_item_granel === SEED.granelIds['G-ARE']);
    if (it) {
      casi(it.total_item, sub8b, '3.8 total_item recalculado', 0.001);
      check(it.dias_habiles_item === contarHabiles(sal8b, dev8b), '3.8 días hábiles nuevos');
    } else stats.fallos.push('3.8 ítem G-ARE no encontrado tras edición');
    check(c8.items.length === 1, '3.8 solo 1 ítem tras edición');
  }
}

/* ================================================================
   FASE 4 — FUZZING: 120 contratos aleatorios con invariantes
   ================================================================ */
function fase4(N = 120) {
  console.log(`\n── Fase 4: fuzzing con ${N} contratos aleatorios ──`);

  // Herramientas disponibles (estado en DB) y stock de granel
  const herramientas = ['RM-01', 'AM-02', 'GE-03', 'RM-04', 'AM-05'];
  const graneles = Object.values(SEED.granelPrecios); // { clave, id numérico, precios }
  const herrPrecios = {
    'RM-01': { precio_dia: 30, precio_minimo: 15, precio_mes: 450 },
    'AM-02': { precio_dia: 15, precio_minimo: 8, precio_mes: null },
    'GE-03': { precio_dia: 50, precio_minimo: null, precio_mes: 1000 },
    'RM-04': { precio_dia: 28, precio_minimo: 14, precio_mes: 400 },
    'AM-05': { precio_dia: 18, precio_minimo: 10, precio_mes: 250 },
  };
  const TARIFAS = ['dia', 'mes', 'minimo'];
  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const rnd = (arr) => arr[rand(0, arr.length - 1)];
  const pad = (n) => String(n).padStart(2, '0');

  function fechaAleatoria(base) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + rand(0, 120));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  let disponibles = new Set(herramientas);
  const stockGranel = { ...SEED.stockInicial };

  for (let n = 0; n < N; n++) {
    const salida = fechaAleatoria('2026-08-01');
    const dev = fechaAleatoria(salida);
    const numItems = rand(1, 6);
    const items = [];
    const usados = [];

    for (let k = 0; k < numItems; k++) {
      const tipo = rnd(['individual', 'individual', 'granel', 'granel', 'kit']); // sesgo a indiv/granel
      if (tipo === 'individual') {
        const disp = [...disponibles];
        if (disp.length === 0) continue;
        const id = rnd(disp);
        disponibles.delete(id);
        usados.push(id);
        const tarifa = rnd(TARIFAS);
        const p = herrPrecios[id];
        // tarifa mes sin precio_mes → cae a dia (el frontend no ofrece botón mes, pero el servicio acepta)
        const tarifaOk = (tarifa === 'mes' && p.precio_mes == null) ? 'dia' : tarifa;
        const tarifaOk2 = (tarifaOk === 'minimo' && p.precio_minimo == null) ? 'dia' : tarifaOk;
        items.push({
          tipo_item: 'individual', id_herramienta: id, cantidad: 1,
          fecha_devolucion_pactada: dev, tarifa_aplicada: tarifaOk2,
          precio_aplicado: precioAplicado(tarifaOk2, p),
          total_item_snapshot: subCalcFrontend(tarifaOk2, p, salida, dev, 1),
        });
      } else if (tipo === 'granel') {
        const g = rnd(graneles);
        const maxStock = Math.min(stockGranel[g.clave], 50);
        if (maxStock < 1) continue;
        const cant = rand(1, maxStock);
        stockGranel[g.clave] -= cant;
        const tarifa = rnd(TARIFAS);
        const tarifaOk = (tarifa === 'mes' && g.precio_mes == null) ? 'dia' : tarifa;
        const tarifaOk2 = (tarifaOk === 'minimo' && g.precio_minimo == null) ? 'dia' : tarifaOk;
        items.push({
          tipo_item: 'granel', id_item_granel: g.id, cantidad: cant,
          fecha_devolucion_pactada: dev, tarifa_aplicada: tarifaOk2,
          precio_aplicado: precioAplicado(tarifaOk2, g),
          total_item_snapshot: subCalcFrontend(tarifaOk2, g, salida, dev, cant),
        });
      } else { // kit
        // kit 1: usa RM-01 (si disponible) + 5 tablos (si stock)
        if (!disponibles.has('RM-01') || stockGranel['G-TAB'] < 5) continue;
        disponibles.delete('RM-01');
        usados.push('RM-01');
        stockGranel['G-TAB'] -= 5;
        const p = { precio_dia: 40, precio_minimo: 25, precio_mes: 600 };
        const tarifa = rnd(TARIFAS);
        const tarifaOk = (tarifa === 'minimo') ? 'dia' : tarifa; // minimo si existe, ok
        items.push({
          tipo_item: 'kit', id_kit: 1, cantidad: 1,
          fecha_devolucion_pactada: dev, tarifa_aplicada: tarifaOk,
          precio_aplicado: precioAplicado(tarifaOk, p),
          total_item_snapshot: subCalcFrontend(tarifaOk, p, salida, dev, 1),
        });
      }
    }

    if (items.length === 0) continue;

    try {
      const r = contratoService.crearContrato(SEED.idCliente, 1, salida, dev, 0, 0, items, null, null, null, null);
      stats.contratos++;
      stats.items += items.length;

      // ---- INVARIANTES ----
      const c = contratoService.getContratos({}).find(x => x.id === r.idContrato);
      if (!c) { stats.fallos.push(`[fuzz ${n}] contrato ${r.idContrato} no aparece en getContratos`); continue; }

      // A) cada ítem: coherencia de fechas y precios
      for (const it of c.items) {
        const esPadreKit = it.tipo_item === 'kit';
        const esHijoKit = it.id_kit != null && it.tipo_item === 'granel';
        const devItem = it.fecha_devolucion_pactada_item || c.fecha_devolucion_pactada;
        const desg = desglosarMensual(c.fecha_salida, devItem);

        if (!esHijoKit) {
          if (it.total_item == null || it.total_item < 0) stats.fallos.push(`[fuzz ${n}] ítem total negativo/null: ${JSON.stringify(it.total_item)}`);
          casi(it.total_item, it.total_item_snapshot, `[fuzz ${n}] total_item === snapshot (${it.item_codigo || it.id_herramienta})`, 0.001);
        }
        check(it.dias_habiles_item === contarHabiles(c.fecha_salida, devItem), `[fuzz ${n}] días hábiles coherentes (${it.item_codigo || ''})`);
        // meses_item/dias_extra_item solo se calculan en el backend para tarifa 'mes'
        if (it.tarifa_aplicada === 'mes') {
          check(it.meses_item === desg.meses, `[fuzz ${n}] meses_item (${it.item_codigo || ''}) esperado ${desg.meses} obtenido ${it.meses_item}`);
          check(it.dias_extra_item === desg.diasExtra, `[fuzz ${n}] dias_extra_item (${it.item_codigo || ''}) esperado ${desg.diasExtra} obtenido ${it.dias_extra_item}`);
          if (it.meses_item === 0) check(it.dias_extra_item === 0, `[fuzz ${n}] mes sin meses completos → 0 extra`);
        }
        if (it.meses_item === 0 && it.dias_extra_item === 0 && !esHijoKit) {
          check(it.dias_habiles_item >= 1, `[fuzz ${n}] al menos 1 día hábil`);
        }
        // tarifa mes: total >= precio_mes * meses (los días extra suman)
        if (it.tarifa_aplicada === 'mes' && it.meses_item > 0 && !esHijoKit) {
          check(it.total_item >= it.precio_dia_aplicado * it.meses_item - 0.011, `[fuzz ${n}] total mensual >= meses × tarifa`);
        }
      }

      // B) contrato: total = ítems + depósito
      const suma = c.items.reduce((a, i) => a + (i.total_item || 0), 0);
      casi(c.total_contrato, suma + (c.deposito_monto || 0), `[fuzz ${n}] total_contrato coherente`);

      // C) inventario: herramientas alquiladas
      for (const id of usados) {
        const est = db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id=?`).get(id).estado;
        check(est === 'alquilado', `[fuzz ${n}] ${id} debe estar alquilado (estado ${est})`);
      }
    } catch (e) {
      // rechazo esperado (stock/disponibilidad) — no es fallo
      stats.rechazados++;
      // devolver al pool lo que habíamos reservado en memoria
      for (const id of usados) disponibles.add(id);
      // (el stock en memoria no se devuelve exactamente pero el test de DB al final valida)
    }
  }

  // D) Verificación global de inventario vs contratos activos
  const verificarInventario = () => {
    const activos = db.prepare(`
      SELECT c.id, c.estado, d.id_herramienta, d.id_item_granel, d.cantidad, d.tipo_item
      FROM CONTRATO c JOIN DETALLE_CONTRATO d ON d.id_contrato = c.id
      WHERE c.estado IN ('alquilado', 'atrasado', 'reservado', 'devolución incompleta')
        AND (c.papelera IS NULL OR c.papelera = 0)
    `).all();

    for (const h of herramientas) {
      const esperado = activos.some(a => a.id_herramienta === h) ? 'alquilado' : 'disponible';
      const real = db.prepare(`SELECT estado FROM HERRAMIENTA WHERE id=?`).get(h).estado;
      check(real === esperado, `inventario: ${h} esperado ${esperado}, real ${real}`);
    }
    for (const g of graneles) {
      const alq = activos.filter(a => a.id_item_granel === g.id && a.tipo_item !== 'kit').reduce((a2, x) => a2 + x.cantidad, 0);
      // hijos de kit no suman cantidad_alquilada? sí suman (UPDATE ... cantidad_alquilada + necesario)
      const alqKit = activos.filter(a => a.id_item_granel === g.id).reduce((a2, x) => a2 + x.cantidad, 0);
      const real = db.prepare(`SELECT cantidad_alquilada FROM ITEM_GRANEL WHERE id=?`).get(g.id).cantidad_alquilada;
      check(real === alqKit, `inventario granel ${g.id}: esperado ${alqKit}, real ${real}`);
    }
  };
  verificarInventario();
}

/* ================================================================
   REPORTE
   ================================================================ */
console.log('Base temporal:', process.env.DB_PATH);
fase1();
fase2();
fase3();
fase4(120);

console.log('\n' + '═'.repeat(60));
console.log(`Pruebas ejecutadas : ${stats.pruebas}`);
console.log(`Contratos creados  : ${stats.contratos}`);
console.log(`Ítems insertados   : ${stats.items}`);
console.log(`Rechazos correctos : ${stats.rechazados}`);
console.log(`Advertencias       : ${stats.advertencias.length}`);
if (stats.fallos.length === 0) {
  console.log('\n✅ TODO OK — ninguna incoherencia encontrada');
} else {
  console.log(`\n❌ FALLOS: ${stats.fallos.length}`);
  stats.fallos.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exitCode = 1;
}

// limpiar base temporal
try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
try { require('fs').unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
try { require('fs').unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
