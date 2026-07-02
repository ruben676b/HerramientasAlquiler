import { useState, useEffect } from 'react';
import { Settings, User, FileText, PenTool, Save, Key } from 'lucide-react';
import Button from '../components/ui/button';
import SignaturePad from '../components/SignaturePad';
import { useToast } from '../components/Toast';

const TABS = [
  { id: 'empresa', label: 'Datos empresa', icon: User },
  { id: 'clausulas', label: 'Cláusulas', icon: FileText },
  { id: 'firma', label: 'Firma', icon: PenTool },
  { id: 'api', label: 'API', icon: Key },
];

export default function Configuracion() {
  const [tab, setTab] = useState('empresa');
  const [config, setConfig] = useState({});
  const [cargando, setCargando] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (!window.api?.getAllConfig) return;
    window.api.getAllConfig().then(setConfig).finally(() => setCargando(false));
  }, []);

  const guardar = async (clave, valor) => {
    if (!window.api) return;
    try {
      await window.api.saveConfig(clave, valor);
      setConfig(p => ({ ...p, [clave]: valor }));
      toast('Configuración guardada');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };

  if (cargando) return <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Cargando...</div>;

  const inputCls = 'w-full h-9 px-3 rounded-lg text-sm border outline-none transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ backgroundColor: 'var(--surface)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium transition-colors duration-150"
            style={{ backgroundColor: tab === t.id ? 'var(--primary)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--muted)' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="rounded-xl p-5 space-y-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
        {tab === 'empresa' && (
          <>
            <Field label="Nombre de la arrendadora">
              <input value={config.arrendadora_nombre || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_nombre: e.target.value }))}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DNI">
                <input value={config.arrendadora_dni || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_dni: e.target.value }))}
                  className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
              <Field label="RUC">
                <input value={config.arrendadora_ruc || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_ruc: e.target.value }))}
                  className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
            </div>
            <Field label="Dirección">
              <input value={config.arrendadora_direccion || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_direccion: e.target.value }))}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono principal">
                <input value={config.arrendadora_telefono || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_telefono: e.target.value }))}
                  className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
              <Field label="Teléfono secundario">
                <input value={config.arrendadora_telefono2 || ''} onChange={e => setConfig(p => ({ ...p, arrendadora_telefono2: e.target.value }))}
                  className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
              </Field>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={async () => {
                for (const k of ['arrendadora_nombre','arrendadora_dni','arrendadora_ruc','arrendadora_direccion','arrendadora_telefono','arrendadora_telefono2']) {
                  await guardar(k, config[k] || '');
                }
              }}><Save size={14} /> Guardar todo</Button>
            </div>
          </>
        )}

        {tab === 'clausulas' && (
          <>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Use <code>[ARRENDADORA_NOMBRE]</code>, <code>[ARRENDADORA_DNI]</code>, <code>[ARRENDADORA_DIRECCION]</code>, <code>[CLIENTE_NOMBRE]</code>, <code>[CLIENTE_DNI]</code>, <code>[TOTAL]</code>, <code>[FECHA_INICIO]</code>, <code>[FECHA_DEVOLUCION]</code> como placeholders.
            </p>
            <Field label="Cláusulas del contrato">
              <textarea value={config.contrato_clausulas || ''} onChange={e => setConfig(p => ({ ...p, contrato_clausulas: e.target.value }))}
                className="w-full h-80 px-3 py-2 rounded-lg text-sm border outline-none resize-y transition-colors duration-150 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)', fontFamily: 'monospace' }} />
            </Field>
            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={() => guardar('contrato_clausulas', config.contrato_clausulas || '')}>
                <Save size={14} /> Guardar cláusulas
              </Button>
            </div>
          </>
        )}

        {tab === 'firma' && (
          <>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Firma que aparecerá en todos los contratos como ARRENDADORA.</p>
            {config.arrendadora_firma_base64 ? (
              <div className="space-y-2">
                <img src={config.arrendadora_firma_base64} alt="Firma" className="max-w-[200px] rounded-lg border" style={{ borderColor: 'var(--border)' }} />
                <button className="text-xs underline" style={{ color: 'var(--muted)' }} onClick={() => guardar('arrendadora_firma_base64', '')}>Eliminar firma</button>
              </div>
            ) : (
              <SignaturePad onSave={async (dataUrl) => {
                if (!window.api) return;
                await window.api.saveConfig('arrendadora_firma_base64', dataUrl);
                setConfig(p => ({ ...p, arrendadora_firma_base64: dataUrl }));
                toast('Firma guardada');
              }} disabled={false} />
            )}
          </>
        )}

        {tab === 'api' && (
          <>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Configuraciones de servicios externos y licencias.</p>
            <Field label="API Key de RENIEC (PeruAPI)">
              <input value={config.api_reniec_key || ''} onChange={e => setConfig(p => ({ ...p, api_reniec_key: e.target.value }))}
                className={inputCls} style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' }} />
            </Field>
            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={() => guardar('api_reniec_key', config.api_reniec_key || '')}>
                <Save size={14} /> Guardar API Key
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[13px] font-medium mb-1.5 block" style={{ color: 'var(--ink)' }}>{label}</label>
      {children}
    </div>
  );
}
