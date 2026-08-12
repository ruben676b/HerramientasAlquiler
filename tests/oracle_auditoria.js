#!/usr/bin/env node
/**
 * ORÁCULO DE AUDITORÍA — Sistema de Alquiler de Herramientas
 * ===========================================================
 * Prueba diferencial de fases 5-7 (devoluciones, ediciones, pagos, reversiones).
 * Ejecuta escenarios de negocio contra el sistema real y contrasta lo que el
 * SISTEMA muestra contra lo que el ORÁCULO (reglas de negocio correctas) espera.
 *
 * Reglas del oráculo (CLAUDE.md §2.3):
 *   - mora_por_item = dias_atraso * mora_dia_aplicada * cantidad   (el sistema usa precio_dia → BUG)
 *   - referencia de atraso: fecha_devolucion_real si existe; hoy si no.
 *     (para granel el sistema nunca setea esa fecha → muestra mora con 'hoy' → BUG de visualización)
 *   - granel pendiente se evalúa POR LÍNEA (id_detalle)            (el sistema agrupa por id_item_granel → BUG)
 *   - saldo_item = max(0, total_item + mora - pagado_item)
 *
 * Salidas (CSV UTF-8, abren directo en Excel):
 *   tests/oracle_bitacora_<ts>.csv   — una fila por acción (nivel contrato)
 *   tests/oracle_items_<ts>.csv      — una fila por ítem por acción (finanzas detalladas)
 *
 * Ejecutar:  node tests/oracle_auditoria.js
 *   - Por defecto: usa /tmp/opencode/oracle_*.db (no toca producción)
 *   - ORACULO_REAL_DB=1: escribe en la BD real (alquiler_herramientas.db),
 *     con backup automático previo en alquiler_herramientas.db.oracle_backup.
 *
 * IMPORTANTE (ABI de better-sqlite3):
 *   El oráculo corre con Node (ABI 147); la app corre con Electron (ABI 130).
 *   Un solo binario nativo sirve para uno u otro. Antes de correr el oráculo:
 *     (cd node_modules/better-sqlite3 && npx node-gyp rebuild --release)
 *   Y antes de volver a la app:
 *     npx electron-rebuild -f -w better-sqlite3
 */

const path = require('path');
const USE_REAL_DB = process.env.ORACULO_REAL_DB === '1';
const REAL_DB_PATH = path.resolve(__dirname, '..', 'alquiler_herramientas.db');
const BACKUP_PATH = REAL_DB_PATH + '.oracle_backup';
process.env.DB_PATH = USE_REAL_DB ? REAL_DB_PATH : '/tmp/opencode/oracle_' + Date.now() + '.db';

// Mock de electron antes de importar cualquier módulo del backend
require.cache[require.resolve('electron')] = {
  exports: { app: { isPackaged: true, getPath: () => '/tmp/opencode/electron-data' } },
};

const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const db = require(path.join(ROOT, 'src/main/db/database.js'));
const { initDatabase } = require(path.join(ROOT, 'src/main/db/init.js'));
const {
  localDate, sumarDias, contarHabiles, desglosarMensual, calcularTotalItem,
} = require(path.join(ROOT, 'src/main/utils/date.js'));
const contratoService = require(path.join(ROOT, 'src/main/services/contratoService.js'));
const clienteService = require(path.join(ROOT, 'src/main/services/clienteService.js'));

initDatabase();

if (USE_REAL_DB) {
  // Backup consistente de la BD real (VACUUM INTO captura también el WAL)
  db.prepare('VACUUM INTO ?').run(BACKUP_PATH);
  console.log('[ORACULO] Backup de BD real → ' + BACKUP_PATH);
  // Limpiar todas las tablas para partir de cero (sin romper FKs)
  db.pragma('foreign_keys = OFF');
  const tablas = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all().map(r => r.name);
  db.transaction(() => {
    for (const t of tablas) db.prepare('DELETE FROM "' + t + '"').run();
  })();
  try { db.exec('DELETE FROM sqlite_sequence'); } catch (e) { /* sin autoincrement */ }
  db.pragma('foreign_keys = ON');
  console.log('[ORACULO] BD real limpiada (' + tablas.length + ' tablas). Insertando datos de prueba...');
}

const HOY = localDate(); // 2026-08-11
const MS_DIA = 86400000;
const DIAS = (a, b) => Math.ceil((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / MS_DIA);
const red = n => (n == null ? null : Math.round(n * 100) / 100);
const casi = (a, b) => a == null || b == null ? false : Math.abs(red(a) - red(b)) <= 0.011;
const f2 = n => (n == null ? '' : red(n).toFixed(2));
const csv = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* ================================================================
   SEMILLA — catálogo con precios y moras conocidos por el oráculo
   ================================================================ */
const CAT = {
  /* categorias: [id, nombre, desc, unidades, pd, mora, pmin, pmes, pventa] */
  categorias: [
    ['RTO','Rotomartillo','Martillo demoledor rotatorio',10,35,40,20,500,900],
    ['TAL','Taladro Percutor','Taladro percutor SDS',10,20,25,12,300,350],
    ['AML','Amoladora Angular','Amoladora angular 7 pulgadas',10,22,25,12,320,280],
    ['SIE','Sierra Circular','Sierra circular 7-1/4 pulgadas',10,18,20,10,260,350],
    ['SIB','Sierra de Banco','Sierra de banco 10 pulgadas',10,30,35,18,450,650],
    ['CAL','Caladora','Caladora eléctrica profesional',10,12,15,8,180,200],
    ['LIJ','Lijadora Orbital','Lijadora orbital 5 pulgadas',10,15,18,9,220,220],
    ['LJB','Lijadora de Banda','Lijadora de banda 3x21',10,18,20,10,260,280],
    ['ROZ','Rozadora','Rozadora de muros',10,25,30,15,380,550],
    ['PUL','Pulidora de Piso','Pulidora de concreto',10,35,40,20,500,850],
    ['FRE','Fresadora de Concreto','Fresadora de concreto',10,40,45,22,580,1100],
    ['ATL','Taladro Angular','Taladro magnético angular',10,25,30,15,380,550],
    ['TRO','Trompo Mezcladora','Mezcladora de concreto tipo trompo',10,55,60,30,800,2800],
    ['HOR','Hormigonera Grande','Hormigonera 9 pies cúbicos',10,70,75,40,1000,3800],
    ['COM','Compactadora','Compactadora de suelos',10,45,50,25,650,2200],
    ['API','Apisonador Manual','Apisonador tipo rana',10,30,35,18,450,900],
    ['REV','Regla Vibratoria','Regla vibratoria para concreto',10,25,30,15,380,650],
    ['VIB','Vibrador de Concreto','Vibrador para asentado',10,22,25,18,400,550],
    ['MAR','Martillo Demoledor','Martillo demoledor 40kg',10,45,50,25,650,1600],
    ['CRC','Cortadora de Cerámico','Cortadora de cerámico eléctrica',10,15,18,9,220,320],
    ['CRL','Cortadora de Ladrillos','Cortadora de ladrillos de mesa',10,20,22,12,280,450],
    ['CRV','Cortadora de Varilla','Cortadora de varilla 1 pulgada',10,18,20,10,260,380],
    ['GEN','Generador Eléctrico','Generador portátil 3kW',10,65,70,35,950,2200],
    ['GRE','Grupo Electrógeno','Grupo electrógeno 10kW',10,100,110,55,1500,5500],
    ['BOM','Bomba de Agua','Bomba centrífuga 2 pulgadas',10,25,28,15,380,450],
    ['MBO','Motobomba','Motobomba a gasolina 3 pulgadas',10,40,45,22,580,1300],
    ['HID','Hidrolavadora','Hidrolavadora 1800 PSI',10,30,35,18,450,650],
    ['CMP','Compresor de Aire','Compresor de aire 50L',10,40,45,22,580,1100],
    ['CPI','Compresor de Pintura','Compresor de pintura 25L',10,30,35,18,450,650],
    ['SOL','Soldadora Eléctrica','Soldadora 250A',10,35,40,20,500,850],
    ['SOG','Soldadora Gas','Soldadura oxiacetilénica',10,40,45,22,580,1300],
    ['CIZ','Cizalla','Cizalla de plancha',10,20,22,12,280,350],
    ['DOB','Dobladora de Hierro','Dobladora de hierro construcción',10,15,18,9,220,450],
    ['MOS','Motosoldadora','Motosoldadora a gasolina 300A',10,60,65,35,900,3200],
    ['NIL','Nivel Láser','Nivel láser rotativo',10,25,28,15,380,550],
    ['TEO','Teodolito','Teodolito digital',10,30,35,18,450,900],
    ['ETT','Estación Total','Estación total topográfica',10,80,90,50,1200,5500],
    ['ESC','Escalera','Escalera de aluminio extensible',10,22,25,18,400,350],
    ['LAM','Lámpara de Obra','Reflector LED 200W',10,10,12,6,150,90],
    ['PRO','Prolongador Eléctrico','Cable prolongador 30m',10,5,6,3,80,45],
    ['VEN','Ventilador Industrial','Ventilador extractor 20 pulgadas',10,15,18,9,220,220],
    ['ASP','Aspiradora Industrial','Aspiradora industrial 30L',10,20,22,12,280,380],
    ['PUN','Puntal de Construcción','Puntal metálico ajustable',10,3,4,2,50,18],
    ['CAR','Carretilla','Carretilla de obra 50kg',10,5,6,3,80,90],
    ['PIS','Pistola de Clavos','Clavadora neumática',10,20,22,12,280,450],
    ['PIN','Pistola de Pintura','Pistola AIRLESS',10,25,28,15,380,550],
    ['TER','Termofusionadora','Termofusionadora para PP-R',10,15,18,9,220,220],
    ['MOG','Motoguadaña','Motoguadaña desmalezadora',10,25,28,15,380,650],
    ['DOT','Doblador de Tubo','Doblador de tubo metálico',10,12,15,8,180,180],
    ['BUG','Buggy Carretón','Buggy motorizado de obra',10,50,55,30,750,2200],
  ],
  /* danos por categoria de herramientas */
  danos: {
    RTO:[['Pico dañado',20],['Martillo roto',50],['Sello roto',15],['Cable roto',10]],
    TAL:[['Mango roto',10],['Cable roto',10],['Portacarbones',8]],
    AML:[['Disco roto',5],['Guarda rota',10],['Cable roto',10],['Carbones gastados',8]],
    SIE:[['Disco roto',10],['Guarda rota',15],['Cable roto',10]],
    SIB:[['Disco roto',15],['Guía rota',20],['Cable roto',12]],
    CAL:[['Hoja rota',5],['Cable roto',10],['Base rayada',5]],
    LIJ:[['Lija gastada',2],['Cable roto',10],['Base rayada',5]],
    LJB:[['Banda rota',5],['Cable roto',10],['Rodillo dañado',8]],
    ROZ:[['Disco roto',12],['Cable roto',10],['Guarda rota',15]],
    PUL:[['Disco roto',8],['Cable roto',10],['Base dañada',20]],
    FRE:[['Disco roto',15],['Cable roto',10],['Base dañada',25]],
    ATL:[['Broca rota',8],['Cable roto',10],['Base magnética dañada',30]],
    TRO:[['Cable roto',10],['Tambor abollado',30],['Motor quemado',100],['Polea rota',15]],
    HOR:[['Cable roto',12],['Tambor abollado',50],['Motor quemado',150],['Polea rota',20]],
    COM:[['Placa vibratoria rota',40],['Manija rota',10],['Cable roto',10],['Base rota',20]],
    API:[['Resorte roto',15],['Manija rota',10],['Cable roto',10]],
    REV:[['Regla doblada',20],['Motor vibrador dañado',30],['Cable roto',10]],
    VIB:[['Pico dañado',15],['Cable roto',10],['Motor quemado',80],['Interruptor roto',5]],
    MAR:[['Cincel dañado',15],['Cable roto',12],['Aceite filtrado',10],['Mango roto',20]],
    CRC:[['Disco roto',8],['Guía rota',10],['Cable roto',8]],
    CRL:[['Disco roto',10],['Guía rota',15],['Cable roto',10]],
    CRV:[['Cuchilla rota',15],['Mango roto',10],['Cable roto',8]],
    GEN:[['Enrollador roto',15],['Tanque grietado',25],['Carbones gastados',20],['Cable roto',10]],
    GRE:[['Enrollador roto',25],['Tanque grietado',40],['Carbones gastados',30],['Cable roto',15]],
    BOM:[['Sello mecánico roto',25],['Manguera rota',15],['Cable roto',10]],
    MBO:[['Sello mecánico roto',35],['Manguera rota',20],['Motor dañado',80],['Cable roto',12]],
    HID:[['Boquilla dañada',5],['Manguera rota',15],['Pistola dañada',10],['Cable roto',10]],
    CMP:[['Manómetro roto',20],['Manguera rota',15],['Filtro tapado',10],['Válvula dañada',12]],
    CPI:[['Manómetro roto',20],['Manguera rota',15],['Filtro tapado',10],['Pistola dañada',15]],
    SOL:[['Pinza electrodo rota',10],['Cable roto',15],['Careta rota',8],['Interruptor dañado',12]],
    SOG:[['Manguera rota',20],['Manómetro roto',15],['Válvula dañada',18],['Soplete dañado',25]],
    CIZ:[['Cuchilla rota',20],['Mango roto',10],['Base dañada',12]],
    DOB:[['Rodillo dañado',15],['Mango roto',10],['Base dañada',12]],
    MOS:[['Manguera rota',15],['Cable roto',12],['Motor dañado',100],['Tanque grietado',30]],
    NIL:[['Lente rayado',15],['Trípode roto',20],['Batería dañada',10],['Interruptor roto',5]],
    TEO:[['Lente rayado',30],['Trípode roto',25],['Base nivelante dañada',40]],
    ETT:[['Lente rayado',50],['Trípode roto',30],['Base nivelante dañada',60]],
    ESC:[['Peldaño roto',10],['Pasador roto',5],['Base rota',8],['Cinta antideslizante',3]],
    LAM:[['Cable roto',8],['Reflector roto',15],['Soporte roto',5]],
    PRO:[['Cable cortado',15],['Enchufe roto',5],['Tambor dañado',10]],
    VEN:[['Aspa rota',8],['Cable roto',10],['Rejilla dañada',5]],
    ASP:[['Cable roto',10],['Filtro roto',8],['Manguera rota',10]],
    PUN:[['Rosca dañada',5],['Base rota',3],['Seguro roto',2]],
    CAR:[['Llantas dañadas',10],['Mango roto',5],['Base rota',8]],
    PIS:[['Punta dañada',8],['Manguera rota',10],['Gatillo roto',5]],
    PIN:[['Boquilla dañada',5],['Manguera rota',12],['Pistola dañada',15]],
    TER:[['Punta dañada',10],['Cable roto',8],['Interruptor roto',5]],
    MOG:[['Cuchilla dañada',10],['Tanque grietado',15],['Mango roto',8]],
    DOT:[['Rodillo dañado',10],['Mango roto',8],['Base dañada',10]],
    BUG:[['Llantas dañadas',15],['Mango roto',8],['Base rota',12]],
  },
  /* granel: [cod] = { nombre, cond, pd, mora, pmin, pmes, pventa, stock } */
  granel: {
    'G-TAB':{nombre:'Tabla 3m',cond:'nuevo',pd:1,mora:1,pmin:5,pmes:10,pventa:12,stock:500},
    'G-TAB-U':{nombre:'Tabla 3m',cond:'usado',pd:0.5,mora:0.5,pmin:3,pmes:8,pventa:8,stock:200},
    'G-PAT':{nombre:'PATAS',cond:'nuevo',pd:10,mora:8,pmin:0,pmes:15,pventa:18,stock:500},
    'G-PAT-U':{nombre:'PATAS',cond:'usado',pd:6,mora:5,pmin:0,pmes:10,pventa:12,stock:200},
    'G-PLA':{nombre:'PLATAFORMA',cond:'nuevo',pd:10,mora:8,pmin:0,pmes:15,pventa:18,stock:500},
    'G-PLA-U':{nombre:'PLATAFORMA',cond:'usado',pd:6,mora:5,pmin:0,pmes:10,pventa:12,stock:200},
    'G-CRU':{nombre:'CRUZETAS',cond:'nuevo',pd:10,mora:8,pmin:0,pmes:15,pventa:18,stock:500},
    'G-CRU-U':{nombre:'CRUZETAS',cond:'usado',pd:6,mora:5,pmin:0,pmes:10,pventa:12,stock:200},
    'G-CEM':{nombre:'Cemento 42.5kg',cond:'nuevo',pd:1.5,mora:2,pmin:1,pmes:35,pventa:28,stock:1000},
    'G-CEM-U':{nombre:'Cemento 42.5kg',cond:'usado',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:18,stock:500},
    'G-ARE':{nombre:'Arena fina',cond:'nuevo',pd:2,mora:2.5,pmin:1,pmes:40,pventa:35,stock:1000},
    'G-ARE-U':{nombre:'Arena fina',cond:'usado',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:18,stock:500},
    'G-ARG':{nombre:'Arena gruesa',cond:'nuevo',pd:2,mora:2.5,pmin:1,pmes:40,pventa:32,stock:1000},
    'G-ARG-U':{nombre:'Arena gruesa',cond:'usado',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:18,stock:500},
    'G-PCH':{nombre:'Piedra chancada',cond:'nuevo',pd:3,mora:3.5,pmin:1.5,pmes:60,pventa:50,stock:1000},
    'G-PCH-U':{nombre:'Piedra chancada',cond:'usado',pd:1.5,mora:2,pmin:0.5,pmes:30,pventa:25,stock:500},
    'G-HSE':{nombre:'Hormigón seco',cond:'nuevo',pd:2.5,mora:3,pmin:1.5,pmes:50,pventa:42,stock:1000},
    'G-HSE-U':{nombre:'Hormigón seco',cond:'usado',pd:1.5,mora:2,pmin:0.5,pmes:25,pventa:22,stock:500},
    'G-CAL':{nombre:'Cal',cond:'nuevo',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:15,stock:1000},
    'G-CAL-U':{nombre:'Cal',cond:'usado',pd:0.5,mora:0.8,pmin:0.3,pmes:10,pventa:8,stock:500},
    'G-LKK':{nombre:'Ladrillo KK 18 huecos',cond:'nuevo',pd:0.8,mora:1,pmin:0.4,pmes:16,pventa:1.2,stock:1000},
    'G-LKK-U':{nombre:'Ladrillo KK 18 huecos',cond:'usado',pd:0.4,mora:0.5,pmin:0.2,pmes:8,pventa:0.6,stock:500},
    'G-LPD':{nombre:'Ladrillo pandereta',cond:'nuevo',pd:0.6,mora:0.8,pmin:0.3,pmes:12,pventa:1,stock:1000},
    'G-LPD-U':{nombre:'Ladrillo pandereta',cond:'usado',pd:0.3,mora:0.4,pmin:0.15,pmes:6,pventa:0.5,stock:500},
    'G-LPA':{nombre:'Ladrillo pastelero',cond:'nuevo',pd:0.5,mora:0.6,pmin:0.25,pmes:10,pventa:0.8,stock:1000},
    'G-LPA-U':{nombre:'Ladrillo pastelero',cond:'usado',pd:0.25,mora:0.3,pmin:0.1,pmes:5,pventa:0.4,stock:500},
    'G-BC2':{nombre:'Bloque concreto 20cm',cond:'nuevo',pd:2,mora:2.5,pmin:1,pmes:40,pventa:3.5,stock:500},
    'G-BC2-U':{nombre:'Bloque concreto 20cm',cond:'usado',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:1.8,stock:200},
    'G-BC1':{nombre:'Bloque concreto 15cm',cond:'nuevo',pd:1.5,mora:2,pmin:0.8,pmes:30,pventa:2.5,stock:500},
    'G-BC1-U':{nombre:'Bloque concreto 15cm',cond:'usado',pd:0.8,mora:1,pmin:0.4,pmes:15,pventa:1.2,stock:200},
    'G-F38':{nombre:'Fierro 3/8 pulgada',cond:'nuevo',pd:5,mora:6,pmin:3,pmes:100,pventa:12,stock:500},
    'G-F38-U':{nombre:'Fierro 3/8 pulgada',cond:'usado',pd:3,mora:4,pmin:1.5,pmes:60,pventa:7,stock:200},
    'G-F12':{nombre:'Fierro 1/2 pulgada',cond:'nuevo',pd:7,mora:8,pmin:4,pmes:140,pventa:18,stock:500},
    'G-F12-U':{nombre:'Fierro 1/2 pulgada',cond:'usado',pd:4,mora:5,pmin:2,pmes:80,pventa:10,stock:200},
    'G-ALM':{nombre:'Alambre de amarre',cond:'nuevo',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:2.5,stock:500},
    'G-ALM-U':{nombre:'Alambre de amarre',cond:'usado',pd:0.5,mora:0.8,pmin:0.25,pmes:10,pventa:1.2,stock:200},
    'G-CLV':{nombre:'Clavos para construcción',cond:'nuevo',pd:1.5,mora:2,pmin:0.8,pmes:30,pventa:3.5,stock:500},
    'G-CLV-U':{nombre:'Clavos para construcción',cond:'usado',pd:0.8,mora:1,pmin:0.4,pmes:15,pventa:1.8,stock:200},
    'G-MAD':{nombre:'Madera tornillo',cond:'nuevo',pd:0.5,mora:0.6,pmin:0.25,pmes:10,pventa:0.8,stock:1000},
    'G-MAD-U':{nombre:'Madera tornillo',cond:'usado',pd:0.3,mora:0.4,pmin:0.15,pmes:6,pventa:0.5,stock:500},
    'G-TR6':{nombre:'Triplay 4x8 6mm',cond:'nuevo',pd:8,mora:10,pmin:4,pmes:160,pventa:18,stock:500},
    'G-TR6-U':{nombre:'Triplay 4x8 6mm',cond:'usado',pd:5,mora:6,pmin:2.5,pmes:100,pventa:10,stock:200},
    'G-TR1':{nombre:'Triplay 4x8 12mm',cond:'nuevo',pd:12,mora:15,pmin:6,pmes:240,pventa:28,stock:500},
    'G-TR1-U':{nombre:'Triplay 4x8 12mm',cond:'usado',pd:8,mora:10,pmin:4,pmes:160,pventa:16,stock:200},
    'G-PV2':{nombre:'Tubería PVC 1/2 pulgada',cond:'nuevo',pd:3,mora:4,pmin:1.5,pmes:60,pventa:6,stock:500},
    'G-PV2-U':{nombre:'Tubería PVC 1/2 pulgada',cond:'usado',pd:1.5,mora:2,pmin:0.8,pmes:30,pventa:3,stock:200},
    'G-PV3':{nombre:'Tubería PVC 3/4 pulgada',cond:'nuevo',pd:4,mora:5,pmin:2,pmes:80,pventa:8,stock:500},
    'G-PV3-U':{nombre:'Tubería PVC 3/4 pulgada',cond:'usado',pd:2,mora:2.5,pmin:1,pmes:40,pventa:4,stock:200},
    'G-PV1':{nombre:'Tubería PVC 1 pulgada',cond:'nuevo',pd:5,mora:6,pmin:2.5,pmes:100,pventa:10,stock:500},
    'G-PV1-U':{nombre:'Tubería PVC 1 pulgada',cond:'usado',pd:3,mora:4,pmin:1.5,pmes:60,pventa:5,stock:200},
    'G-PEG':{nombre:'Pegamento PVC',cond:'nuevo',pd:2,mora:2.5,pmin:1,pmes:40,pventa:8,stock:500},
    'G-PEG-U':{nombre:'Pegamento PVC',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-PLT':{nombre:'Pintura látex',cond:'nuevo',pd:8,mora:10,pmin:4,pmes:160,pventa:35,stock:500},
    'G-PLT-U':{nombre:'Pintura látex',cond:'usado',pd:5,mora:6,pmin:2.5,pmes:100,pventa:20,stock:200},
    'G-PLE':{nombre:'Pintura esmalte',cond:'nuevo',pd:10,mora:12,pmin:5,pmes:200,pventa:45,stock:500},
    'G-PLE-U':{nombre:'Pintura esmalte',cond:'usado',pd:6,mora:8,pmin:3,pmes:120,pventa:25,stock:200},
    'G-THI':{nombre:'Thinner',cond:'nuevo',pd:3,mora:4,pmin:1.5,pmes:60,pventa:12,stock:500},
    'G-THI-U':{nombre:'Thinner',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-DC7':{nombre:'Disco de corte 7 pulgadas',cond:'nuevo',pd:2,mora:2.5,pmin:1,pmes:40,pventa:5,stock:500},
    'G-DC7-U':{nombre:'Disco de corte 7 pulgadas',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-DD7':{nombre:'Disco de desbaste 7 pulgadas',cond:'nuevo',pd:3,mora:4,pmin:1.5,pmes:60,pventa:7,stock:500},
    'G-DD7-U':{nombre:'Disco de desbaste 7 pulgadas',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-LIJ':{nombre:'Lija para madera',cond:'nuevo',pd:0.5,mora:0.6,pmin:0.25,pmes:10,pventa:1,stock:1000},
    'G-LIJ-U':{nombre:'Lija para madera',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-GUA':{nombre:'Guantes de construcción',cond:'nuevo',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:3,stock:1000},
    'G-GUA-U':{nombre:'Guantes de construcción',cond:'usado',pd:0,mora:0,pmin:0,pmes:0,pventa:0,stock:0},
    'G-CAS':{nombre:'Casco de seguridad',cond:'nuevo',pd:3,mora:4,pmin:1.5,pmes:60,pventa:8,stock:500},
    'G-CAS-U':{nombre:'Casco de seguridad',cond:'usado',pd:1.5,mora:2,pmin:0.8,pmes:30,pventa:4,stock:200},
    'G-SOG':{nombre:'Soga nylon 1/2 pulgada',cond:'nuevo',pd:0.3,mora:0.4,pmin:0.15,pmes:6,pventa:0.5,stock:1000},
    'G-SOG-U':{nombre:'Soga nylon 1/2 pulgada',cond:'usado',pd:0.15,mora:0.2,pmin:0.08,pmes:3,pventa:0.25,stock:500},
    'G-YES':{nombre:'Yeso',cond:'nuevo',pd:1,mora:1.5,pmin:0.5,pmes:20,pventa:3,stock:500},
    'G-YES-U':{nombre:'Yeso',cond:'usado',pd:0.5,mora:0.8,pmin:0.25,pmes:10,pventa:1.5,stock:200},
  },
  /* daños predefinidos para granel: { nombreMaterial: [[nombre, costo], ...] } */
  danosGranel: {
    'Tabla 3m':[['Astillada',2],['Humedecida',3],['Torcida',1]],
    'PATAS':[['Pata rota',5],['Base dañada',3],['Oxidada',2]],
    'PLATAFORMA':[['Rajada',5],['Base dañada',4],['Oxidada',3]],
    'CRUZETAS':[['Cruceta rota',5],['Oxidada',3],['Doblada',4]],
    'Cemento 42.5kg':[['Bolsa rota',1.5],['Endurecido',1.5],['Derrame parcial',0.5]],
    'Arena fina':[['Bolsa rota',1],['Contaminada',1.5],['Derrame',0.5]],
    'Arena gruesa':[['Bolsa rota',1],['Contaminada',1.5],['Derrame',0.5]],
    'Piedra chancada':[['Bolsa rota',1.5],['Contaminada',2],['Derrame',1]],
    'Hormigón seco':[['Bolsa rota',2],['Endurecido',2.5],['Derrame',1]],
    'Cal':[['Bolsa rota',0.5],['Endurecida',1],['Derrame',0.3]],
    'Ladrillo KK 18 huecos':[['Pieza rota',0.8],['Astillado',0.4],['Pallet desacomodado',0.1]],
    'Ladrillo pandereta':[['Pieza rota',0.6],['Astillado',0.3],['Pallet desacomodado',0.1]],
    'Ladrillo pastelero':[['Pieza rota',0.5],['Astillado',0.25],['Pallet desacomodado',0.1]],
    'Bloque concreto 20cm':[['Pieza rota',2],['Astillado',1],['Pallet desacomodado',0.2]],
    'Bloque concreto 15cm':[['Pieza rota',1.5],['Astillado',0.8],['Pallet desacomodado',0.2]],
    'Fierro 3/8 pulgada':[['Doblado',2],['Oxidado',3],['Atado deshecho',0.5]],
    'Fierro 1/2 pulgada':[['Doblado',3],['Oxidado',4],['Atado deshecho',0.5]],
    'Alambre de amarre':[['Enmarañado',0.5],['Oxidado',0.5],['Rollo deshecho',0.2]],
    'Clavos para construcción':[['Oxidados',0.5],['Doblados',0.3],['Mezclados',0.2]],
    'Madera tornillo':[['Astillada',0.3],['Humedecida',0.5],['Torcida',0.2]],
    'Triplay 4x8 6mm':[['Astillado',4],['Humedecido',5],['Esquina rota',3]],
    'Triplay 4x8 12mm':[['Astillado',6],['Humedecido',8],['Esquina rota',5]],
    'Tubería PVC 1/2 pulgada':[['Tubo roto',3],['Rosca dañada',1],['Agrietado',1.5]],
    'Tubería PVC 3/4 pulgada':[['Tubo roto',4],['Rosca dañada',1.5],['Agrietado',2]],
    'Tubería PVC 1 pulgada':[['Tubo roto',5],['Rosca dañada',2],['Agrietado',2.5]],
    'Pegamento PVC':[['Envase abollado',1],['Tapa mal cerrada',0.5],['Derrame',1]],
    'Pintura látex':[['Envase abollado',4],['Derrame',5],['Tapa mal cerrada',1]],
    'Pintura esmalte':[['Envase abollado',5],['Derrame',6],['Tapa mal cerrada',1]],
    'Thinner':[['Envase abollado',2],['Derrame',3],['Tapa mal cerrada',0.5]],
    'Disco de corte 7 pulgadas':[['Disco gastado',1],['Disco roto',2],['Rajado',0.5]],
    'Disco de desbaste 7 pulgadas':[['Disco gastado',1.5],['Disco roto',3],['Rajado',1]],
    'Lija para madera':[['Lija gastada',0.3],['Rota',0.5],['Arrugada',0.1]],
    'Guantes de construcción':[['Roto',1],['Sucio contaminado',0.3],['Elástico roto',0.2]],
    'Casco de seguridad':[['Roto',3],['Correa rota',1],['Rayado',0.5]],
    'Soga nylon 1/2 pulgada':[['Desgastada',0.15],['Cortada',0.3],['Enmarañada',0.1]],
    'Yeso':[['Bolsa rota',1],['Endurecido',1.5],['Derrame',0.5]],
  },
  kit: {
    'K-RMP':{nombre:'Kit Rotomartillo Pro',pd:40,pmin:25,pmes:600,pventa:900,desc:'Kit profesional de rotomartillo',comps:[{tipo:'ind',ref:'RTO-01'},{tipo:'gran',ref:'G-TAB',cant:5}]},
    'K-AND':{nombre:'Andamio',pd:15,pmin:8,pmes:300,pventa:350,desc:'Andamio completo',comps:[{tipo:'gran',ref:'G-PAT',cant:4},{tipo:'gran',ref:'G-PLA',cant:1},{tipo:'gran',ref:'G-CRU',cant:2}]},
    'K-SOL':{nombre:'Soldadura',pd:65,pmin:38,pmes:980,pventa:2000,desc:'Soldadora eléctrica + oxiacetilénico',comps:[{tipo:'ind',ref:'SOL-01'},{tipo:'ind',ref:'SOG-01'}]},
    'K-TAL':{nombre:'Taladro Completo',pd:42,pmin:25,pmes:630,pventa:1200,desc:'Taladro percutor + angular + prolongador',comps:[{tipo:'ind',ref:'TAL-01'},{tipo:'ind',ref:'ATL-01'},{tipo:'ind',ref:'PRO-01'}]},
    'K-CMP':{nombre:'Compresor Completo',pd:72,pmin:42,pmes:1080,pventa:2200,desc:'Compresor + pistola clavos + pistola pintura',comps:[{tipo:'ind',ref:'CMP-01'},{tipo:'ind',ref:'PIS-01'},{tipo:'ind',ref:'PIN-01'}]},
    'K-LIM':{nombre:'Limpieza',pd:28,pmin:16,pmes:420,pventa:700,desc:'Hidrolavadora + prolongador',comps:[{tipo:'ind',ref:'HID-01'},{tipo:'ind',ref:'PRO-02'}]},
    'K-ILU':{nombre:'Iluminación',pd:75,pmin:45,pmes:1125,pventa:2500,desc:'Generador + prolongador + 2 reflectores',comps:[{tipo:'ind',ref:'GEN-01'},{tipo:'ind',ref:'PRO-01'},{tipo:'ind',ref:'LAM-01'},{tipo:'ind',ref:'LAM-02'}]},
    'K-DEM':{nombre:'Demolición',pd:65,pmin:40,pmes:980,pventa:2000,desc:'Martillo demoledor + rotomartillo',comps:[{tipo:'ind',ref:'MAR-01'},{tipo:'ind',ref:'RTO-01'}]},
    'K-ENC':{nombre:'Encofrado',pd:28,pmin:17,pmes:420,pventa:600,desc:'10 puntales + carretilla + madera',comps:[{tipo:'ind',ref:'PUN-01'},{tipo:'ind',ref:'PUN-02'},{tipo:'ind',ref:'PUN-03'},{tipo:'ind',ref:'PUN-04'},{tipo:'ind',ref:'PUN-05'},{tipo:'ind',ref:'PUN-06'},{tipo:'ind',ref:'PUN-07'},{tipo:'ind',ref:'PUN-08'},{tipo:'ind',ref:'PUN-09'},{tipo:'ind',ref:'PUN-10'},{tipo:'ind',ref:'CAR-01'},{tipo:'gran',ref:'G-MAD',cant:5}]},
    'K-NIV':{nombre:'Nivelación',pd:110,pmin:65,pmes:1650,pventa:4500,desc:'Nivel láser + teodolito + estación total',comps:[{tipo:'ind',ref:'NIL-01'},{tipo:'ind',ref:'TEO-01'},{tipo:'ind',ref:'ETT-01'}]},
    'K-COR':{nombre:'Corte',pd:48,pmin:28,pmes:720,pventa:1200,desc:'Amoladora + sierra circular + discos',comps:[{tipo:'ind',ref:'AML-01'},{tipo:'ind',ref:'SIE-01'},{tipo:'gran',ref:'G-DC7',cant:10}]},
    'K-CPC':{nombre:'Compactación',pd:60,pmin:36,pmes:900,pventa:2500,desc:'Compactadora + apisonador',comps:[{tipo:'ind',ref:'COM-01'},{tipo:'ind',ref:'API-01'}]},
    'K-CON':{nombre:'Construcción Básica',pd:18,pmin:11,pmes:270,pventa:400,desc:'Carretilla + 5 puntales + madera',comps:[{tipo:'ind',ref:'CAR-01'},{tipo:'ind',ref:'PUN-01'},{tipo:'ind',ref:'PUN-02'},{tipo:'ind',ref:'PUN-03'},{tipo:'ind',ref:'PUN-04'},{tipo:'ind',ref:'PUN-05'},{tipo:'gran',ref:'G-MAD',cant:5}]},
    'K-APR':{nombre:'Andamio Pro',pd:30,pmin:18,pmes:450,pventa:800,desc:'2 andamios + 6 tablas',comps:[{tipo:'gran',ref:'G-PAT',cant:8},{tipo:'gran',ref:'G-PLA',cant:2},{tipo:'gran',ref:'G-CRU',cant:4},{tipo:'gran',ref:'G-TAB',cant:6}]},
    'K-PIN':{nombre:'Pintura Completo',pd:50,pmin:30,pmes:750,pventa:1400,desc:'Compresor pintura + pistola + thinner',comps:[{tipo:'ind',ref:'CPI-01'},{tipo:'ind',ref:'PIN-01'},{tipo:'gran',ref:'G-THI',cant:3}]},
    'K-INS':{nombre:'Instalación Eléctrica',pd:42,pmin:25,pmes:630,pventa:1100,desc:'Taladro + prolongador + lámpara + ventilador',comps:[{tipo:'ind',ref:'TAL-01'},{tipo:'ind',ref:'PRO-01'},{tipo:'ind',ref:'LAM-01'},{tipo:'ind',ref:'VEN-01'}]},
    'K-JAR':{nombre:'Jardinería',pd:25,pmin:15,pmes:375,pventa:650,desc:'Motoguadaña + guantes + casco + soga',comps:[{tipo:'ind',ref:'MOG-01'},{tipo:'gran',ref:'G-GUA',cant:1},{tipo:'gran',ref:'G-CAS',cant:1},{tipo:'gran',ref:'G-SOG',cant:10}]},
    'K-VIB':{nombre:'Vibrado',pd:38,pmin:22,pmes:570,pventa:1200,desc:'Vibrador + regla vibratoria',comps:[{tipo:'ind',ref:'VIB-01'},{tipo:'ind',ref:'REV-01'}]},
    'K-MEZ':{nombre:'Mezclado',pd:100,pmin:60,pmes:1500,pventa:4000,desc:'Trompo + hormigonera',comps:[{tipo:'ind',ref:'TRO-01'},{tipo:'ind',ref:'HOR-01'}]},
    'K-ABJ':{nombre:'Andamio Básico',pd:16,pmin:10,pmes:240,pventa:400,desc:'Andamio + 4 tablas',comps:[{tipo:'gran',ref:'G-PAT',cant:4},{tipo:'gran',ref:'G-PLA',cant:1},{tipo:'gran',ref:'G-CRU',cant:2},{tipo:'gran',ref:'G-TAB',cant:4}]},
    'K-CCN':{nombre:'Corte Concreto',pd:72,pmin:42,pmes:1080,pventa:2500,desc:'Fresadora + pulidora + cortadora cerámico',comps:[{tipo:'ind',ref:'FRE-01'},{tipo:'ind',ref:'PUL-01'},{tipo:'ind',ref:'CRC-01'}]},
    'K-SLM':{nombre:'Soldadura Móvil',pd:80,pmin:48,pmes:1200,pventa:3500,desc:'Motosoldadora + oxiacetilénico',comps:[{tipo:'ind',ref:'MOS-01'},{tipo:'ind',ref:'SOG-01'}]},
    'K-FRE':{nombre:'Fresado',pd:60,pmin:35,pmes:900,pventa:2200,desc:'Fresadora + pulidora de concreto',comps:[{tipo:'ind',ref:'FRE-01'},{tipo:'ind',ref:'PUL-01'}]},
    'K-LIJ':{nombre:'Lijado',pd:30,pmin:18,pmes:450,pventa:600,desc:'Lijadora orbital + banda + lijas',comps:[{tipo:'ind',ref:'LIJ-01'},{tipo:'ind',ref:'LJB-01'},{tipo:'gran',ref:'G-LIJ',cant:10}]},
    'K-BAN':{nombre:'Baño',pd:76,pmin:44,pmes:1140,pventa:2500,desc:'Bomba + motobomba + hidrolavadora',comps:[{tipo:'ind',ref:'BOM-01'},{tipo:'ind',ref:'MBO-01'},{tipo:'ind',ref:'HID-01'}]},
    'K-TEO':{nombre:'Topografía',pd:88,pmin:52,pmes:1320,pventa:4000,desc:'Teodolito + estación total',comps:[{tipo:'ind',ref:'TEO-01'},{tipo:'ind',ref:'ETT-01'}]},
    'K-TPR':{nombre:'Taladro Percutor Pesado',pd:45,pmin:27,pmes:675,pventa:1300,desc:'Taladro + rotomartillo',comps:[{tipo:'ind',ref:'TAL-01'},{tipo:'ind',ref:'RTO-01'}]},
    'K-AMO':{nombre:'Amolado',pd:35,pmin:20,pmes:525,pventa:600,desc:'Dos amoladoras angulares',comps:[{tipo:'ind',ref:'AML-01'},{tipo:'ind',ref:'AML-03'}]},
    'K-SIE':{nombre:'Juego Sierras',pd:48,pmin:28,pmes:720,pventa:1400,desc:'Sierra circular + banco + caladora',comps:[{tipo:'ind',ref:'SIE-01'},{tipo:'ind',ref:'SIB-01'},{tipo:'ind',ref:'CAL-01'}]},
    'K-ELE':{nombre:'Elevación',pd:35,pmin:20,pmes:525,pventa:600,desc:'Escalera + 5 puntales + prolongador',comps:[{tipo:'ind',ref:'ESC-01'},{tipo:'ind',ref:'PUN-01'},{tipo:'ind',ref:'PUN-02'},{tipo:'ind',ref:'PUN-03'},{tipo:'ind',ref:'PUN-04'},{tipo:'ind',ref:'PUN-05'},{tipo:'ind',ref:'PRO-01'}]},
  },
  clientes: [
    {nombre:'RUBEN DARIO LLASACCE AROHUILLCA',dni:'74527361',telefono:'987654322'},
    {nombre:'Juan Pérez',dni:'12345678',telefono:'999111333'},
    {nombre:'María García',dni:'87654321',telefono:'999444555'},
    {nombre:'Carlos Mendoza',dni:'45678901',telefono:'999777888'},
    {nombre:'Ana Torres',dni:'56789012',telefono:'999222333'},
    {nombre:'Pedro Sánchez',dni:'67890123',telefono:'999555666'},
    {nombre:'Luisa Fernández',dni:'78901234',telefono:'999888999'},
    {nombre:'Miguel Huamán',dni:'89012345',telefono:'999333444'},
    {nombre:'Rosa Quispe',dni:'90123456',telefono:'999666777'},
    {nombre:'José Ramírez',dni:'01234567',telefono:'999000111'},
  ],
};

const granelIds = {};   // codigo -> id numerico
let clienteId = null;   // primer cliente (para compatibilidad)
const cliIds = [];      // todos los IDs de clientes
const stockEsperado = {}; // idGranel -> {alquilada, danada, perdida}

function seed() {
  const adminHash = '31032d272c990e1803afa66ba2cab7a5:806f39fbecda8e3693c77a7c863974328059932d5c67de329bda6550f11feb5a032a2f056f4b3cfb35586b419922c68843e88c9a035278164b8c6c7b893087ab';
  db.prepare(`INSERT INTO USUARIO (nombre, password_hash, rol) VALUES ('Administrador', ?, 'admin')`).run(adminHash);
  // Clientes
  for (const c of CAT.clientes) {
    const r = db.prepare(`INSERT INTO CLIENTE (tipo, nombre, dni, telefono) VALUES ('persona', ?, ?, ?)`).run(c.nombre, c.dni, c.telefono);
    const id = Number(r.lastInsertRowid);
    cliIds.push(id);
    if (c === CAT.clientes[0]) clienteId = id;
  }
  // Categorías + herramientas generadas automáticamente
  for (const [id, nombre, desc, unid, pd, mora, pmin, pmes, pventa] of CAT.categorias) {
    db.prepare(`INSERT INTO CATEGORIA_HERRAMIENTA (id, nombre, descripcion, precio_dia, precio_minimo, precio_mes, precio_venta)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, nombre, desc, pd, pmin, pmes, pventa);
    for (let i = 1; i <= unid; i++) {
      const hid = id + '-' + String(i).padStart(2, '0');
      db.prepare(`INSERT INTO HERRAMIENTA (id, id_categoria, nombre, precio_dia, mora_dia, precio_minimo, precio_mes, precio_venta, estado, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disponible', 1)`).run(hid, id, nombre, pd, mora, pmin, pmes, pventa);
    }
  }
  // Granel
  for (const [cod, g] of Object.entries(CAT.granel)) {
    const r = db.prepare(`INSERT INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, precio_minimo, precio_mes, precio_venta, cantidad_total, cantidad_disponible, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(g.nombre, g.cond, g.pd, g.mora, g.pmin, g.pmes, g.pventa, g.stock, g.stock);
    granelIds[cod] = Number(r.lastInsertRowid);
    stockEsperado[granelIds[cod]] = { alquilada: 0, danada: 0, perdida: 0 };
  }
  // Kits
  let kid = 1;
  for (const [cod, k] of Object.entries(CAT.kit)) {
    db.prepare(`INSERT INTO KIT (id, nombre, descripcion, precio_dia, precio_minimo, precio_mes, precio_venta, activo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(kid, k.nombre, k.desc, k.pd, k.pmin, k.pmes, k.pventa);
    for (const c of k.comps) {
      if (c.tipo === 'ind') {
        db.prepare(`INSERT INTO KIT_COMPONENTE (id_kit, tipo_item, id_herramienta, id_item_granel, cantidad) VALUES (?, 'individual', ?, NULL, 1)`).run(kid, c.ref);
      } else {
        db.prepare(`INSERT INTO KIT_COMPONENTE (id_kit, tipo_item, id_herramienta, id_item_granel, cantidad) VALUES (?, 'granel', NULL, ?, ?)`).run(kid, granelIds[c.ref], c.cant);
      }
    }
    kid++;
  }
  // Daños predefinidos para herramientas
  for (const [catId, list] of Object.entries(CAT.danos)) {
    for (const [nombre, costo] of list) {
      db.prepare(`INSERT INTO DAÑO_PREDEFINIDO (tipo_item, id_categoria, nombre, costo_sugerido, activo) VALUES ('individual', ?, ?, ?, 1)`).run(catId, nombre, costo);
    }
  }
  // Daños predefinidos para granel
  for (const [nombreMat, list] of Object.entries(CAT.danosGranel)) {
    for (const [nombre, costo] of list) {
      db.prepare(`INSERT INTO DAÑO_PREDEFINIDO (tipo_item, nombre_granel, nombre, costo_sugerido, activo) VALUES ('granel', ?, ?, ?, 1)`).run(nombreMat, nombre, costo);
    }
  }
}

seed();

// Evitar que init.js ejecute su seed automático (crearía Tabla 3m duplicada)
db.prepare(`INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion) VALUES ('db_seeded', 'true', 'Indica que los datos semilla ya fueron insertados')`).run();

/* ================================================================
   ORÁCULO — espejo del estado de negocio de cada contrato
   ================================================================ */
const oraculo = { contratos: {} }; // ctId -> estado espejo

// Convierte el formato de items del sistema (id_herramienta / id_item_granel / id_kit)
// al formato interno del espejo (tipo, ref, cantidad, tarifa).
function aEspejo(items) {
  return (items || []).map(it => {
    if (it.id_herramienta || it.tipo_item === 'individual') {
      const ref = it.id_herramienta;
      if (!ref) return null;
      return { tipo: 'individual', ref, nombre: ref, cantidad: 1, tarifa: it.tarifa || 'dia' };
    }
    if (it.id_item_granel || it.tipo_item === 'granel') {
      const ref = it.id_item_granel;
      if (!ref) return null;
      return { tipo: 'granel', ref: Number(ref), nombre: 'G' + ref, cantidad: it.cantidad, tarifa: it.tarifa || 'dia' };
    }
    if (it.id_kit) {
      return { tipo: 'kit', ref: Number(it.id_kit), nombre: 'K' + it.id_kit, cantidad: 1, tarifa: it.tarifa || 'dia' };
    }
    return null;
  }).filter(Boolean);
}

function itemsEspejo(items) {
  return aEspejo(items).map(it => ({
    ...it,
    detalleId: null, snapshot: null, estado: 'pendiente', devReal: null,
    costoPerdida: null, costoReparacion: 0, danos: [], devGranel: [],
  }));
}

function nuevoEspejo(data) {
  return {
    salida: data.salida,
    devPactada: data.devPactada,
    depositoMonto: data.depositoMonto || 0,
    items: itemsEspejo(data.items),
    pagos: (data.pagos || []).map(p => ({ ...p, id: null, anulado: false })),
  };
}

function itemPorRef(ct, tipo, ref, idx) {
  const grupo = ct.items.filter(it => it.tipo === tipo && String(it.ref) === String(ref));
  return grupo[idx || 0];
}

/* Sincroniza hechos desde la BD (ids de detalle, snapshots, estados de hecho).
   No copia bugs: la mora y el estado de granel los calcula el oráculo solo. */
function sincronizarEspejo(ctId) {
  const ct = oraculo.contratos[ctId];
  if (!ct) return;
  const filas = db.prepare(`
    SELECT d.id, d.tipo_item, d.id_herramienta, d.id_item_granel, d.id_kit, d.cantidad,
           d.precio_dia_aplicado, d.tarifa_aplicada,
           d.total_item_snapshot, d.estado_devolucion, d.fecha_devolucion_real,
           d.costo_perdida, d.fecha_devolucion_pactada_item,
           COALESCE(h.mora_dia, i.mora_dia, 0) AS mora_actual
    FROM DETALLE_CONTRATO d
    LEFT JOIN HERRAMIENTA h ON d.id_herramienta = h.id
    LEFT JOIN ITEM_GRANEL i ON d.id_item_granel = i.id
    WHERE d.id_contrato = ? ORDER BY d.id
  `).all(ctId);
  const contadorRef = {};
  for (const f of filas) {
    let ref = null;
    if (f.tipo_item === 'individual') ref = f.id_herramienta;
    else if (f.tipo_item === 'granel') ref = f.id_item_granel;
    else if (f.tipo_item === 'kit') ref = f.id_kit;
    if (ref == null) continue;
    const key = f.tipo_item + ':' + ref;
    const idx = contadorRef[key] || 0;
    contadorRef[key] = idx + 1;
    const it = itemPorRef(ct, f.tipo_item, ref, idx);
    if (!it) continue;
    it.detalleId = f.id;
    it.cantidad = f.cantidad;
    it.precioDia = f.precio_dia_aplicado;
    it.moraDia = f.mora_actual != null ? f.mora_actual : 0;
    it.tarifa = f.tarifa_aplicada || it.tarifa;
    it.snapshot = f.total_item_snapshot != null ? f.total_item_snapshot : null;
    if (f.tipo_item === 'individual') {
      it.estado = f.estado_devolucion;
      it.devReal = f.fecha_devolucion_real || null;
      it.costoPerdida = f.costo_perdida != null ? f.costo_perdida : null;
    }
    it.devPactadaItem = f.fecha_devolucion_pactada_item || it.devPactadaItem;
  }
}

/* Cálculo esperado (correcto) a partir del espejo */
function calcEsperado(ctId) {
  const ct = oraculo.contratos[ctId];
  if (!ct) return null;
  try {
    return calcEsperadoInterno(ct);
  } catch (e) {
    console.error('[ORACULO] fallo en calcEsperado ct=' + ctId + ': ' + e.message);
    console.error(JSON.stringify(ct, null, 1).slice(0, 2000));
    throw e;
  }
}

function calcEsperadoInterno(ct) {
  const hoy = HOY;
  const items = ct.items.map(it => {
    const fechaDevItem = it.devPactadaItem || ct.devPactada;
    const totalItem = it.snapshot != null
      ? it.snapshot
      : calcularTotalItem(it.tarifa || 'dia', it.precioDia, ct.salida, fechaDevItem, it.cantidad);
    const diasHabiles = contarHabiles(ct.salida, fechaDevItem);
    const desg = it.tarifa === 'mes' ? desglosarMensual(ct.salida, fechaDevItem) : null;

    // refMostrada: lo que la vista puede ver (individual devuelto → fecha real; resto → hoy)
    const refMostrada = it.tipo === 'individual' && it.devReal ? it.devReal : hoy;
    // refNegocio: fecha real del último evento de devolución del ítem
    const refNegocio = it.devGranel.length ? it.devGranel[it.devGranel.length - 1].fecha : (it.devReal || hoy);

    const diasAtrasoMostrado = Math.max(0, DIAS(refMostrada, fechaDevItem));
    const diasAtrasoNegocio = Math.max(0, DIAS(refNegocio, fechaDevItem));
    const moraMostrada = diasAtrasoMostrado * (it.moraDia || 0) * it.cantidad;
    const moraNegocio = diasAtrasoNegocio * (it.moraDia || 0) * it.cantidad;

    const pagadoItem = ct.pagos
      .filter(p => !p.anulado && p.idDetalle === it.detalleId)
      .reduce((a, p) => a + p.monto, 0);
    const saldo = Math.max(0, totalItem + moraMostrada - pagadoItem);

    const devGranel = it.devGranel.filter(d => !d.revertido);
    const devGranelTotal = devGranel.reduce((a, d) => a + d.bien + d.danada + d.perdida, 0);

    // estado devolución esperado por ítem
    let estadoEsp;
    if (it.tipo === 'individual' || it.tipo === 'kit') estadoEsp = it.estado;
    else estadoEsp = devGranelTotal >= it.cantidad ? 'completo' : (devGranelTotal > 0 ? 'parcial' : 'pendiente');
    const pendienteLinea = (it.tipo === 'individual' || it.tipo === 'kit')
      ? (it.estado === 'pendiente')
      : (devGranelTotal < it.cantidad);

    return {
      detalleId: it.detalleId, tipo: it.tipo, ref: it.ref, nombre: it.nombre,
      cantidad: it.cantidad, tarifa: it.tarifa, precioDia: it.precioDia, moraDia: it.moraDia,
      totalItem, diasHabiles, meses: desg ? desg.meses : 0, diasExtra: desg ? desg.diasExtra : 0,
      diasAtrasoMostrado, diasAtrasoNegocio, moraMostrada, moraNegocio,
      pagadoItem, saldo, estadoEsp, pendienteLinea,
      refDevReal: it.devReal, granelPendiente: Math.max(0, it.cantidad - devGranelTotal),
      danos: it.danos || [], costoReparacion: it.costoReparacion || 0,
      costoPerdida: it.costoPerdida, devGranel,
    };
  });

  const totalBase = items.reduce((a, i) => a + i.totalItem, 0);
  const totalAtrasoMostrado = items.reduce((a, i) => a + i.moraMostrada, 0);
  const totalAtrasoNegocio = items.reduce((a, i) => a + i.moraNegocio, 0);
  // Daños "de negocio": costo reparación granel (desde entradas de devolución) + máximo(costo reparación individual, desglose DAÑO_DEVOLUCION)
  const totalDanosNegocio = items.reduce((a, i) => a +
    (i.tipo === 'granel' ? i.devGranel.reduce((s, d) => s + d.costoReparacion, 0) : 0) +
    (i.tipo === 'individual' ? Math.max(i.costoReparacion, (i.danos || []).reduce((s, d) => s + d.costo, 0)) : 0), 0);
  const totalPerdidas = items.reduce((a, i) => a +
    (i.tipo === 'granel' ? i.devGranel.filter(d => !d.revertido).reduce((s, d) => s + (d.costoPerdida || 0), 0) : 0) +
    (i.tipo === 'individual' ? (i.costoPerdida || 0) : 0), 0);

  const totalPagado = ct.pagos.filter(p => !p.anulado && p.tipo !== 'deposito' && p.tipo !== 'devolucion_deposito')
    .reduce((a, p) => a + p.monto, 0);
  const garantia = ct.pagos.filter(p => !p.anulado && p.tipo === 'deposito').reduce((a, p) => a + p.monto, 0)
    - ct.pagos.filter(p => !p.anulado && p.tipo === 'devolucion_deposito').reduce((a, p) => a + p.monto, 0);

  const totalGeneral = totalBase + totalAtrasoMostrado + totalDanosNegocio + totalPerdidas + ct.depositoMonto;
  const saldoContrato = Math.max(0, totalGeneral - totalPagado);

  // Estado del contrato esperado (regla correcta: granel por LÍNEA)
  const pendientes = items.filter(i => i.pendienteLinea).length;
  const devueltos = items.length - pendientes;
  let estado;
  if (pendientes === 0 && devueltos > 0) estado = 'devuelto';
  else if (pendientes === 0) estado = 'alquilado';
  else if (devueltos === 0) estado = 'alquilado';
  else estado = 'devolución incompleta';

  return {
    estado, items, totalBase, totalAtrasoMostrado, totalAtrasoNegocio,
    totalDanosNegocio, totalPerdidas, totalPagado, garantia,
    totalGeneral, saldoContrato,
  };
}

/* ================================================================
   SNAPSHOTS Y DIFF
   ================================================================ */
function snapshotSistema(ctId) {
  if (ctId == null) return { c: null, d: null };
  const c = contratoService.getContratos({}).find(x => x.id === ctId) || null;
  const d = clienteService.getDetalleContrato(ctId);
  return { c, d };
}

function stockSistema() {
  const out = {};
  for (const r of db.prepare('SELECT id, cantidad_alquilada, cantidad_danada, cantidad_perdida FROM ITEM_GRANEL').all()) {
    out[r.id] = { alquilada: r.cantidad_alquilada, danada: r.cantidad_danada, perdida: r.cantidad_perdida };
  }
  return out;
}

function diffContrato(snap, esp) {
  const ds = [];
  if (!esp) return ds;
  const ok = (campo, real, espVal, extra) => {
    if (real == null || espVal == null) return;
    if (!casi(real, espVal)) ds.push(`${campo}: sistema=${red(real)} esperado=${red(espVal)}${extra ? ' [' + extra + ']' : ''}`);
  };
  if (snap.c) {
    if (snap.c.estado !== esp.estado) ds.push(`estado: sistema=${snap.c.estado} esperado=${esp.estado}`);
    ok('total_pagado', snap.c.total_pagado, esp.totalPagado);
    if (snap.c.garantia_retenida != null) ok('garantia_retenida', snap.c.garantia_retenida, esp.garantia);
  }
  if (snap.d) {
    ok('total_base', snap.d.total_base, esp.totalBase);
    ok('total_atraso', snap.d.total_atraso, esp.totalAtrasoMostrado, 'mora debería usar mora_dia_aplicada');
    ok('total_danos', snap.d.total_danos, esp.totalDanosNegocio, 'daño sin desglose no visible');
    ok('total_perdidas', snap.d.total_perdidas, esp.totalPerdidas);
    ok('total_general', snap.d.total_general, esp.totalGeneral);
    ok('saldo_contrato', snap.d.total_general - (snap.d.total_pagado ?? esp.totalPagado), esp.saldoContrato, 'saldo finanzas');
  }
  return ds;
}

function diffItems(snap, esp) {
  const regs = [];
  if (!esp) return regs;
  const detalleItems = snap.d && snap.d.items ? snap.d.items : [];
  for (const itEsp of esp.items) {
    const si = detalleItems.find(x => x.id === itEsp.detalleId) || {};
    const ds = [];
    const ok = (campo, real, espVal) => {
      if (real == null || espVal == null) return;
      if (!casi(real, espVal)) ds.push(`${campo}: sistema=${red(real)} esperado=${red(espVal)}`);
    };
    ok('total_item', si.total_item, itEsp.totalItem);
    ok('dias_habiles', si.dias_habiles_item, itEsp.diasHabiles);
    if (itEsp.tarifa === 'mes') {
      ok('meses', si.meses_item, itEsp.meses);
      ok('dias_extra', si.dias_extra_item, itEsp.diasExtra);
    }
    ok('dias_atraso', si.dias_atraso_item, itEsp.diasAtrasoMostrado);
    ok('monto_atraso', si.monto_atraso_item, itEsp.moraMostrada, 'mora_dia_aplicada vs precio_dia_aplicado');
    ok('pagado_item', si.pagado_item, itEsp.pagadoItem);
    ok('saldo_item', si.saldo_item, itEsp.saldo);
    if (itEsp.tipo === 'individual') {
      if (si.estado_devolucion !== itEsp.estadoEsp) ds.push(`estado_dev: sistema=${si.estado_devolucion} esperado=${itEsp.estadoEsp}`);
    } else {
      ok('granel_pendiente', si.granel_pendiente, itEsp.granelPendiente);
    }
    regs.push({
      itemId: si.id ?? itEsp.detalleId, codigo: si.item_codigo ?? itEsp.ref, nombre: si.item_nombre ?? itEsp.nombre,
      tipo: si.tipo_item ?? itEsp.tipo, cantidad: si.cantidad ?? itEsp.cantidad, tarifa: itEsp.tarifa,
      precioDia: si.precio_dia_aplicado ?? itEsp.precioDia, moraDia: si.mora_dia_aplicada ?? itEsp.moraDia,
      diasHabiles: si.dias_habiles_item ?? itEsp.diasHabiles,
      diasAtrasoMostrado: si.dias_atraso_item ?? itEsp.diasAtrasoMostrado, diasAtrasoNegocio: itEsp.diasAtrasoNegocio,
      totalSistema: si.total_item, totalEsperado: itEsp.totalItem,
      moraSistema: si.monto_atraso_item, moraMostrada: itEsp.moraMostrada, moraNegocio: itEsp.moraNegocio,
      pagadoItem: si.pagado_item ?? itEsp.pagadoItem,
      saldoSistema: si.saldo_item, saldoEsperado: itEsp.saldo,
      estadoSistema: si.estado_devolucion, estadoEsperado: itEsp.estadoEsp,
      granelPendienteSistema: si.granel_pendiente, granelPendienteEsperado: itEsp.granelPendiente,
      fechaDevSistema: si.fecha_devolucion_real, fechaDevEsperada: itEsp.refDevReal || '',
      discrepancias: ds,
    });
  }
  return regs;
}

/* ================================================================
   MOTOR DE ACCIONES — registra antes/después + esperado + diffs
   ================================================================ */
let contador = 0;
const bitacora = [];
const itemsLog = [];
const resumenEsc = {};

function accion(esc, ctId, nombre, ejecutar, opciones = {}) {
  contador++;
  const id = contador;
  const ts = new Date().toISOString();
  const antes = snapshotSistema(ctId);
  const antesStock = stockSistema();
  const antesEstado = antes.c ? antes.c.estado : null;

  let resultado = null, error = null;
  try {
    resultado = ejecutar();
  } catch (e) {
    error = e.message || String(e);
  }
  const moraCobrada = resultado && typeof resultado === 'object' && 'totalMora' in resultado ? resultado.totalMora : null;

  const despues = snapshotSistema(ctId);
  const despuesStock = stockSistema();

  let discrepancias = [];
  let regsItems = [];
  let esperado = null;
  let estadoEsperado = '';
  let espejoSincronizado = false;

  if (error) {
    // Invariante: acción rechazada no debe mutar el sistema
    const mutado = antesEstado !== (despues.c ? despues.c.estado : null)
      || JSON.stringify(antesStock) !== JSON.stringify(despuesStock);
    if (mutado) discrepancias.push('SISTEMA MUTADO tras error rechazado');
    estadoEsperado = antesEstado;
    if (ctId != null && oraculo.contratos[ctId]) {
      esperado = calcEsperado(ctId); // espejo sin cambios
      regsItems = diffItems(antes, esperado).map(r => ({ ...r, resultado: 'rechazado' }));
      discrepancias = discrepancias.concat(diffContrato(antes, esperado));
    }
  } else if (ctId == null || !oraculo.contratos[ctId]) {
    // Creación: el id se conoce dentro del callback; el espejo se registra después.
    // La fila queda como hito informativo; las acciones siguientes verifican.
    estadoEsperado = '';
  } else {
    sincronizarEspejo(ctId);
    espejoSincronizado = true;
    esperado = calcEsperado(ctId);
    estadoEsperado = esperado.estado;
    discrepancias = diffContrato(despues, esperado);
    regsItems = diffItems(despues, esperado).map(r => ({ ...r, resultado: 'ok' }));
    // Stock esperado vs real (solo si la acción movió stock por su cuenta o verificamos igualmente)
    for (const [idG, espS] of Object.entries(stockEsperado)) {
      const realS = despuesStock[idG];
      if (!realS) continue;
      for (const campo of ['alquilada', 'danada', 'perdida']) {
        if (realS[campo] !== espS[campo]) {
          discrepancias.push(`stock_${campo}[${idG}]: sistema=${realS[campo]} esperado=${espS[campo]}`);
        }
      }
    }
    // Mora cobrada en transacción que no aparece en la vista (granel devuelto con atraso)
    if (moraCobrada != null && moraCobrada > 0 && despues.d && (despues.d.total_atraso || 0) === 0) {
      discrepancias.push('mora_cobrada=' + red(moraCobrada) + ' pero total_atraso visible=0 (granel: fecha real no visible)');
    }
  }

  const reg = {
    id, ts, escenario: esc, contrato: ctId, accion: nombre,
    resultado: error ? 'rechazado' : 'ok', error: error || '',
    estadoAntes: antesEstado, estadoDespues: despues.c ? despues.c.estado : null, estadoEsperado,
    totalContratoSistema: despues.c ? despues.c.total_contrato : null,
    totalPagadoSistema: despues.c ? despues.c.total_pagado : (despues.d ? despues.d.total_pagado : null),
    totalPagadoEsperado: esperado ? esperado.totalPagado : null,
    garantiaSistema: despues.c ? despues.c.garantia_retenida : null,
    garantiaEsperada: esperado ? esperado.garantia : null,
    totalBaseSistema: despues.d ? despues.d.total_base : null, totalBaseEsperado: esperado ? esperado.totalBase : null,
    totalAtrasoSistema: despues.d ? despues.d.total_atraso : null,
    totalAtrasoMostrado: esperado ? esperado.totalAtrasoMostrado : null,
    totalAtrasoNegocio: esperado ? esperado.totalAtrasoNegocio : null,
    totalDanosSistema: despues.d ? despues.d.total_danos : null,
    totalDanosNegocio: esperado ? esperado.totalDanosNegocio : null,
    totalPerdidasSistema: despues.d ? despues.d.total_perdidas : null,
    totalPerdidasEsperado: esperado ? esperado.totalPerdidas : null,
    totalGeneralSistema: despues.d ? despues.d.total_general : null,
    totalGeneralEsperado: esperado ? esperado.totalGeneral : null,
    saldoSistema: despues.d ? Math.max(0, despues.d.total_general - (despues.d.total_pagado || 0)) : null,
    saldoEsperado: esperado ? esperado.saldoContrato : null,
    moraCobrada, notas: opciones.notas || '',
    numDiscrepancias: discrepancias.length, discrepancias: discrepancias.join(' | '),
  };
  bitacora.push(reg);

  for (const r of regsItems) {
    r.accionId = id;
    r.escenario = esc;
    r.contrato = ctId;
    itemsLog.push(r);
  }

  if (!resumenEsc[esc]) resumenEsc[esc] = { acciones: 0, discrepancias: 0, rechazados: 0, lista: [] };
  resumenEsc[esc].acciones++;
  resumenEsc[esc].rechazados += error ? 1 : 0;
  resumenEsc[esc].discrepancias += discrepancias.length;
  for (const d of discrepancias) resumenEsc[esc].lista.push(nombre + ' → ' + d);
  if (process.env.ORACULO_TRACE) {
    console.error(`[trace] ${esc} ct=${ctId} ${nombre} → ${error ? 'ERROR: ' + error : 'ok'} estado=${despues.c ? despues.c.estado : '-'} dis=${discrepancias.length}`);
  }
  return { resultado, error, discrepancias, espejoSincronizado };
}

/* Helpers de construcción de escenarios */
function itemsIndividual(ids, tarifa = 'dia') {
  return ids.map(id => ({ tipo_item: 'individual', id_herramienta: id, tarifa }));
}
function itemGranel(cod, cantidad, tarifa = 'dia') {
  return { tipo_item: 'granel', id_item_granel: granelIds[cod], cantidad, tarifa };
}

const clientesPorEsc = {
  'ESC 01':0,'ESC 02':1,'ESC 03':2,'ESC 04':0,'ESC 05':3,'ESC 06':4,'ESC 07':0,'ESC 08':1,
  'ESC 09':2,'ESC 10':0,'ESC 10b':5,'ESC 11':3,'ESC 12':0,'ESC 13':1,'ESC 14':2,'ESC 15':0,
  'ESC 16':3,'ESC 17':4,'ESC 18':5,'ESC 19':6,'ESC 20':0,'ESC 21':3,
};
function crear(esc, nombre, data) {
  const idx = clientesPorEsc[esc] != null ? clientesPorEsc[esc] : 0;
  return crearConCliente(esc, nombre, data, cliIds[idx]);
}
function crearConCliente(esc, nombre, data, cliId) {
  let ctId = null;
  const res = accion(esc, null, nombre + ' (crear)', () => {
    const r = contratoService.crearContrato(cliId, 1, data.salida, data.devPactada,
      data.depositoMonto || 0, data.depositoDni || 0, data.items, data.pagos || [], null, null, null);
    ctId = r.idContrato;
    return r;
  });
  if (ctId == null) {
    console.error('  ✗ No se pudo crear contrato para escenario ' + esc + ': ' + res.error);
    return null;
  }
  oraculo.contratos[ctId] = nuevoEspejo(data);
  for (const it of oraculo.contratos[ctId].items) {
    if (it.tipo === 'granel') stockEsperado[it.ref].alquilada += it.cantidad;
  }
  const maxPago = db.prepare('SELECT MAX(id) AS m FROM PAGO WHERE id_contrato = ?').get(ctId);
  if (maxPago && maxPago.m != null) {
    const pagosBd = db.prepare('SELECT id, monto, metodo, tipo FROM PAGO WHERE id_contrato = ?').all(ctId);
    for (const p of pagosBd) {
      const esp = oraculo.contratos[ctId].pagos.find(x => x.monto === p.monto && x.tipo === p.tipo && x.metodo === p.metodo);
      if (esp) esp.id = p.id;
    }
  }
  sincronizarEspejo(ctId);
  return ctId;
}

function pagar(esc, ctId, nombre, monto, metodo, tipo, idDetalle) {
  return accion(esc, ctId, nombre + ' (pago ' + monto + ')', () => {
    const r = contratoService.registrarPagoAdicional(ctId, monto, metodo, tipo || 'saldo', idDetalle);
    oraculo.contratos[ctId].pagos.push({ monto, metodo, tipo: tipo || 'saldo', idDetalle: idDetalle || null, id: r.id, anulado: false });
    return r;
  });
}

function devolver(esc, ctId, nombre, items, fecha) {
  return accion(esc, ctId, nombre + ' (devolver)', () => {
    const r = contratoService.registrarDevolucion(ctId, fecha, items);
    const ct = oraculo.contratos[ctId];
    for (const it of items) {
      const det = db.prepare('SELECT * FROM DETALLE_CONTRATO WHERE id = ?').get(it.id_detalle);
      if (!det) continue;
      if (det.tipo_item === 'individual' || det.tipo_item === 'kit') {
        const esp = ct.items.find(x => x.detalleId === it.id_detalle);
        if (esp) {
          esp.estado = it.estado_devolucion;
          esp.devReal = fecha;
          esp.costoPerdida = it.estado_devolucion === 'perdido' ? it.costo_perdida : null;
          if (it.estado_devolucion === 'dañado') {
            esp.costoReparacion = it.costo_reparacion || 0;
            esp.danos = it.danos || [];
          }
        }
      } else if (det.tipo_item === 'granel') {
        const esp = ct.items.find(x => x.detalleId === it.id_detalle);
        if (esp) {
          const cant = it.cantidad_devuelta || det.cantidad;
          const entry = { fecha, bien: 0, danada: 0, perdida: 0, costoReparacion: 0, costoPerdida: null, revertido: false };
          if (it.estado_devolucion === 'bien') entry.bien = cant;
          else if (it.estado_devolucion === 'dañado') { entry.danada = cant; entry.costoReparacion = it.costo_reparacion || 0; esp.danos = esp.danos || []; esp.danos.push(...(it.danos || [])); }
          else if (it.estado_devolucion === 'perdido') { entry.perdida = cant; entry.costoPerdida = it.costo_perdida != null ? it.costo_perdida : null; }
          esp.devGranel.push(entry);
          const s = stockEsperado[esp.ref];
          s.alquilada -= cant;
          if (entry.danada > 0) s.danada += entry.danada;
          if (entry.perdida > 0) s.perdida += entry.perdida;
        }
      }
    }
    return r;
  });
}

function editar(esc, ctId, nombre, data) {
  return accion(esc, ctId, nombre + ' (editar)', () => {
    contratoService.editarContrato(ctId, data);
    const ctE = oraculo.contratos[ctId];
    ctE.items = itemsEspejo(data.items);
    ctE.salida = data.fechaSalida;
    ctE.devPactada = data.fechaDevolucionPactada;
    ctE.depositoMonto = data.depositoMonto || 0;
    // El sistema libera y re-reserva inventario; sincronizar stock desde BD
    const st = stockSistema();
    for (const [idG, s] of Object.entries(stockEsperado)) {
      if (st[idG]) Object.assign(s, st[idG]);
    }
  });
}

/* ================================================================
   ESCENARIOS
   ================================================================ */
const D = (n) => sumarDias(HOY, n);
const escenarios = [];

function registrarEsc(esc) { escenarios.push(esc); console.log('· ' + esc + ' — en ejecución'); }

// ESC 01: RTO-01 día, devolución a tiempo, pago adelanto + depósito y devolución del depósito
registrarEsc('ESC 01');
{
  const ct = crear('ESC 01', 'RTO-01 día', { salida: D(0), devPactada: D(4), depositoMonto: 50, items: itemsIndividual(['RTO-01']) });
  if (ct) {
    pagar('ESC 01', ct, 'pago adelanto', 100, 'efectivo', 'adelanto');
    devolver('ESC 01', ct, 'devolución bien a tiempo', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(4));
    pagar('ESC 01', ct, 'devolución depósito', 50, 'efectivo', 'devolucion_deposito');
  }
}

// ESC 02: AML-02, devolución 3 días tarde → BUG de mora (precio vs mora_dia)
registrarEsc('ESC 02');
{
  const ct = crear('ESC 02', 'AML-02 mora 3 días', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
  if (ct) devolver('ESC 02', ct, 'devolución tarde', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(7));
}

// ESC 03: GEN-03 6 días hábiles, pago parcial
registrarEsc('ESC 03');
{
  const ct = crear('ESC 03', 'GEN-03 pago parcial', { salida: D(0), devPactada: D(6), items: itemsIndividual(['GEN-03']) });
  if (ct) {
    pagar('ESC 03', ct, 'pago parcial', 100, 'yape', 'saldo');
    devolver('ESC 03', ct, 'devolución bien', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(6));
  }
}

// ESC 04: G-TAB x10 mensual, 1 mes (11 ago → 11 sep)
registrarEsc('ESC 04');
{
  const ct = crear('ESC 04', 'G-TAB x10 mes', { salida: D(0), devPactada: sumarDias(HOY, 31), items: [itemGranel('G-TAB', 10, 'mes')] });
  if (ct) devolver('ESC 04', ct, 'devolución mes completo', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], sumarDias(HOY, 31));
}

// ESC 05: RTO-04 + AML-05, parcial → intento de edición debe fallar → completar (mora AML-05)
registrarEsc('ESC 05');
{
  const ct = crear('ESC 05', 'parcial + editar falla', { salida: D(0), devPactada: D(4), items: itemsIndividual(['RTO-04', 'AML-05']) });
  if (ct) {
    const det1 = oraculo.contratos[ct].items[0].detalleId;
    const det2 = oraculo.contratos[ct].items[1].detalleId;
    devolver('ESC 05', ct, 'devolver solo RTO-04', [{ id_detalle: det1, estado_devolucion: 'bien' }], D(4));
    editar('ESC 05', ct, 'editar contrato (debe fallar)', { idCliente: clienteId, idUsuario: 1, fechaSalida: D(0), fechaDevolucionPactada: D(4), depositoMonto: 0, depositoDni: 0, items: [{ tipo_item: 'individual', id_herramienta: 'RTO-04' }] });
    devolver('ESC 05', ct, 'devolver AML-05 tarde', [{ id_detalle: det2, estado_devolucion: 'bien' }], D(7));
  }
}

// ESC 06: G-CEM x10 multi-outcome 3 días tarde → BUG mora granel (transacción vs vista)
registrarEsc('ESC 06');
{
  const ct = crear('ESC 06', 'G-CEM x10 multi-outcome', { salida: D(0), devPactada: D(4), items: [itemGranel('G-CEM', 10)] });
  if (ct) devolver('ESC 06', ct, 'devolución multi-outcome', [
    { id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien', cantidad_devuelta: 5 },
    { id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'dañado', cantidad_devuelta: 3, costo_reparacion: 20, danos: [{ nombre: 'punta', costo: 15 }, { nombre: 'cable', costo: 5 }] },
    { id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'perdido', cantidad_devuelta: 2, costo_perdida: 100 },
  ], D(7));
}

// ESC 07: Kit completo, devolución a tiempo
registrarEsc('ESC 07');
{
  const ct = crear('ESC 07', 'kit día', { salida: D(0), devPactada: D(4), items: [{ tipo_item: 'kit', id_kit: 1, cantidad: 1, tarifa: 'dia' }] });
  if (ct) devolver('ESC 07', ct, 'devolver kit', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(4));
}

// ESC 08: AML-02, editar extiende fechas (08-15 → 08-20)
registrarEsc('ESC 08');
{
  const ct = crear('ESC 08', 'editar fechas', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
  if (ct) {
    editar('ESC 08', ct, 'editar extendiendo a 9 días hábiles', { idCliente: clienteId, idUsuario: 1, fechaSalida: D(0), fechaDevolucionPactada: D(9), depositoMonto: 0, depositoDni: 0, items: [{ tipo_item: 'individual', id_herramienta: 'AML-02' }] });
    const det = oraculo.contratos[ct].items[0].detalleId;
    devolver('ESC 08', ct, 'devolver al nuevo plazo', [{ id_detalle: det, estado_devolucion: 'bien' }], D(9));
  }
}

// ESC 09: AML-02 → editar swap por RTO-01 → devolver
registrarEsc('ESC 09');
{
  const ct = crear('ESC 09', 'editar swap ítem', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
  if (ct) {
    editar('ESC 09', ct, 'editar cambiando AML-02 → RTO-01', { idCliente: clienteId, idUsuario: 1, fechaSalida: D(0), fechaDevolucionPactada: D(4), depositoMonto: 0, depositoDni: 0, items: [{ tipo_item: 'individual', id_herramienta: 'RTO-01' }] });
    const det = oraculo.contratos[ct].items[0].detalleId;
    devolver('ESC 09', ct, 'devolver RTO-01', [{ id_detalle: det, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 10: AML-05 dañado con desglose → MANTENIMIENTO + total_danos
registrarEsc('ESC 10');
{
  const ct = crear('ESC 10', 'dañado con desglose', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-05']) });
  if (ct) devolver('ESC 10', ct, 'devolver dañado', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'dañado', costo_reparacion: 25, danos: [{ nombre: 'motor', costo: 20 }, { nombre: 'cable', costo: 5 }] }], D(4));
}

// ESC 10b: RTO-04 dañado SIN desglose → costo en MANTENIMIENTO pero no visible en finanzas
registrarEsc('ESC 10b');
{
  const ct = crear('ESC 10b', 'dañado sin desglose', { salida: D(0), devPactada: D(4), items: itemsIndividual(['RTO-04']) });
  if (ct) devolver('ESC 10b', ct, 'devolver dañado sin desglose', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'dañado', costo_reparacion: 30 }], D(4));
}

// ESC 11: GEN-03 perdido → costo_perdida + mora con bug
registrarEsc('ESC 11');
{
  const ct = crear('ESC 11', 'perdido', { salida: D(0), devPactada: D(4), items: itemsIndividual(['GEN-03']) });
  if (ct) devolver('ESC 11', ct, 'devolver perdido', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'perdido', costo_perdida: 2400 }], D(7));
}

// ESC 12: reserva → convertir → devolver
registrarEsc('ESC 12');
{
  let ct = null;
  accion('ESC 12', null, 'crear reserva', () => {
    const r = contratoService.crearReserva(clienteId, 1, D(0), D(4), 0, 0, [{ tipo_item: 'individual', id_herramienta: 'AML-02' }], [], null, null, null);
    ct = r.idContrato || r.id;
    return r;
  });
  if (ct != null) {
    oraculo.contratos[ct] = nuevoEspejo({ salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
    sincronizarEspejo(ct);
    accion('ESC 12', ct, 'convertir reserva', () => contratoService.convertirReserva(ct));
    const det = oraculo.contratos[ct].items[0].detalleId;
    devolver('ESC 12', ct, 'devolver tras conversión', [{ id_detalle: det, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 13: doble devolución y edición post-devolución deben fallar
registrarEsc('ESC 13');
{
  const ct = crear('ESC 13', 'devolución doble', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
  if (ct) {
    devolver('ESC 13', ct, 'primera devolución', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(4));
    devolver('ESC 13', ct, 'segunda devolución (debe fallar)', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(4));
    editar('ESC 13', ct, 'editar contrato devuelto (debe fallar)', { idCliente: clienteId, idUsuario: 1, fechaSalida: D(0), fechaDevolucionPactada: D(4), depositoMonto: 0, depositoDni: 0, items: [{ tipo_item: 'individual', id_herramienta: 'AML-02' }] });
  }
}

// ESC 14: sobrepago → saldo 0 + pago dirigido por ítem
registrarEsc('ESC 14');
{
  const ct = crear('ESC 14', 'sobrepago + pago por ítem', { salida: D(0), devPactada: D(4), items: itemsIndividual(['RTO-01']) });
  if (ct) {
    const det = oraculo.contratos[ct].items[0].detalleId;
    pagar('ESC 14', ct, 'sobrepago', 200, 'efectivo', 'saldo', det);
    devolver('ESC 14', ct, 'devolución', [{ id_detalle: det, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 15: G-TAB x5 mensual bisiesto 2024 (31 ene → 29 feb)
registrarEsc('ESC 15');
{
  const ct = crear('ESC 15', 'bisiesto 1 mes', { salida: '2024-01-31', devPactada: '2024-02-29', items: [itemGranel('G-TAB', 5, 'mes')] });
  if (ct) devolver('ESC 15', ct, 'devolver 29 feb', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], '2024-02-29');
}

// ESC 16: RTO-01 + AML-02 parcial → editar falla → completar
registrarEsc('ESC 16');
{
  const ct = crear('ESC 16', 'parcial 2', { salida: D(0), devPactada: D(4), items: itemsIndividual(['RTO-01', 'AML-02']) });
  if (ct) {
    const det1 = oraculo.contratos[ct].items[0].detalleId;
    const det2 = oraculo.contratos[ct].items[1].detalleId;
    devolver('ESC 16', ct, 'devolver RTO-01', [{ id_detalle: det1, estado_devolucion: 'bien' }], D(4));
    editar('ESC 16', ct, 'editar (debe fallar)', { idCliente: clienteId, idUsuario: 1, fechaSalida: D(0), fechaDevolucionPactada: D(4), depositoMonto: 0, depositoDni: 0, items: [{ tipo_item: 'individual', id_herramienta: 'RTO-01' }] });
    devolver('ESC 16', ct, 'devolver AML-02', [{ id_detalle: det2, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 17: revertir devolución individual
registrarEsc('ESC 17');
{
  const ct = crear('ESC 17', 'revertir individual', { salida: D(0), devPactada: D(4), items: itemsIndividual(['AML-02']) });
  if (ct) {
    const det = oraculo.contratos[ct].items[0].detalleId;
    devolver('ESC 17', ct, 'devolver bien', [{ id_detalle: det, estado_devolucion: 'bien' }], D(4));
    accion('ESC 17', ct, 'revertir devolución', () => {
      contratoService.revertirDevolucionItem(det);
      const esp = oraculo.contratos[ct].items[0];
      esp.estado = 'pendiente'; esp.devReal = null; esp.costoPerdida = null; esp.costoReparacion = 0; esp.danos = [];
    });
    devolver('ESC 17', ct, 'devolver de nuevo', [{ id_detalle: det, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 18: dos líneas del MISMO granel → devolver solo una → BUG de estado por agrupación
registrarEsc('ESC 18');
{
  const ct = crear('ESC 18', 'granel 2 líneas', { salida: D(0), devPactada: D(4), items: [itemGranel('G-CEM', 10), itemGranel('G-CEM', 5)] });
  if (ct) {
    const detA = oraculo.contratos[ct].items[0].detalleId;
    const detB = oraculo.contratos[ct].items[1].detalleId;
    devolver('ESC 18', ct, 'devolver solo línea A (10)', [{ id_detalle: detA, estado_devolucion: 'bien' }], D(4));
    devolver('ESC 18', ct, 'devolver línea B (5)', [{ id_detalle: detB, estado_devolucion: 'bien' }], D(4));
  }
}

// ESC 19: granel multi-outcome + revertir entrada granel
registrarEsc('ESC 19');
{
  const ct = crear('ESC 19', 'granel + revertir', { salida: D(0), devPactada: D(4), items: [itemGranel('G-ARE', 6)] });
  if (ct) {
    const det = oraculo.contratos[ct].items[0].detalleId;
    let idDev = null;
    accion('ESC 19', ct, 'devolver multi-outcome', () => {
      const r = contratoService.registrarDevolucion(ct, D(4), [        { id_detalle: det, estado_devolucion: 'bien', cantidad_devuelta: 2 },
        { id_detalle: det, estado_devolucion: 'dañado', cantidad_devuelta: 2, costo_reparacion: 8 },
        { id_detalle: det, estado_devolucion: 'perdido', cantidad_devuelta: 2, costo_perdida: 30 },
      ], D(4));
      const esp = oraculo.contratos[ct].items[0];
      esp.devGranel.push({ fecha: D(4), bien: 2, danada: 2, perdida: 2, costoReparacion: 8, costoPerdida: 30, revertido: false });
      const s = stockEsperado[esp.ref];
      s.alquilada -= 6; s.danada += 2; s.perdida += 2;
      return r;
    });
    const filas = contratoService.getDevolucionesGranel(ct);
    idDev = filas.length ? filas[0].id : null;
    if (idDev != null) {
      accion('ESC 19', ct, 'revertir devolución granel', () => {
        contratoService.revertirDevolucionGranel(idDev);
        const esp = oraculo.contratos[ct].items[0];
        esp.devGranel[0].revertido = true;
        const s = stockEsperado[esp.ref];
        s.alquilada += 6; s.danada -= 2; s.perdida -= 2;
      });
      devolver('ESC 19', ct, 'devolver todo bien al día siguiente', [{ id_detalle: det, estado_devolucion: 'bien' }], D(5));
    }
  }
}

// ESC 20: anular pago
registrarEsc('ESC 20');
{
  const ct = crear('ESC 20', 'anular pago', { salida: D(0), devPactada: D(4), items: itemsIndividual(['RTO-01']) });
  if (ct) {
    const r1 = pagar('ESC 20', ct, 'pago 60', 60, 'plin', 'saldo');
    const idPago = r1.resultado ? r1.resultado.id : null;
    if (idPago) {
      accion('ESC 20', ct, 'anular pago', () => {
        contratoService.anularPago(idPago, 'prueba oráculo');
        const p = oraculo.contratos[ct].pagos.find(x => x.id === idPago);
        if (p) p.anulado = true;
      });
    }
  }
}

// ESC 21: mora larga individual (pactada 6 días, devuelve 10 días tarde)
registrarEsc('ESC 21');
{
  const ct = crear('ESC 21', 'mora larga', { salida: D(0), devPactada: D(6), items: itemsIndividual(['AML-02']) });
  if (ct) devolver('ESC 21', ct, 'devolver 4 días tarde', [{ id_detalle: oraculo.contratos[ct].items[0].detalleId, estado_devolucion: 'bien' }], D(10));
}

/* ================================================================
   ESCENARIOS MASIVOS — combinaciones mixtas para estresar el sistema
   ================================================================ */

// Generador que cicla por todas las instancias (CATS-01 a CATS-10)
const CATS = ['RTO','TAL','AML','SIE','SIB','CAL','LIJ','LJB','ROZ','PUL','FRE','ATL','TRO','HOR','COM','API','REV','VIB','MAR','CRC','CRL','CRV','GEN','GRE','BOM','MBO','HID','CMP','CPI','SOL','SOG','CIZ','DOB','MOS','NIL','TEO','ETT','ESC','LAM','PRO','VEN','ASP','PUN','CAR','PIS','PIN','TER','MOG','DOT','BUG'];
function toolRef(idx) { const c = CATS[idx % CATS.length]; return c + '-' + String((idx % 10) + 1).padStart(2, '0'); }

const GRANS = ['G-TAB','G-CEM','G-ARE','G-MAD','G-F12','G-LKK','G-PCH','G-ARG','G-CLV','G-ALM','G-CAL','G-HSE','G-F38','G-TR6','G-TR1','G-PV2','G-PV3','G-PV1','G-MBO','G-SOG','G-PAT','G-PLA','G-CRU','G-CAS','G-GUA','G-DC7','G-DD7','G-THI','G-PEG','G-YES'];
const KITS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];

function armarItems(esp) {
  const r = [];
  for (const e of esp) {
    if (e.t === 'i') r.push({ tipo_item:'individual', id_herramienta: toolRef(e.x), tarifa:'dia' });
    else if (e.t === 'g') r.push(itemGranel(e.ref, e.c || 10));
    else if (e.t === 'k') r.push({ tipo_item:'kit', id_kit: e.id, cantidad:1, tarifa:'dia' });
  }
  return r;
}

function crearYDev(esc, nom, esp, pg, dd, ests, cliIdx) {
  const items = armarItems(esp);
  const ct = crearConCliente(esc, nom, { salida:D(0), devPactada:D(4), items }, cliIdx != null ? cliIds[cliIdx % cliIds.length] : clienteId);
  if (!ct) return null;
  if (pg) pagar(esc, ct, 'pago', pg, 'efectivo', 'saldo');
  const di = [];
  for (let i = 0; i < items.length; i++) {
    const did = oraculo.contratos[ct].items[i].detalleId;
    const es = ests && ests[i] ? ests[i] : { s:'b' };
    if (items[i].tipo_item === 'granel') {
      if (es.s === 'm') {
        di.push({ id_detalle:did, estado_devolucion:'bien', cantidad_devuelta:es.b||Math.floor(es.c/2) });
        di.push({ id_detalle:did, estado_devolucion:'dañado', cantidad_devuelta:es.d||Math.floor(es.c/4), costo_reparacion:es.cr||5 });
        di.push({ id_detalle:did, estado_devolucion:'perdido', cantidad_devuelta:es.p||Math.ceil(es.c/4), costo_perdida:es.cp||10 });
      } else di.push({ id_detalle:did, estado_devolucion:es.s==='b'?'bien':es.s==='d'?'dañado':'perdido' });
    } else {
      const o = { id_detalle:did, estado_devolucion:es.s==='b'?'bien':es.s==='d'?'dañado':'perdido' };
      if (es.s === 'd') { o.costo_reparacion = es.cr||10; o.danos = [{nombre:'golpe',costo:es.cr||10}]; }
      if (es.s === 'p') o.costo_perdida = es.cp||100;
      di.push(o);
    }
  }
  devolver(esc, ct, 'dev', di, D(dd));
  return ct;
}

// ESC 22: 25 contratos individuales (cada herramienta única gracias a toolRef)
registrarEsc('ESC 22');
{ for (let i = 0; i < 25; i++) {
    crearYDev('ESC 22','loteI'+(i+1),
      [{t:'i',x:100+i},{t:'i',x:113+i},{t:'i',x:127+i}],
      30+i*5, 4+(i%5),
      [{s:i%7===0?'d':'b',cr:15},{s:i%5===0?'p':'b',cp:200},{s:'b'}], i);
}}

// ESC 23: 25 contratos granel
registrarEsc('ESC 23');
{ for (let i = 0; i < 25; i++) {
    const g1 = GRANS[i%GRANS.length], g2 = i%2===0 ? GRANS[(i+5)%GRANS.length] : null;
    if (!granelIds[g1]) continue; // skip si el granel no se resolvió
    const c1 = 5+i*3;
    const esp = [{t:'g',ref:g1,c:c1}];
    if (g2) { if (!granelIds[g2]) continue; esp.push({t:'g',ref:g2,c:3+i*2}); }
    if (i%4===0) {
      crearYDev('ESC 23','loteG'+(i+1), esp, 10+i*3, 4+(i%6),
        [{s:'m',c:c1,b:Math.floor(c1/2),d:Math.floor(c1/3),p:Math.ceil(c1/6),cr:8,cp:20},g2?{s:'b'}:null].filter(Boolean), i);
    } else {
      crearYDev('ESC 23','loteG'+(i+1), esp, 10+i*3, 4+(i%6), [{s:'b'},g2?{s:'b'}:null].filter(Boolean), i);
    }
}}

// ESC 24: 25 contratos kits
registrarEsc('ESC 24');
{ for (let i = 0; i < 25; i++) {
    const k1 = KITS[i%KITS.length], k2 = i%3===0 ? KITS[(i+7)%KITS.length] : null;
    const esp = [{t:'k',id:k1}];
    if (k2) esp.push({t:'k',id:k2});
    const ests = [{s:i%6===0?'d':'b',cr:25}];
    if (k2) ests.push({s:i%8===0?'p':'b',cp:500});
    crearYDev('ESC 24','loteK'+(i+1), esp, 40+i*8, 4+(i%5), ests, i);
}}

// ESC 25: 15 contratos mixtos (herramienta + granel + kit)
registrarEsc('ESC 25');
{ for (let i = 0; i < 15; i++) {
    crearYDev('ESC 25','loteM'+(i+1),
      [{t:'i',x:100+i},{t:'i',x:130+i},{t:'g',ref:GRANS[(i+2)%GRANS.length],c:8+i*2},{t:'k',id:KITS[(i+5)%KITS.length]}],
      50+i*10, 4+(i%5),
      [{s:i%5===0?'d':'b',cr:12},{s:i%7===0?'p':'b',cp:150},
       {s:i%4===0?'m':'b',c:8+i*2,b:Math.floor((8+i*2)/2),d:Math.floor((8+i*2)/4),p:Math.ceil((8+i*2)/4),cr:6,cp:15},
       {s:i%6===0?'d':'b',cr:20}], i);
}}

// ESC 26: 10 contratos con pagos por item
registrarEsc('ESC 26');
{ for (let i = 0; i < 10; i++) {
    const esp = [{t:'i',x:100+i},{t:'i',x:120+i},{t:'g',ref:GRANS[(i+3)%GRANS.length],c:10+i}];
    if (!granelIds[esp[2].ref]) continue; // skip si el granel no se resolvió
    const ct = crearConCliente('ESC 26','pagoX'+(i+1), { salida:D(0), devPactada:D(4), items:armarItems(esp) }, cliIds[i % cliIds.length]);
    if (ct) {
      pagar('ESC 26',ct,'p0',20+i*2,'yape','saldo',oraculo.contratos[ct].items[0].detalleId);
      pagar('ESC 26',ct,'p1',15+i*3,'plin','saldo',oraculo.contratos[ct].items[1].detalleId);
      pagar('ESC 26',ct,'pg',30+i*2,'efectivo','saldo');
      const dd = 4+(i%4);
      const di = [
        { id_detalle:oraculo.contratos[ct].items[0].detalleId, estado_devolucion:'bien' },
        { id_detalle:oraculo.contratos[ct].items[1].detalleId, estado_devolucion:i%3===0?'dañado':'bien', ...(i%3===0?{costo_reparacion:10}:{}) },
        { id_detalle:oraculo.contratos[ct].items[2].detalleId, estado_devolucion:'bien' },
      ];
      devolver('ESC 26',ct,'dev',di,D(dd));
    }
}}

// ESC 27: Mega 30 herramientas en un solo contrato
registrarEsc('ESC 27');
{ const esp = []; for (let i = 0; i < 30; i++) esp.push({t:'i',x:100+i});
  const ct = crear('ESC 27','mega30', { salida:D(0), devPactada:D(5), items:armarItems(esp) });
  if (ct) {
    pagar('ESC 27',ct,'adelanto',500,'efectivo','adelanto');
    const di = []; for (let i = 0; i < 30; i++) di.push({ id_detalle:oraculo.contratos[ct].items[i].detalleId, estado_devolucion:'bien' });
    devolver('ESC 27',ct,'dev30',di,D(8));
  }
}

/* ================================================================
   SALIDA CSV
   ================================================================ */
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(__dirname);
const fBit = path.join(dir, 'oracle_bitacora_' + ts + '.csv');
const fItems = path.join(dir, 'oracle_items_' + ts + '.csv');

const headBit = ['id', 'timestamp', 'escenario', 'contrato_id', 'accion', 'resultado', 'error',
  'estado_antes', 'estado_despues', 'estado_esperado',
  'total_contrato_sistema', 'total_pagado_sistema', 'total_pagado_esperado',
  'garantia_sistema', 'garantia_esperada',
  'total_base_sistema', 'total_base_esperado',
  'total_atraso_sistema', 'total_atraso_mostrado', 'total_atraso_negocio',
  'total_danos_sistema', 'total_danos_negocio',
  'total_perdidas_sistema', 'total_perdidas_esperado',
  'total_general_sistema', 'total_general_esperado',
  'saldo_sistema', 'saldo_esperado', 'mora_cobrada', 'notas', 'num_discrepancias', 'discrepancias'];

const headItems = ['id', 'accion_id', 'escenario', 'contrato_id', 'item_id', 'codigo', 'nombre', 'tipo', 'cantidad', 'tarifa',
  'precio_dia_aplicado', 'mora_dia_aplicada', 'dias_habiles',
  'dias_atraso_mostrado', 'dias_atraso_negocio',
  'total_sistema', 'total_esperado',
  'mora_sistema', 'mora_mostrada', 'mora_negocio',
  'pagado_item', 'saldo_sistema', 'saldo_esperado',
  'estado_sistema', 'estado_esperado',
  'granel_pendiente_sistema', 'granel_pendiente_esperado',
  'fecha_dev_sistema', 'fecha_dev_esperada', 'resultado', 'num_discrepancias', 'discrepancias'];

function escribirCsv(pathF, head, filas, getRow) {
  const lines = [head.map(csv).join(',')];
  for (const f of filas) lines.push(head.map(c => csv(getRow(f, c))).join(','));
  fs.writeFileSync(pathF, '\uFEFF' + lines.join('\r\n'), 'utf8');
}

escribirCsv(fBit, headBit, bitacora, (r, c) => {
  const m = {
    id: r.id, timestamp: r.ts, escenario: r.escenario, contrato_id: r.contrato, accion: r.accion,
    resultado: r.resultado, error: r.error, estado_antes: r.estadoAntes, estado_despues: r.estadoDespues,
    estado_esperado: r.estadoEsperado, total_contrato_sistema: f2(r.totalContratoSistema),
    total_pagado_sistema: f2(r.totalPagadoSistema), total_pagado_esperado: f2(r.totalPagadoEsperado),
    garantia_sistema: f2(r.garantiaSistema), garantia_esperada: f2(r.garantiaEsperada),
    total_base_sistema: f2(r.totalBaseSistema), total_base_esperado: f2(r.totalBaseEsperado),
    total_atraso_sistema: f2(r.totalAtrasoSistema), total_atraso_mostrado: f2(r.totalAtrasoMostrado),
    total_atraso_negocio: f2(r.totalAtrasoNegocio),
    total_danos_sistema: f2(r.totalDanosSistema), total_danos_negocio: f2(r.totalDanosNegocio),
    total_perdidas_sistema: f2(r.totalPerdidasSistema), total_perdidas_esperado: f2(r.totalPerdidasEsperado),
    total_general_sistema: f2(r.totalGeneralSistema), total_general_esperado: f2(r.totalGeneralEsperado),
    saldo_sistema: f2(r.saldoSistema), saldo_esperado: f2(r.saldoEsperado),
    mora_cobrada: f2(r.moraCobrada), notas: r.notas,
    num_discrepancias: r.numDiscrepancias, discrepancias: r.discrepancias,
  };
  return m[c];
});

escribirCsv(fItems, headItems, itemsLog, (r, c) => {
  const m = {
    id: itemsLog.indexOf(r) + 1, accion_id: r.accionId, escenario: r.escenario, contrato_id: r.contrato,
    item_id: r.itemId, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, cantidad: r.cantidad, tarifa: r.tarifa,
    precio_dia_aplicado: f2(r.precioDia), mora_dia_aplicada: f2(r.moraDia), dias_habiles: r.diasHabiles,
    dias_atraso_mostrado: r.diasAtrasoMostrado, dias_atraso_negocio: r.diasAtrasoNegocio,
    total_sistema: f2(r.totalSistema), total_esperado: f2(r.totalEsperado),
    mora_sistema: f2(r.moraSistema), mora_mostrada: f2(r.moraMostrada), mora_negocio: f2(r.moraNegocio),
    pagado_item: f2(r.pagadoItem), saldo_sistema: f2(r.saldoSistema), saldo_esperado: f2(r.saldoEsperado),
    estado_sistema: r.estadoSistema, estado_esperado: r.estadoEsperado,
    granel_pendiente_sistema: r.granelPendienteSistema, granel_pendiente_esperado: r.granelPendienteEsperado,
    fecha_dev_sistema: r.fechaDevSistema, fecha_dev_esperada: r.fechaDevEsperada,
    resultado: r.resultado, num_discrepancias: r.discrepancias.length, discrepancias: r.discrepancias.join(' | '),
  };
  return m[c];
});

/* ================================================================
   RESUMEN EN TERMINAL
   ================================================================ */
let totalDis = 0, totalAcc = 0, totalRech = 0;
console.log('\n' + '═'.repeat(72));
console.log('ORÁCULO DE AUDITORÍA — RESUMEN');
console.log('═'.repeat(72));
for (const [esc, r] of Object.entries(resumenEsc)) {
  totalDis += r.discrepancias; totalAcc += r.acciones; totalRech += r.rechazados;
  const marca = r.discrepancias > 0 ? '⚠ ' + r.discrepancias + ' discrep.' : '✔ sin discrepancias';
  console.log(`\n${esc}  (${r.acciones} acciones, ${r.rechazados} rechazadas)  →  ${marca}`);
  if (r.lista.length && r.lista.length <= 12) {
    for (const l of r.lista.slice(0, 12)) console.log('    · ' + l);
  } else if (r.lista.length > 12) {
    for (const l of r.lista.slice(0, 8)) console.log('    · ' + l);
    console.log('    · … y ' + (r.lista.length - 8) + ' más (ver CSV)');
  }
}
console.log('\n' + '═'.repeat(72));
console.log(`TOTAL: ${totalAcc} acciones | ${totalRech} rechazadas (esperadas) | ${totalDis} discrepancias detectadas`);
console.log(`Bitácora: ${fBit}`);
console.log(`Detalle ítems: ${fItems}`);
if (USE_REAL_DB) {
  console.log('────────────────────────────────────────────────────────');
  console.log('Datos de prueba insertados en la BD REAL: ' + REAL_DB_PATH);
  console.log('Restaurar la BD original:');
  console.log('  cp ' + BACKUP_PATH + ' ' + REAL_DB_PATH);
  console.log('  rm -f ' + REAL_DB_PATH + '-wal ' + REAL_DB_PATH + '-shm');
}
console.log('═'.repeat(72));
