import { useState, useEffect } from 'react';
import { Shield, Copy, Key, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

export default function ActivationPage({ onActivated }) {
  const [machineId, setMachineId] = useState('');
  const [rawMachineId, setRawMachineId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.api.license.getMachineId().then(setMachineId);
    window.api.license.getRawMachineId().then(setRawMachineId);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawMachineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError('Ingresa una clave de licencia.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await window.api.license.activate(licenseKey.trim());
      if (result.success) {
        setSuccess(result.message);
        setTimeout(() => onActivated(), 1200);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Error de comunicacion: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '40px 36px', maxWidth: 440, width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 14px',
            backgroundColor: 'oklch(0.53 0.135 55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
            Sistema de Alquiler
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Activacion del sistema</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Codigo de maquina
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
              color: 'var(--primary)', textAlign: 'center', userSelect: 'all',
            }}>
              {machineId || '...'}
            </div>
            <button onClick={handleCopy} style={{
              width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)',
              backgroundColor: copied ? 'oklch(0.93 0.05 160)' : 'var(--bg)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: copied ? 'var(--success)' : 'var(--muted)',
            }}>
              {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4, textAlign: 'center' }}>
            {copied ? 'Codigo copiado' : 'Envia este codigo al proveedor del sistema'}
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Clave de licencia
          </p>
          <input
            type="text"
            value={licenseKey}
            onChange={e => setLicenseKey(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) handleActivate(); }}
            placeholder="LIC-XXXX-XXXX-XXXXXXXX"
            autoFocus
            style={{
              width: '100%', backgroundColor: 'var(--bg)', border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 10, padding: '12px 14px', fontFamily: 'monospace', fontSize: 16, fontWeight: 600,
              color: 'var(--ink)', outline: 'none', textAlign: 'center',
            }}
          />
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16,
            backgroundColor: 'oklch(0.95 0.015 25)', border: '1px solid var(--danger)', borderRadius: 10,
            fontSize: 13, color: 'var(--danger)',
          }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16,
            backgroundColor: 'oklch(0.93 0.05 160)', border: '1px solid var(--success)', borderRadius: 10,
            fontSize: 13, color: 'var(--success)',
          }}>
            <CheckCircle size={14} /> {success}
          </div>
        )}

        <button onClick={handleActivate} disabled={loading || !!success}
          style={{
            width: '100%', height: 46, borderRadius: 10, border: 'none',
            backgroundColor: success ? 'var(--success)' : 'var(--primary)',
            color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: loading || success ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.8 : 1,
          }}>
          {loading ? <><Loader2 size={18} style={{ animation: 'spin 0.75s linear infinite' }} /> Verificando...</>
            : success ? <><CheckCircle size={18} /> Activado</>
            : <><Key size={18} /> Activar sistema</>}
        </button>
      </div>
    </div>
  );
}
