const Database = require('better-sqlite3');
const { app } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

const dbPath = isDev
  ? path.resolve(__dirname, '..', '..', '..', 'alquiler_herramientas.db')
  : path.join(app.getPath('userData'), 'alquiler_herramientas.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL;');
db.pragma('foreign_keys = ON;');

module.exports = db;
