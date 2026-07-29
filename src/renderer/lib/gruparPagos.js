/**
 * Agrupa pagos por grupo_pago.
 * Los pagos con mismo grupo_pago se consolidan en una sola entrada
 * con el monto total, la fecha del primer pago del grupo,
 * y los ids de todos los pagos que lo componen.
 *
 * @param {Array} pagos - Raw pagos array del contrato
 * @returns {Array} Pagos agrupados
 */
export function gruparPagos(pagos) {
  const grupos = {};
  const sueltos = [];

  for (const p of pagos) {
    if (p.grupo_pago) {
      if (!grupos[p.grupo_pago]) {
        grupos[p.grupo_pago] = {
          ...p,
          monto: 0,
          ids: [],
          esGrupo: true,
        };
      }
      grupos[p.grupo_pago].monto += p.monto;
      grupos[p.grupo_pago].ids.push(p.id);
      // Mantener la fecha más temprana
      if (p.fecha_pago && (!grupos[p.grupo_pago].fecha_pago || p.fecha_pago < grupos[p.grupo_pago].fecha_pago)) {
        grupos[p.grupo_pago].fecha_pago = p.fecha_pago;
      }
      // Si algún pago del grupo está anulado, el grupo se marca anulado
      if (p.anulado === 1) {
        grupos[p.grupo_pago].anulado = 1;
      }
    } else {
      sueltos.push({ ...p, esGrupo: false });
    }
  }

  const agrupados = Object.values(grupos);
  // Mezclar manteniendo orden por fecha
  return [...sueltos, ...agrupados].sort((a, b) => {
    const fa = a.fecha_pago || '';
    const fb = b.fecha_pago || '';
    return fa.localeCompare(fb);
  });
}
