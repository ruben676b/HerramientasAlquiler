const https = require('https');
const db = require('../db/database');

const BASE_URL = 'peruapi.com';
const TIMEOUT_MS = 8000;

const configService = require('./configService');

function getApiKey() {
  let key = configService.getJsonConfigValue('api_reniec_key');
  
  if (!key) {
    try {
      const row = db.prepare('SELECT valor FROM CONFIGURACION WHERE clave = ?').get('api_reniec_key');
      key = row ? row.valor : '';
    } catch (err) {
      key = '';
    }
  }
  return key ? key.trim() : '';
}

function consultarDni(dni) {
  return new Promise((resolve, reject) => {
    if (!dni || dni.length !== 8 || !/^\d{8}$/.test(dni)) {
      reject(new Error('DNI inválido. Debe tener 8 dígitos.'));
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      reject(new Error('API Key de RENIEC no configurada en las opciones.'));
      return;
    }

    const url = `/api/dni/${dni}?summary=0&plan=0`;
    const options = {
      hostname: BASE_URL,
      path: url,
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
      },
      timeout: TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === '200' && json.cliente) {
            const nombreCompleto = [json.nombres, json.apellido_paterno, json.apellido_materno]
              .filter(Boolean)
              .join(' ')
              .trim();
            resolve({
              dni: json.dni,
              nombre_completo: nombreCompleto || json.cliente,
            });
          } else if (json.code === '404') {
            reject(new Error('DNI no encontrado en RENIEC.'));
          } else if (json.code === '429') {
            reject(new Error('Límite de consultas excedido. Intente más tarde.'));
          } else if (json.code === '401') {
            reject(new Error('Error de autenticación con RENIEC.'));
          } else {
            reject(new Error(json.mensaje || 'Error al consultar RENIEC.'));
          }
        } catch {
          reject(new Error('Error al procesar respuesta de RENIEC.'));
        }
      });
    });

    req.on('error', () => {
      reject(new Error('No se pudo conectar con RENIEC. Verifique su conexión.'));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('La consulta a RENIEC tardó demasiado. Intente nuevamente.'));
    });

    req.end();
  });
}

module.exports = { consultarDni };
