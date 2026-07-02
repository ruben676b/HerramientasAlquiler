const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Usaremos el mismo directorio donde se asume que corre la DB por defecto,
// o se podría usar app.getPath('userData') para mayor seguridad en prod.
// Por consistencia con "alquiler_herramientas.db", lo creamos en el directorio actual.
// (Nota: Si se compila la app, process.cwd() puede ser diferente, 
//  pero por ahora usaremos app.getPath('userData') para asegurar que sea escribible)
const getConfigPath = () => {
  // Cuando la app corre, app.getPath('userData') es la carpeta de datos de la app.
  // Es la mejor práctica para Electron.
  return path.join(app ? app.getPath('userData') : process.cwd(), 'app_config.json');
};

function readConfigJson() {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error leyendo app_config.json:', error);
    return {};
  }
}

function writeConfigJson(data) {
  const filePath = getConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error escribiendo app_config.json:', error);
    return false;
  }
}

function getJsonConfigValue(key) {
  const config = readConfigJson();
  return config[key] !== undefined ? config[key] : null;
}

function setJsonConfigValue(key, value) {
  const config = readConfigJson();
  config[key] = value;
  return writeConfigJson(config);
}

module.exports = {
  readConfigJson,
  getJsonConfigValue,
  setJsonConfigValue
};
