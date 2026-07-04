const { app } = require('electron');
const path = require('path');
const configService = require('./src/main/services/configService');

app.name = 'sistema-alquiler-herramientas';

app.whenReady().then(() => {
  const configPath = path.join(app.getPath('userData'), 'app_config.json');
  console.log("APP_PATH:", app.getPath('userData'));
  console.log("KEY FROM JSON:", configService.getJsonConfigValue('api_reniec_key'));
  
  const sqlite3 = require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'alquiler_herramientas.db');
  if (require('fs').existsSync(dbPath)) {
    const db = sqlite3(dbPath);
    try {
      const row = db.prepare('SELECT valor FROM CONFIGURACION WHERE clave = ?').get('api_reniec_key');
      console.log("KEY FROM DB:", row ? JSON.stringify(row.valor) : 'null');
    } catch (e) {
      console.log("DB error:", e.message);
    }
  } else {
    console.log("DB file not found at", dbPath);
  }

  app.quit();
});
