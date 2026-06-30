const db = require('./database');
const crypto = require('crypto');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS CATEGORIA_HERRAMIENTA (
      id TEXT PRIMARY KEY NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT
    );

    CREATE TABLE IF NOT EXISTS HERRAMIENTA (
      id TEXT PRIMARY KEY NOT NULL,
      id_categoria TEXT NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_dia REAL NOT NULL CHECK (precio_dia >= 0),
      mora_dia REAL NOT NULL CHECK (mora_dia >= 0),
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
      mora_dia REAL NOT NULL CHECK (mora_dia >= 0),
      cantidad_total INTEGER NOT NULL CHECK (cantidad_total >= 0),
      cantidad_disponible INTEGER NOT NULL CHECK (cantidad_disponible >= 0 AND cantidad_disponible <= cantidad_total),
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
      fecha_registro TEXT NOT NULL DEFAULT CURRENT_DATE,
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
      fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_salida TEXT NOT NULL,
      fecha_devolucion_pactada TEXT NOT NULL,
      fecha_devolucion_real TEXT,
      estado TEXT NOT NULL DEFAULT 'alquilado' CHECK (estado IN ('reservado', 'alquilado', 'atrasado', 'devuelto', 'devolución incompleta')),
      deposito_dni INTEGER NOT NULL DEFAULT 0 CHECK (deposito_dni IN (0, 1)),
      deposito_monto REAL NOT NULL DEFAULT 0 CHECK (deposito_monto >= 0),
      firma_digital_path TEXT,
      notas TEXT,
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
      mora_dia_aplicada REAL NOT NULL CHECK (mora_dia_aplicada >= 0),
      estado_devolucion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_devolucion IN ('pendiente', 'bien', 'dañado', 'no devuelto')),
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
      fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  `);

  // Migración: agregar columnas de precio/mora a CATEGORIA_HERRAMIENTA
  try { db.exec("ALTER TABLE CATEGORIA_HERRAMIENTA ADD COLUMN precio_dia REAL NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE CATEGORIA_HERRAMIENTA ADD COLUMN mora_dia REAL NOT NULL DEFAULT 0"); } catch {}

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
      `INSERT OR IGNORE INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, cantidad_total, cantidad_disponible)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('Tabla 3m', 'nuevo', 5.0, 2.0, 100, 100);

    db.prepare(
      `INSERT OR IGNORE INTO ITEM_GRANEL (nombre, condicion, precio_dia, mora_dia, cantidad_total, cantidad_disponible)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('Tabla 3m', 'usado', 3.0, 1.5, 80, 80);

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
    ['api_reniec_key', '0fcd1cebbc5801a8f374999685f4293a', 'API Key de PeruAPI para consulta RENIEC'],
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

  console.log('[DB] Base de datos inicializada correctamente.');
}

module.exports = { initDatabase };
