const https = require('https');
const db = require('../db/database');

const BASE_URL = 'api.decolecta.com';
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
      reject(new Error('Token de RENIEC no configurado en las opciones.'));
      return;
    }

    const url = `/v1/reniec/dni?numero=${dni}`;
    const options = {
      hostname: BASE_URL,
      path: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.document_number) {
            const nombreCompleto = [json.first_name, json.first_last_name, json.second_last_name]
              .filter(Boolean)
              .join(' ')
              .trim();
            resolve({
              dni: json.document_number,
              nombre_completo: nombreCompleto || json.full_name || '',
            });
          } else if (res.statusCode === 400) {
            reject(new Error(json.error || 'Solicitud inválida.'));
          } else if (res.statusCode === 404) {
            reject(new Error('DNI no encontrado en RENIEC.'));
          } else if (res.statusCode === 429) {
            reject(new Error('Límite de consultas excedido. Intente más tarde.'));
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error('Token inválido o sin permisos para consultar RENIEC.'));
          } else {
            reject(new Error(json.error || 'Error al consultar RENIEC.'));
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
