const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../alquiler_herramientas.db'));

console.log('Migrando tabla PAGO...');

try {
  db.exec('PRAGMA foreign_keys=off;');
  db.exec('BEGIN TRANSACTION;');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS PAGO_NEW (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_contrato INTEGER NOT NULL,
      monto REAL NOT NULL CHECK (monto >= 0),
      fecha_pago TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'yape', 'plin')),
      tipo TEXT NOT NULL CHECK (tipo IN ('adelanto', 'saldo', 'mora', 'deposito', 'devolucion_deposito', 'devolucion_saldo')),
      comprobante TEXT NOT NULL DEFAULT 'recibo interno' CHECK (comprobante IN ('recibo interno', 'boleta_sunat', 'factura_sunat')),
      notas TEXT,
      id_detalle INTEGER REFERENCES DETALLE_CONTRATO(id),
      anulado INTEGER DEFAULT 0 CHECK (anulado IN (0, 1)),
      fecha_anulacion TEXT,
      motivo_anulacion TEXT,
      grupo_pago TEXT,
      FOREIGN KEY (id_contrato) REFERENCES CONTRATO(id)
    );
  `);
  
  db.exec(`INSERT INTO PAGO_NEW SELECT * FROM PAGO;`);
  db.exec(`DROP TABLE PAGO;`);
  db.exec(`ALTER TABLE PAGO_NEW RENAME TO PAGO;`);
  
  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys=on;');
  console.log('Migración completada con éxito.');
} catch (e) {
  console.error('Error:', e);
  db.exec('ROLLBACK;');
  db.exec('PRAGMA foreign_keys=on;');
}
