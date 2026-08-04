const db = require('./database');
const crypto = require('crypto');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS CATEGORIA_HERRAMIENTA (
      id TEXT PRIMARY KEY NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_minimo REAL CHECK (precio_minimo >= 0),
      precio_mes REAL CHECK (precio_mes >= 0),
      precio_venta REAL CHECK (precio_venta >= 0)
    );

    CREATE TABLE IF NOT EXISTS HERRAMIENTA (
      id TEXT PRIMARY KEY NOT NULL,
      id_categoria TEXT NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_dia REAL NOT NULL CHECK (precio_dia >= 0),
      precio_minimo REAL CHECK (precio_minimo >= 0),
      precio_mes REAL CHECK (precio_mes >= 0),
      precio_venta REAL CHECK (precio_venta >= 0),
      valor_reposicion REAL CHECK (valor_reposicion >= 0),
      estado TEXT NOT NULL CHECK (estado IN ('disponible', 'alquilado', 'mantenimiento', 'malogrado')),
      fecha_adquisicion TEXT,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
      FOREIGN KEY (id_categoria) REFERENCES CATEGORIA_HERRAMIENTA(id)
    );

    CREATE TABLE IF NOT EXISTS ITEM_GRANEL (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      condicion TEXT NOT NULL CHECK (condicion IN ('nuevo', 'usado')),
      precio_dia REAL NOT NULL CHECK (precio_dia >= 0),
      precio_minimo REAL CHECK (precio_minimo >= 0),
      precio_mes REAL CHECK (precio_mes >= 0),
      precio_venta REAL CHECK (precio_venta >= 0),
      cantidad_total INTEGER NOT NULL CHECK (cantidad_total >= 0),
      cantidad_disponible INTEGER NOT NULL CHECK (cantidad_disponible >= 0 AND cantidad_disponible <= cantidad_total),
      cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0),
      cantidad_alquilada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_alquilada >= 0),
      cantidad_perdida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_perdida >= 0),
      cantidad_vendida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0),
      cantidad_baja INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_baja >= 0),
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS CLIENTE (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'empresa')),
      nombre TEXT NOT NULL,
      dni TEXT UNIQUE CHECK (dni IS NULL OR (length(dni) = 8 AND typeof(CAST(dni AS INTEGER)) = 'integer')),
      ruc TEXT UNIQUE CHECK (ruc IS NULL OR (length(ruc) = 11 AND typeof(CAST(ruc AS INTEGER)) = 'integer')),
      telefono TEXT,
      direccion TEXT,
      email TEXT,
      en_lista_negra INTEGER NOT NULL DEFAULT 0 CHECK (en_lista_negra IN (0, 1)),
      notas_riesgo TEXT,
      fecha_registro TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
      CHECK (
        (tipo = 'persona' AND dni NOT NULL AND ruc IS NULL) OR
        (tipo = 'empresa' AND ruc NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS USUARIO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin', 'empleado')),
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS CONTRATO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cliente INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      fecha_salida TEXT NOT NULL,
      fecha_devolucion_pactada TEXT NOT NULL,
      fecha_devolucion_real TEXT,
      estado TEXT NOT NULL DEFAULT 'alquilado' CHECK (estado IN ('reservado', 'alquilado', 'atrasado', 'devuelto', 'devolución incompleta')),
      deposito_dni INTEGER NOT NULL DEFAULT 0 CHECK (deposito_dni IN (0, 1)),
      deposito_monto REAL NOT NULL DEFAULT 0 CHECK (deposito_monto >= 0),
      firma_digital_path TEXT,
      notas TEXT,
      fecha_modificacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (id_cliente) REFERENCES CLIENTE(id),
      FOREIGN KEY (id_usuario) REFERENCES USUARIO(id)
    );

    CREATE TABLE IF NOT EXISTS DETALLE_CONTRATO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contrato INTEGER NOT NULL,
      tipo_item TEXT NOT NULL CHECK (tipo_item IN ('individual', 'granel')),
      id_herramienta TEXT,
      id_item_granel INTEGER,
      cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
      precio_dia_aplicado REAL NOT NULL CHECK (precio_dia_aplicado >= 0),
      estado_devolucion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_devolucion IN ('pendiente', 'bien', 'dañado', 'no devuelto', 'perdido')),
      fecha_devolucion_real TEXT,
      fecha_devolucion_pactada_item TEXT,
      total_item_snapshot REAL,
      costo_perdida REAL CHECK (costo_perdida >= 0),
      FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id),
      FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA(id),
      FOREIGN KEY (id_item_granel) REFERENCES ITEM_GRANEL(id),
      CHECK (
        (tipo_item = 'individual' AND id_herramienta NOT NULL AND id_item_granel IS NULL AND cantidad = 1) OR
        (tipo_item = 'granel' AND id_item_granel NOT NULL AND id_herramienta IS NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS PAGO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contrato INTEGER NOT NULL,
      monto REAL NOT NULL CHECK (monto >= 0),
      fecha_pago TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'yape', 'plin')),
      tipo TEXT NOT NULL CHECK (tipo IN ('adelanto', 'saldo', 'mora', 'deposito', 'devolucion_deposito')),
      comprobante TEXT NOT NULL DEFAULT 'recibo interno' CHECK (comprobante IN ('recibo interno', 'boleta_sunat', 'factura_sunat')),
      notas TEXT,
      FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id)
    );

    CREATE TABLE IF NOT EXISTS MANTENIMIENTO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_herramienta TEXT NOT NULL,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT,
      descripcion TEXT NOT NULL,
      costo REAL CHECK (costo >= 0),
      tipo TEXT NOT NULL CHECK (tipo IN ('preventivo', 'correctivo')),
      FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA(id)
    );

    CREATE TABLE IF NOT EXISTS CONFIGURACION (
      clave TEXT PRIMARY KEY NOT NULL,
      valor TEXT NOT NULL,
      descripcion TEXT
    );

    CREATE TABLE IF NOT EXISTS CALIFICACION_CLIENTE (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contrato INTEGER NOT NULL UNIQUE,
      id_cliente INTEGER NOT NULL,
      estrellas INTEGER NOT NULL CHECK (estrellas >= 1 AND estrellas <= 5),
      comentario TEXT,
      FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id),
      FOREIGN KEY (id_cliente) REFERENCES CLIENTE(id)
    );

    CREATE TABLE IF NOT EXISTS AUDIT_GRANEL (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      accion TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      prev_total INTEGER NOT NULL DEFAULT 0,
      prev_alquilada INTEGER NOT NULL DEFAULT 0,
      prev_danada INTEGER NOT NULL DEFAULT 0,
      prev_perdida INTEGER NOT NULL DEFAULT 0,
      prev_vendida INTEGER NOT NULL DEFAULT 0,
      prev_baja INTEGER NOT NULL DEFAULT 0,
      new_total INTEGER NOT NULL DEFAULT 0,
      new_alquilada INTEGER NOT NULL DEFAULT 0,
      new_danada INTEGER NOT NULL DEFAULT 0,
      new_perdida INTEGER NOT NULL DEFAULT 0,
      new_vendida INTEGER NOT NULL DEFAULT 0,
      new_baja INTEGER NOT NULL DEFAULT 0,
      revertido INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (item_id) REFERENCES ITEM_GRANEL(id)
    );

    CREATE TABLE IF NOT EXISTS DEVOLUCION_GRANEL (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contrato INTEGER NOT NULL,
      id_item_granel INTEGER NOT NULL,
      fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      cantidad_bien INTEGER NOT NULL DEFAULT 0,
      cantidad_danada INTEGER NOT NULL DEFAULT 0,
      cantidad_perdida INTEGER NOT NULL DEFAULT 0,
      costo_reparacion REAL,
      costo_perdida REAL,
      revertido INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id),
      FOREIGN KEY (id_item_granel) REFERENCES ITEM_GRANEL(id)
    );
  `);

  // Migración: agregar columnas de precio/mora a CATEGORIA_HERRAMIENTA
  try { db.exec("ALTER TABLE CATEGORIA_HERRAMIENTA ADD COLUMN precio_dia REAL NOT NULL DEFAULT 0"); } catch {}

  // Migración: agregar fecha_modificacion a CONTRATO
  try { db.exec("ALTER TABLE CONTRATO ADD COLUMN fecha_modificacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))"); } catch {}

  // Migración: agregar id_detalle a PAGO para pagos por ítem
  try { db.exec("ALTER TABLE PAGO ADD COLUMN id_detalle INTEGER REFERENCES DETALLE_CONTRATO(id)"); } catch {}

  // Migración: agregar id_detalle a DEVOLUCION_GRANEL para vincular cada entrada al detalle exacto
  try { db.exec("ALTER TABLE DEVOLUCION_GRANEL ADD COLUMN id_detalle INTEGER REFERENCES DETALLE_CONTRATO(id)"); } catch {}

  // Migración: agregar columnas de anulación a PAGO
  try { db.exec("ALTER TABLE PAGO ADD COLUMN anulado INTEGER DEFAULT 0 CHECK (anulado IN (0, 1))"); } catch {}
  try { db.exec("ALTER TABLE PAGO ADD COLUMN fecha_anulacion TEXT"); } catch {}
  try { db.exec("ALTER TABLE PAGO ADD COLUMN motivo_anulacion TEXT"); } catch {}

  // Migración: agregar grupo_pago a PAGO para pagos distribuidos
  try { db.exec("ALTER TABLE PAGO ADD COLUMN grupo_pago TEXT"); } catch {}

  // Migración: agregar cantidad_danada a ITEM_GRANEL para control de dañados
  try { db.exec("ALTER TABLE ITEM_GRANEL ADD COLUMN cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0)"); } catch {}

  // Migración: agregar cantidad_alquilada, cantidad_perdida, cantidad_vendida, cantidad_baja
  try { db.exec("ALTER TABLE ITEM_GRANEL ADD COLUMN cantidad_alquilada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_alquilada >= 0)"); } catch {}
  try { db.exec("ALTER TABLE ITEM_GRANEL ADD COLUMN cantidad_perdida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_perdida >= 0)"); } catch {}
  try { db.exec("ALTER TABLE ITEM_GRANEL ADD COLUMN cantidad_vendida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0)"); } catch {}
  try { db.exec("ALTER TABLE ITEM_GRANEL ADD COLUMN cantidad_baja INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_baja >= 0)"); } catch {}

  // Migración: convertir timestamps guardados en UTC a hora local (una sola vez).
  // Los valores con hora fueron generados por CURRENT_TIMESTAMP / datetime('now'), que devuelven UTC.
  // Aplica datetime(..., 'localtime') para desplazarlos a la hora local del equipo (ej. Perú, UTC-5).
  try {
    const tzMigrado = db.prepare(
      `SELECT valor FROM CONFIGURACION WHERE clave = 'tz_local_migrated'`
    ).get();
    if (!tzMigrado) {
      const colPago = new Set(db.prepare('PRAGMA table_info(PAGO)').all().map(c => c.name));
      const colContrato = new Set(db.prepare('PRAGMA table_info(CONTRATO)').all().map(c => c.name));

      const updates = [];
      if (colPago.has('fecha_pago')) {
        updates.push("UPDATE PAGO SET fecha_pago = datetime(fecha_pago, 'localtime') WHERE fecha_pago LIKE '____-__-__ __:%'");
      }
      if (colPago.has('fecha_anulacion')) {
        updates.push("UPDATE PAGO SET fecha_anulacion = datetime(fecha_anulacion, 'localtime') WHERE fecha_anulacion LIKE '____-__-__ __:%'");
      }
      if (colContrato.has('fecha_creacion')) {
        updates.push("UPDATE CONTRATO SET fecha_creacion = datetime(fecha_creacion, 'localtime') WHERE fecha_creacion LIKE '____-__-__ __:%'");
      }
      if (colContrato.has('fecha_modificacion')) {
        updates.push("UPDATE CONTRATO SET fecha_modificacion = datetime(fecha_modificacion, 'localtime') WHERE fecha_modificacion LIKE '____-__-__ __:%'");
      }

      for (const sql of updates) db.exec(sql);

      db.prepare(
        `INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion) VALUES (?, ?, ?)`
      ).run('tz_local_migrated', 'true', 'Timestamps convertidos de UTC a hora local');
      console.log('[DB] Migración de zona horaria completada (UTC → local).');
    }
  } catch (err) {
    console.error('[DB] Error en migración de zona horaria:', err);
  }

  // Inicializar cantidad_alquilada desde contratos activos (migración única)
  try {
    db.exec(`
      UPDATE ITEM_GRANEL
      SET cantidad_alquilada = COALESCE((
        SELECT SUM(dc.cantidad)
        FROM DETALLE_CONTRATO dc
        JOIN CONTRATO c ON dc.id_contrato = c.id
        WHERE dc.id_item_granel = ITEM_GRANEL.id
          AND dc.estado_devolucion = 'pendiente'
          AND c.estado IN ('alquilado', 'atrasado', 'reservado')
      ), 0)
      WHERE activo = 1
    `);
  } catch (err) {
    console.error('[DB] Error inicializando cantidad_alquilada:', err);
  }

  // Migración: agregar costo_perdida a DETALLE_CONTRATO
  try { db.exec("ALTER TABLE DETALLE_CONTRATO ADD COLUMN costo_perdida REAL CHECK (costo_perdida >= 0)"); } catch {}

  // Migración: agregar estado 'perdido' a DETALLE_CONTRATO (recrear tabla si el CHECK no lo incluye)
  try {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE name='DETALLE_CONTRATO' AND type='table'").get();
    if (ddl && !ddl.sql.includes("'perdido'")) {
      db.exec("PRAGMA foreign_keys = OFF");
      db.exec(`
        CREATE TABLE DETALLE_CONTRATO_NEW (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          id_contrato INTEGER NOT NULL,
          tipo_item TEXT NOT NULL CHECK (tipo_item IN ('individual', 'granel')),
          id_herramienta TEXT,
          id_item_granel INTEGER,
          cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
          precio_dia_aplicado REAL NOT NULL CHECK (precio_dia_aplicado >= 0),
          estado_devolucion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_devolucion IN ('pendiente', 'bien', 'dañado', 'no devuelto', 'perdido')),
          fecha_devolucion_real TEXT,
          fecha_devolucion_pactada_item TEXT,
          total_item_snapshot REAL,
          costo_perdida REAL CHECK (costo_perdida >= 0),
          FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id),
          FOREIGN KEY (id_herramienta) REFERENCES HERRAMIENTA(id),
          FOREIGN KEY (id_item_granel) REFERENCES ITEM_GRANEL(id),
          CHECK (
            (tipo_item = 'individual' AND id_herramienta NOT NULL AND id_item_granel IS NULL AND cantidad = 1) OR
            (tipo_item = 'granel' AND id_item_granel NOT NULL AND id_herramienta IS NULL)
          )
        )
      `);
      db.exec("INSERT INTO DETALLE_CONTRATO_NEW SELECT * FROM DETALLE_CONTRATO");
      db.exec("DROP TABLE DETALLE_CONTRATO");
      db.exec("ALTER TABLE DETALLE_CONTRATO_NEW RENAME TO DETALLE_CONTRATO");
      db.exec("PRAGMA foreign_keys = ON");
    }
  } catch (err) {
    console.error('[DB] Error migrando DETALLE_CONTRATO (perdido):', err);
  }

  try {
    db.exec(`DROP TRIGGER IF EXISTS trg_update_contrato_mod`);
  } catch (err) {
    console.error('[DB] Error eliminando trigger trg_update_contrato_mod:', err);
  }

  // Trigger: recalcular cantidad_disponible automáticamente en ITEM_GRANEL
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_granel_disponible
      AFTER UPDATE OF cantidad_alquilada, cantidad_danada, cantidad_perdida, cantidad_vendida, cantidad_baja, cantidad_total ON ITEM_GRANEL
      BEGIN
        UPDATE ITEM_GRANEL
        SET cantidad_disponible = NEW.cantidad_total - NEW.cantidad_alquilada - NEW.cantidad_danada - NEW.cantidad_perdida - NEW.cantidad_vendida - NEW.cantidad_baja
        WHERE id = NEW.id;
      END;
    `);
  } catch (err) {
    console.error('[DB] Error creando trigger trg_granel_disponible:', err);
  }

  // Trigger: verificar que disponible no sea negativa en INSERT
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_granel_disponible_insert
      AFTER INSERT ON ITEM_GRANEL
      BEGIN
        UPDATE ITEM_GRANEL
        SET cantidad_disponible = NEW.cantidad_total - NEW.cantidad_alquilada - NEW.cantidad_danada - NEW.cantidad_perdida - NEW.cantidad_vendida - NEW.cantidad_baja
        WHERE id = NEW.id;
      END;
    `);
  } catch (err) {
    console.error('[DB] Error creando trigger trg_granel_disponible_insert:', err);
  }

  // Migración: crear AUDIT_GRANEL si no existe (para bases de datos existentes)
  try {
    const hasAudit = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AUDIT_GRANEL'").get();
    if (!hasAudit) {
      db.exec(`
        CREATE TABLE AUDIT_GRANEL (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          accion TEXT NOT NULL,
          cantidad INTEGER NOT NULL DEFAULT 0,
          prev_total INTEGER NOT NULL DEFAULT 0,
          prev_alquilada INTEGER NOT NULL DEFAULT 0,
          prev_danada INTEGER NOT NULL DEFAULT 0,
          prev_perdida INTEGER NOT NULL DEFAULT 0,
          prev_vendida INTEGER NOT NULL DEFAULT 0,
          prev_baja INTEGER NOT NULL DEFAULT 0,
          new_total INTEGER NOT NULL DEFAULT 0,
          new_alquilada INTEGER NOT NULL DEFAULT 0,
          new_danada INTEGER NOT NULL DEFAULT 0,
          new_perdida INTEGER NOT NULL DEFAULT 0,
          new_vendida INTEGER NOT NULL DEFAULT 0,
          new_baja INTEGER NOT NULL DEFAULT 0,
          revertido INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (item_id) REFERENCES ITEM_GRANEL(id)
        )
      `);
    }
  } catch (err) {
    console.error('[DB] Error creando AUDIT_GRANEL:', err);
  }

  // Siempre actualizar cláusulas (pueden cambiar entre versiones)
  db.prepare(`INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion) VALUES (?, ?, ?)`)
    .run('contrato_clausulas', `Conste por el presente documento que celebra de una parte como ARRENDADORA la Sr(a). [ARRENDADORA_NOMBRE], identificada con DNI N° [ARRENDADORA_DNI], con domicilio en [ARRENDADORA_DIRECCION], y de la otra parte como ARRENDATARIO el Sr(a). [CLIENTE_NOMBRE], identificado con DNI N° [CLIENTE_DNI], con domicilio en [CLIENTE_DIRECCION], quienes convienen de mutuo acuerdo y regulado por las leyes vigentes sobre la materia, en los términos y condiciones siguientes:

PRIMERO: EL ARRENDADOR es propietario de los equipos y maquinarias de construcción civil ubicado en [ARRENDADORA_DIRECCION], del distrito y provincia de Andahuaylas.

SEGUNDO: EL ARRENDADOR deja constancia que los equipos a que se refiere la cláusula anterior se encuentran en buen estado de conservación y sin mayor desgaste que el producto por uso normal y ordinario.

TERCERO: Mediante el presente contrato el ARRENDADOR da en alquiler al ARRENDATARIO los equipos descritos en la cláusula primera para destinarlo únicamente como alquiler de maquinarias de construcción civil, en el cual es recibido en perfecto estado de operatividad conforme a lo señalado en la cláusula segunda. Por su parte el ARRENDATARIO se obliga a pagar al arrendador el monto de la renta pactada en la cláusula siguiente en la forma y oportunidad convenidas.

CUARTO: Las partes acuerdan que el monto de la renta que pagará el ARRENDATARIO en calidad de contraprestación por el alquiler de equipos y maquinarias de construcción civil asciende a la suma de S/ [TOTAL], por el período comprendido entre [FECHA_INICIO] y [FECHA_DEVOLUCION].

QUINTO: El pago del monto total del alquiler se realizará al momento de la entrega de los equipos o según lo acordado entre las partes. En caso de atraso en la devolución, se aplicará una mora según lo indicado en el detalle de equipos.

SEXTO: En caso de devolución fuera de la fecha pactada, se aplicará una mora por día de atraso según el detalle indicado en la tabla de equipos. El ARRENDATARIO se hace responsable de cualquier daño, pérdida o deterioro de los equipos más allá del desgaste normal de uso.`, 'Cláusulas del contrato de alquiler');
  console.log('[DB] Cláusulas actualizadas correctamente.');

  // --- Datos semilla (solo primera vez) ---

  const yaSembrado = db.prepare(
    "SELECT valor FROM CONFIGURACION WHERE clave = 'db_seeded'"
  ).get();

  if (yaSembrado && yaSembrado.valor === 'true') {
    console.log('[DB] Semillas ya aplicadas — omitiendo.');
    return;
  }

  const passwordSalt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync('admin', passwordSalt, 64);
  const adminHash =
    passwordSalt.toString('hex') + ':' + passwordHash.toString('hex');

  const insertCategoria = db.prepare(
    `INSERT OR IGNORE INTO CATEGORIA_HERRAMIENTA (id, nombre, descripcion) VALUES (?, ?, ?)`
  );

  const categorias = [
    ['RTO', 'Roto Martillo', 'Martillo demoledor rotatorio'],
    ['TRO', 'Trompo / Mezcladora', 'Mezcladora de concreto tipo trompo'],
    ['GEN', 'Generador', 'Generador eléctrico portátil'],
    ['COM', 'Compactadora', 'Compactadora de suelos'],
    ['CMP', 'Compresor', 'Compresor de aire'],
    ['AML', 'Amoladora', 'Amoladora angular'],
    ['VIB', 'Vibrador de concreto', 'Vibrador para asentado de concreto'],
    ['ESC', 'Escalera', 'Escalera de aluminio'],
  ];

  const insertSemilla = db.transaction(() => {
    for (const cat of categorias) {
      insertCategoria.run(cat[0], cat[1], cat[2]);
    }

    db.prepare(
      `INSERT OR IGNORE INTO ITEM_GRANEL (nombre, condicion, precio_dia, cantidad_total, cantidad_disponible)
       VALUES (?, ?, ?, ?, ?)`
    ).run('Tabla 3m', 'nuevo', 5.0, 100, 100);

    db.prepare(
      `INSERT OR IGNORE INTO ITEM_GRANEL (nombre, condicion, precio_dia, cantidad_total, cantidad_disponible)
       VALUES (?, ?, ?, ?, ?)`
    ).run('Tabla 3m', 'usado', 3.0, 80, 80);

    db.prepare(
      `INSERT OR IGNORE INTO USUARIO (nombre, password_hash, rol, activo)
       VALUES (?, ?, 'admin', 1)`
    ).run('Administrador', adminHash);
  });

  insertSemilla();

  // Marcar como sembrado para no repetir en futuros inicios
  db.prepare(
    `INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion) VALUES (?, ?, ?)`
  ).run('db_seeded', 'true', 'Indica que los datos semilla ya fueron insertados');

  // Datos de la arrendadora (siempre actualizar)
  const confsArrendadora = [
    ['arrendadora_nombre', 'SOLEDAD SUPANTA QUISPE', 'Nombre completo de la arrendadora'],
    ['arrendadora_dni', '72094861', 'DNI de la arrendadora'],
    ['arrendadora_ruc', '10720948619', 'RUC del negocio'],
    ['arrendadora_direccion', 'Av. Los Pinos N° 348', 'Dirección del negocio'],
    ['arrendadora_telefono', '985618849', 'Teléfono principal'],
    ['arrendadora_telefono2', '936719836', 'Teléfono secundario'],
    ['arrendadora_firma_base64', '', 'Firma de la arrendadora en base64'],
    ['api_reniec_key', '', 'API Key de PeruAPI para consulta RENIEC (configurar en opciones)'],
    ['contrato_clausulas', `Conste por el presente documento que celebra de una parte como ARRENDADORA la Sr(a). [ARRENDADORA_NOMBRE], identificada con DNI N° [ARRENDADORA_DNI], con domicilio en [ARRENDADORA_DIRECCION], y de la otra parte como ARRENDATARIO el Sr(a). [CLIENTE_NOMBRE], identificado con DNI N° [CLIENTE_DNI], con domicilio en [CLIENTE_DIRECCION], quienes convienen de mutuo acuerdo y regulado por las leyes vigentes sobre la materia, en los términos y condiciones siguientes:

PRIMERO: EL ARRENDADOR es propietario de los equipos y maquinarias de construcción civil ubicado en [ARRENDADORA_DIRECCION], del distrito y provincia de Andahuaylas.

SEGUNDO: EL ARRENDADOR deja constancia que los equipos a que se refiere la cláusula anterior se encuentran en buen estado de conservación y sin mayor desgaste que el producto por uso normal y ordinario.

TERCERO: Mediante el presente contrato el ARRENDADOR da en alquiler al ARRENDATARIO los equipos descritos en la cláusula primera para destinarlo únicamente como alquiler de maquinarias de construcción civil, en el cual es recibido en perfecto estado de operatividad conforme a lo señalado en la cláusula segunda. Por su parte el ARRENDATARIO se obliga a pagar al arrendador el monto de la renta pactada en la cláusula siguiente en la forma y oportunidad convenidas.

CUARTO: Las partes acuerdan que el monto de la renta que pagará el ARRENDATARIO en calidad de contraprestación por el alquiler de equipos y maquinarias de construcción civil asciende a la suma de S/ [TOTAL], por el período comprendido entre [FECHA_INICIO] y [FECHA_DEVOLUCION].

QUINTO: El pago del monto total del alquiler se realizará al momento de la entrega de los equipos o según lo acordado entre las partes. En caso de atraso en la devolución, se aplicará una mora según lo indicado en el detalle de equipos.

SEXTO: En caso de devolución fuera de la fecha pactada, se aplicará una mora por día de atraso según el detalle indicado en la tabla de equipos. El ARRENDATARIO se hace responsable de cualquier daño, pérdida o deterioro de los equipos más allá del desgaste normal de uso.`, 'Cláusulas del contrato de alquiler'],
  ];

  const insertConf = db.prepare(
    `INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion) VALUES (?, ?, ?)`
  );

  for (const c of confsArrendadora) {
    insertConf.run(c[0], c[1], c[2]);
  }

  // Migración: DEVOLUCION_GRANEL desde datos existentes
  const migradaDevolucion = db.prepare(
    `SELECT valor FROM CONFIGURACION WHERE clave = 'devolucion_granel_migrada'`
  ).get();
  if (!migradaDevolucion) {
    const filasSplit = db.prepare(`
      SELECT d.id, d.id_contrato, d.id_item_granel, d.cantidad, d.estado_devolucion,
             c.fecha_devolucion_real, c.fecha_creacion
      FROM DETALLE_CONTRATO d
      JOIN CONTRATO c ON c.id = d.id_contrato
      WHERE d.tipo_item = 'granel' AND d.estado_devolucion != 'pendiente'
    `).all();

    const insertMig = db.prepare(`
      INSERT INTO DEVOLUCION_GRANEL (id_contrato, id_item_granel, fecha,
        cantidad_bien, cantidad_danada, cantidad_perdida)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const f of filasSplit) {
      const fecha = f.fecha_devolucion_real || f.fecha_creacion;
      const bien = f.estado_devolucion === 'bien' ? f.cantidad : 0;
      const danada = f.estado_devolucion === 'dañado' ? f.cantidad : 0;
      const perdida = f.estado_devolucion === 'no devuelto' ? f.cantidad : 0;
      insertMig.run(f.id_contrato, f.id_item_granel, fecha, bien, danada, perdida);
    }

    db.prepare(
      `INSERT OR REPLACE INTO CONFIGURACION (clave, valor, descripcion)
       VALUES ('devolucion_granel_migrada', 'true', 'Migración de DEVOLUCION_GRANEL completada')`
    ).run();
  }

  // Migración: backfill id_detalle en DEVOLUCION_GRANEL para entradas con un único detalle posible
  try {
    const sinDetalle = db.prepare(`
      SELECT dg.id, dg.id_contrato, dg.id_item_granel, COUNT(d.id) AS matches
      FROM DEVOLUCION_GRANEL dg
      LEFT JOIN DETALLE_CONTRATO d ON d.id_contrato = dg.id_contrato AND d.id_item_granel = dg.id_item_granel AND d.tipo_item = 'granel'
      WHERE dg.id_detalle IS NULL
      GROUP BY dg.id
    `).all();
    const updateDetalle = db.prepare(`
      UPDATE DEVOLUCION_GRANEL SET id_detalle = (
        SELECT d.id FROM DETALLE_CONTRATO d
        WHERE d.id_contrato = ? AND d.id_item_granel = ? AND d.tipo_item = 'granel'
        LIMIT 1
      ) WHERE id = ?
    `);
    for (const row of sinDetalle) {
      if (row.matches === 1) {
        updateDetalle.run(row.id_contrato, row.id_item_granel, row.id);
      }
    }
    if (sinDetalle.length > 0) {
      console.log('[DB] Backfill id_detalle DEVOLUCION_GRANEL: ' + sinDetalle.filter(r => r.matches === 1).length + ' actualizadas, ' + sinDetalle.filter(r => r.matches !== 1).length + ' omitidas (múltiples matches)');
    }
  } catch (e) {
    console.log('[DB] Error en backfill id_detalle DEVOLUCION_GRANEL (no crítico):', e.message);
  }

  console.log('[DB] Base de datos inicializada correctamente.');
}

module.exports = { initDatabase };
