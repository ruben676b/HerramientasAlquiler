const https = require('https');

const API_KEY = '0fcd1cebbc5801a8f374999685f4293a';
const BASE_URL = 'peruapi.com';
const TIMEOUT_MS = 8000;

function consultarDni(dni) {
  return new Promise((resolve, reject) => {
    if (!dni || dni.length !== 8 || !/^\d{8}$/.test(dni)) {
      reject(new Error('DNI inválido. Debe tener 8 dígitos.'));
      return;
    }

    const url = `/api/dni/${dni}?summary=0&plan=0`;
    const options = {
      hostname: BASE_URL,
      path: url,
      method: 'GET',
      headers: {
        'X-API-KEY': API_KEY,
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
