import React, { useState, useEffect } from 'react';
import Button from './ui/button';

// Helper: extract YYYY-MM-DD from an ISO string or date
const formatToDate = (dateStr) => {
  if (!dateStr) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // YYYY-MM-DDTHH:mm or full ISO
  if (dateStr.length >= 10) return dateStr.substring(0, 10);
  return '';
};

export default function EditarItemModal({ isOpen, onClose, onGuardar, item, contrato, isGranelOrKit }) {
  const [formData, setFormData] = useState({
    cantidad: 1,
    precio_dia_aplicado: 0,
    tarifa_aplicada: 'dia',
    fecha_salida_item: '',
    fecha_devolucion_pactada_item: ''
  });

  useEffect(() => {
    if (item && isOpen) {
      const fechaSalida = item.fecha_salida_item || (contrato && contrato.fecha_salida) || '';
      const fechaDevolucion = item.fecha_devolucion_pactada_item || (contrato && contrato.fecha_devolucion_pactada) || '';

      setFormData({
        cantidad: item.cantidad || 1,
        precio_dia_aplicado: item.precio_dia_aplicado || 0,
        tarifa_aplicada: item.tarifa_aplicada || 'dia',
        fecha_salida_item: formatToDate(fechaSalida),
        fecha_devolucion_pactada_item: formatToDate(fechaDevolucion)
      });
    }
  }, [item, contrato, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Convert datetime-local values to date-only (YYYY-MM-DD) to match DB format
    const dataToSend = {
      ...formData,
      fecha_salida_item: formData.fecha_salida_item ? formData.fecha_salida_item.substring(0, 10) : '',
      fecha_devolucion_pactada_item: formData.fecha_devolucion_pactada_item ? formData.fecha_devolucion_pactada_item.substring(0, 10) : ''
    };
    onGuardar(dataToSend);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Editar {item?.item_nombre || item?.nombre}</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          
          {isGranelOrKit && (
            <div>
              <label htmlFor="cantidad" className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Cantidad</label>
              <input 
                id="cantidad" 
                name="cantidad" 
                type="number" 
                min="1" 
                value={formData.cantidad} 
                onChange={handleChange} 
                required 
                className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
                style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
              />
            </div>
          )}

          <div>
            <label htmlFor="tarifa_aplicada" className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Tarifa Aplicada</label>
            <select
              id="tarifa_aplicada"
              name="tarifa_aplicada"
              value={formData.tarifa_aplicada}
              onChange={handleChange}
              className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            >
              <option value="dia">Día</option>
              <option value="mes">Mes</option>
              <option value="minimo">Mínimo</option>
            </select>
          </div>

          <div>
            <label htmlFor="precio_dia_aplicado" className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Precio Aplicado (S/)</label>
            <input 
              id="precio_dia_aplicado" 
              name="precio_dia_aplicado" 
              type="number" 
              step="0.01" 
              min="0" 
              value={formData.precio_dia_aplicado} 
              onChange={handleChange} 
              required 
              className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            />
          </div>

          <div>
            <label htmlFor="fecha_salida_item" className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Fecha de Salida</label>
            <input 
              id="fecha_salida_item" 
              name="fecha_salida_item" 
              type="date" 
              value={formData.fecha_salida_item} 
              onChange={handleChange} 
              className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            />
          </div>

          <div>
            <label htmlFor="fecha_devolucion_pactada_item" className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Fecha Pactada de Devolución</label>
            <input 
              id="fecha_devolucion_pactada_item" 
              name="fecha_devolucion_pactada_item" 
              type="date" 
              value={formData.fecha_devolucion_pactada_item} 
              onChange={handleChange} 
              className="w-full h-9 px-3 rounded-lg text-sm border outline-none"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--border)' }}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Cancelar</button>
            <Button type="submit" variant="primary" size="sm" className="flex-1">
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
