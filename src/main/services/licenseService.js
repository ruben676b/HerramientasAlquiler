const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const LICENSE_SECRET = 'u&={7`2}-4xQU*+*-VM-H9s#%r*@-,.4L/(W!#%r9xcU^g4$8@S/4$El5hV';
const LICENSE_DIR = path.join(app.getPath('userData'), 'AlquilerApp');
const LICENSE_FILE = path.join(LICENSE_DIR, 'license.json');

function readLicenseFile() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeLicenseFile(data) {
  if (!fs.existsSync(LICENSE_DIR)) fs.mkdirSync(LICENSE_DIR, { recursive: true });
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function deleteLicenseFile() {
  try { if (fs.existsSync(LICENSE_FILE)) fs.unlinkSync(LICENSE_FILE); } catch { }
}

function getMachineId() {
  const rawId = machineIdSync({ original: true });
  const hash = crypto.createHash('sha256').update(rawId).digest('hex');
  const short = hash.substring(0, 12).toUpperCase();
  return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`;
}

function getRawMachineId() {
  return machineIdSync({ original: true });
}

function validateLicenseKey(licenseKey) {
  try {
    const parts = licenseKey.trim().toUpperCase().split('-');
    if (parts.length !== 4 || parts[0] !== 'LIC') return false;

    const rawMachineId = getRawMachineId();
    const receivedSignatureParts = parts[1] + parts[2] + parts[3];

    const expectedSignatureV1 = crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(rawMachineId)
      .digest('hex')
      .substring(0, 16)
      .toUpperCase();

    if (expectedSignatureV1 === receivedSignatureParts) {
      return { valid: true, expiresAt: null };
    }

    const maskedExpHex = parts[1] + parts[2];
    const receivedSigV2 = parts[3];
    if (maskedExpHex.length !== 8 || receivedSigV2.length !== 8) return false;

    const maskedExpBuffer = Buffer.from(maskedExpHex, 'hex');
    const mask = crypto.createHash('sha256').update(rawMachineId + LICENSE_SECRET).digest();
    const expBuffer = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      expBuffer[i] = maskedExpBuffer[i] ^ mask[i];
    }
    const expTimestamp = expBuffer.readUInt32BE(0);

    const expectedSigV2 = crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(rawMachineId + expTimestamp.toString())
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();

    if (expectedSigV2 !== receivedSigV2) return false;

    if (expTimestamp === 0) {
      return { valid: true, expiresAt: null };
    }

    const expDate = expTimestamp * 1000;
    if (Date.now() > expDate) {
      return { valid: false, expired: true, message: 'La licencia temporal ha expirado.' };
    }
    return { valid: true, expiresAt: new Date(expDate).toISOString() };
  } catch {
    return false;
  }
}

function checkActivation() {
  try {
    const data = readLicenseFile();
    if (!data || !data.LicenseKey) {
      return { activated: false, machineId: getMachineId() };
    }

    const now = Date.now();
    const nowIso = new Date().toISOString();

    if (data.LastCheckedAt) {
      if (now < new Date(data.LastCheckedAt).getTime()) {
        return {
          activated: false,
          expired: true,
          message: 'Se ha detectado una alteracion en la fecha del sistema. La licencia ha sido suspendida.',
          machineId: getMachineId(),
        };
      }
    }

    const validation = validateLicenseKey(data.LicenseKey);

    if (!validation || !validation.valid) {
      if (validation && validation.expired) {
        data.LastCheckedAt = nowIso;
        writeLicenseFile(data);
        return { activated: false, expired: true, message: validation.message, machineId: getMachineId() };
      }
      deleteLicenseFile();
      return { activated: false, machineId: getMachineId() };
    }

    data.LastCheckedAt = nowIso;
    writeLicenseFile(data);

    return { activated: true, machineId: getMachineId(), expiresAt: validation.expiresAt };
  } catch {
    return { activated: false, machineId: getMachineId() };
  }
}

function activateLicense(licenseKey) {
  try {
    const validation = validateLicenseKey(licenseKey);
    if (!validation) {
      return { success: false, message: 'La clave de licencia no es valida para esta computadora.' };
    }
    if (!validation.valid && validation.expired) {
      return { success: false, message: validation.message || 'La clave de licencia ha expirado.' };
    }

    const nowIso = new Date().toISOString();
    writeLicenseFile({
      LicenseKey: licenseKey.trim().toUpperCase(),
      ActivatedAt: nowIso,
      ExpiresAt: validation.expiresAt || null,
      LastCheckedAt: nowIso,
    });

    return { success: true, message: 'Sistema activado correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error interno al activar: ' + error.message };
  }
}

module.exports = { getMachineId, checkActivation, activateLicense };
