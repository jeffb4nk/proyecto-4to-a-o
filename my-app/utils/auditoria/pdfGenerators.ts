import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import type { QuizCreado, SesionReciente, SesionHistorial, MateriaAuditoria, EstadisticasGenerales } from './types';

// Busca un lugar en el sistema de archivos donde guardar el PDF
const obtenerDirectorioPDF = () => {
  const fileSystem = FileSystem as any;
  const directory = fileSystem.documentDirectory ?? fileSystem.cacheDirectory ?? '';
  if (!directory) {
    throw new Error('No se encontró un directorio válido para guardar el PDF');
  }
  return directory as string;
};

  const esOperacion = (tipo: string, busca: string) =>
    String(tipo).toLowerCase().includes(busca);

  const labelOperacion = (tipo: string) => {
    if (esOperacion(tipo, 'crea')) return 'CREACIÓN';
    if (esOperacion(tipo, 'mod')) return 'MODIFICACIÓN';
    if (esOperacion(tipo, 'elim')) return 'ELIMINACIÓN';
    return String(tipo || '').replace('QUIZ_', '').replace(/_/g, ' ');
  };

  const colorOperacion = (tipo: string) => {
    if (esOperacion(tipo, 'crea')) return '#22c55e';
    if (esOperacion(tipo, 'mod')) return '#3b82f6';
    if (esOperacion(tipo, 'elim')) return '#ef4444';
    return '#6b7280';
  };



// Carga el logo del colegio y lo convierte a base64 para incrustarlo en el PDF
const obtenerLogoBase64 = async (): Promise<string> => {
  try {
    const asset = Asset.fromModule(require('@/assets/colegio/logo.jpeg'));
    await asset.downloadAsync();

    if (Platform.OS === 'web') {
      const response = await fetch(asset.localUri || asset.uri);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const fileSystem = FileSystem as any;
    const base64 = await fileSystem.readAsStringAsync(asset.localUri || asset.uri, {
      encoding: fileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('Error al cargar el logo:', error);
    return '';
  }
};

// Arma el encabezado institucional con logo, nombre del colegio y titulo del reporte
const generarMembreteHTML = async (titulo: string): Promise<string> => {
  const logoBase64 = await obtenerLogoBase64();
  const fecha = new Date().toLocaleString('es-ES');
  
  return `
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 20px; margin: -20px -20px 20px -20px; border-bottom: 4px solid #fbbf24;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center;">
          ${logoBase64 ? `<img src="${logoBase64}" style="width: 80px; height: 80px; margin-right: 20px; border-radius: 8px; background: white; padding: 5px;" />` : ''}
          <div style="color: white;">
            <h1 style="margin: 0; font-size: 18px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">UNIDAD EDUCATIVA</h1>
            <h2 style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">INSTITUTO METROPOLITANO ADVENTISTA</h2>
            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">San Cristóbal, Estado Táchira</p>
          </div>
        </div>
        <div style="text-align: right; color: white;">
          <p style="margin: 0; font-size: 12px; opacity: 0.8;">Fecha de emisión:</p>
          <p style="margin: 0; font-size: 14px; font-weight: bold;">${fecha}</p>
        </div>
      </div>
    </div>
    <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
      <h2 style="margin: 0; color: #1e3a8a; font-size: 20px;">${titulo}</h2>
    </div>
  `;
};

// Funcion base que imprime o guarda el PDF segun la plataforma
const generarPDFBase = async (html: string, fileName: string, dialogTitle: string) => {
  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      document.title = '';
      const htmlConScript = html + `
        <script>
          (function() {
            var imgs = document.querySelectorAll('img');
            var total = imgs.length;
            if (total === 0) { window.print(); return; }
            var loaded = 0;
            var done = false;
            var timeout = setTimeout(function() { if (!done) { done = true; window.print(); } }, 5000);
            Array.from(imgs).forEach(function(img) {
              var check = function() {
                loaded++;
                if (loaded >= total && !done) { done = true; clearTimeout(timeout); window.print(); }
              };
              if (img.complete || img.naturalWidth === 0) { check(); }
              else { img.onload = check; img.onerror = check; }
            });
          })();
        </script>`;
      printWindow.document.write(htmlConScript);
      printWindow.document.close();
      printWindow.onafterprint = () => printWindow.close();
    }
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  // Intentar mover a un directorio persistente; si no está disponible, compartir el archivo temporal
  try {
    let directorioPDF = '';
    try {
      directorioPDF = obtenerDirectorioPDF();
    } catch (dirErr) {
      console.warn('No se pudo obtener directorio persistente para PDF:', dirErr);
    }

    if (directorioPDF) {
      if (!directorioPDF.endsWith('/')) directorioPDF += '/';
      const fileUri = directorioPDF + fileName;
      try {
        await FileSystem.moveAsync({ from: uri, to: fileUri });
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle,
        });
        return;
      } catch (moveError) {
        console.warn('No se pudo mover el PDF al directorio final, usando URI temporal:', moveError);
        // caerá a compartir el URI temporal
      }
    }

    // Si no hay directorio o mover falló, compartir el archivo temporal generado por Print
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
  } catch (err) {
    console.error('Error al en generarPDFBase:', err);
    throw err;
  }
};

// Genera PDF con el historial de operaciones sobre quices (creacion, modificacion, eliminacion)
export const generarPDFQuices = async (
  quicesFiltrados: any[],
  filtroTipo: string,
  filtroTiempo: string,
  searchText: string,
  filtroProfesor: number | null = null,
  filtroMateria: number | null = null,
  materiasAuditoria: any[] = []
) => {
  try {
    const membrete = await generarMembreteHTML('📋 Historial de Auditoría de Quices');
    const fechaGeneracion = new Date().toLocaleString('es-ES');

    const filtroProfesorNombre = filtroProfesor !== null
      ? (materiasAuditoria.length > 0 ? `ID ${filtroProfesor}` : `ID ${filtroProfesor}`)
      : 'Todos';
    const filtroMateriaNombre = filtroMateria !== null
      ? (materiasAuditoria.find((m: any) => m.materia_id === filtroMateria)?.nombre || `ID ${filtroMateria}`)
      : 'Todos';

    const fmtFechaHora = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      const fe = typeof fecha === 'string' ? fecha : String(fecha);
      const fUtc = (fe.includes('+') || fe.endsWith('Z')) ? fe : fe + 'Z';
      try {
        return new Date(fUtc).toLocaleString('es-ES', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Caracas'
        });
      } catch { return 'N/A'; }
    };

    const total = quicesFiltrados.length;
    const creaciones = quicesFiltrados.filter(q => esOperacion(q.tipo_operacion, 'crea')).length;
    const modificaciones = quicesFiltrados.filter(q => esOperacion(q.tipo_operacion, 'mod')).length;
    const eliminaciones = quicesFiltrados.filter(q => esOperacion(q.tipo_operacion, 'elim')).length;
    const otros = total - creaciones - modificaciones - eliminaciones;

    const labelBadgeCompleto = (tipo: string): { label: string; color: string } => {
      const t = String(tipo || '').toUpperCase();
      if (t.includes('CREACION') || t.includes('CREA')) return { label: 'CREACIÓN', color: '#22c55e' };
      if (t.includes('MODIFICACION') || t.includes('MOD')) return { label: 'MODIFICACIÓN', color: '#3b82f6' };
      if (t.includes('ELIMINACION') || t.includes('ELIM')) return { label: 'ELIMINACIÓN', color: '#ef4444' };
      if (t.includes('ACCESO')) return { label: 'ACCESO', color: '#8b5cf6' };
      if (t.includes('CODIGO') || t.includes('GENERAR_CODIGO')) return { label: 'CÓDIGO', color: '#06b6d4' };
      if (t.includes('COMPARTIR')) return { label: 'COMPARTIR', color: '#f59e0b' };
      return { label: tipo || 'OTRO', color: '#6b7280' };
    };

    const construirDetalleCambios = (q: any): string => {
      if (!esOperacion(q.tipo_operacion, 'mod')) return '';
      const ant = q.cambio?.datos_anteriores;
      const nue = q.cambio?.datos_nuevos;
      if (!ant && !nue) return '';

      const metaCambios: string[] = [];
      const metaLabels: Record<string, string> = {
        'titulo': 'Título',
        'tema': 'Tema',
        'modo_juego': 'Modo de juego',
        'imagen_portada': 'Portada',
      };

      if (ant && nue) {
        if (ant.ponderacion !== undefined && nue.ponderacion !== undefined && ant.ponderacion !== nue.ponderacion) {
          metaCambios.push(`Ponderación: ${ant.ponderacion} → ${nue.ponderacion}`);
        }
        Object.keys(metaLabels).forEach(campo => {
          const vAnt = ant[campo];
          const vNue = nue[campo];
          if (vAnt !== undefined && vNue !== undefined && String(vAnt) !== String(vNue)) {
            metaCambios.push(`${metaLabels[campo]}: ${String(vAnt).substring(0, 30)} → ${String(vNue).substring(0, 30)}`);
          }
        });
        const preguntasAnt = ant.preguntas?.length;
        const preguntasNue = nue.preguntas?.length;
        if (preguntasAnt !== undefined && preguntasNue !== undefined && preguntasAnt !== preguntasNue) {
          metaCambios.push(`Preguntas: ${preguntasAnt} → ${preguntasNue}`);
        }
      } else if (nue && !ant) {
        Object.keys(metaLabels).forEach(campo => {
          if (nue[campo] !== undefined) {
            metaCambios.push(`${metaLabels[campo]}: ${String(nue[campo]).substring(0, 40)}`);
          }
        });
      }

      const ponderacionCambio = ant?.ponderacion !== undefined && nue?.ponderacion !== undefined && ant.ponderacion !== nue.ponderacion;
      const ratioPonderacion = ponderacionCambio && ant.ponderacion > 0 ? nue.ponderacion / ant.ponderacion : null;

      const esCascadePuntos = (puntosAnt: number, puntosNue: number): boolean => {
        if (ratioPonderacion === null) return false;
        const esperado = Math.round(puntosAnt * ratioPonderacion * 100) / 100;
        return Math.abs(puntosNue - esperado) < 0.01;
      };

      const obtenerCorrecta = (pregunta: any): string => {
        if (!pregunta?.opciones) return '';
        const idx = pregunta.opciones.findIndex((o: any) => o.es_correcta);
        return idx >= 0 ? `Opción ${idx + 1}` : '';
      };

      const preguntasModificadas: Array<{ nro: number; cambios: string[] }> = [];
      const preguntasAnt = ant?.preguntas || [];
      const preguntasNue = nue?.preguntas || [];
      const maxPreguntas = Math.max(preguntasAnt.length, preguntasNue.length);

      for (let i = 0; i < maxPreguntas; i++) {
        const pAnt = preguntasAnt[i];
        const pNue = preguntasNue[i];
        if (!pAnt || !pNue) continue;

        const nro = pNue.nro_orden || pAnt.nro_orden || (i + 1);
        const cambiosIndividuales: string[] = [];

        if (pAnt.puntos_si_es_dificultad !== undefined && pNue.puntos_si_es_dificultad !== undefined) {
          const puntosAntRedondeados = Math.round(pAnt.puntos_si_es_dificultad * 100) / 100;
          const puntosNueRedondeados = Math.round(pNue.puntos_si_es_dificultad * 100) / 100;
          if (puntosAntRedondeados !== puntosNueRedondeados && !esCascadePuntos(puntosAntRedondeados, puntosNueRedondeados)) {
            cambiosIndividuales.push(`Puntos: ${puntosAntRedondeados} → ${puntosNueRedondeados}`);
          }
        }

        const correctaAnt = obtenerCorrecta(pAnt);
        const correctaNue = obtenerCorrecta(pNue);
        if (correctaAnt !== correctaNue && (correctaAnt || correctaNue)) {
          cambiosIndividuales.push(`Respuesta correcta: ${correctaAnt || 'N/A'} → ${correctaNue || 'N/A'}`);
        }

        if (pAnt.enunciado !== undefined && pNue.enunciado !== undefined && pAnt.enunciado !== pNue.enunciado) {
          const antCorto = String(pAnt.enunciado).substring(0, 40);
          const nueCorto = String(pNue.enunciado).substring(0, 40);
          cambiosIndividuales.push(`Enunciado: "${antCorto}"${pNue.enunciado.length > 40 ? '...' : ''} → "${nueCorto}"${pNue.enunciado.length > 40 ? '...' : ''}`);
        }

        if (pAnt.tiempo_limite_segundos !== undefined && pNue.tiempo_limite_segundos !== undefined && pAnt.tiempo_limite_segundos !== pNue.tiempo_limite_segundos) {
          cambiosIndividuales.push(`Tiempo: ${pAnt.tiempo_limite_segundos}s → ${pNue.tiempo_limite_segundos}s`);
        }

        if (pAnt.tipo !== undefined && pNue.tipo !== undefined && pAnt.tipo !== pNue.tipo) {
          cambiosIndividuales.push(`Tipo: ${pAnt.tipo} → ${pNue.tipo}`);
        }

        if (cambiosIndividuales.length > 0) {
          preguntasModificadas.push({ nro, cambios: cambiosIndividuales });
        }
      }

      if (metaCambios.length === 0 && preguntasModificadas.length === 0) return '';

      let html = '<div style="margin-top:4px;font-size:9px;color:#1e40af;">';

      if (metaCambios.length > 0) {
        html += `<div style="padding:4px 8px;background:#f0f9ff;border-radius:4px;border-left:2px solid #3b82f6;margin-bottom:4px;">
          <div style="font-weight:bold;margin-bottom:2px;color:#1e3a8a;">📋 Cambios en Metadatos</div>
          ${metaCambios.map(c => `<div style="margin-bottom:1px;">→ ${c}</div>`).join('')}
          ${ponderacionCambio ? `<div style="margin-top:3px;font-style:italic;color:#64748b;font-size:8px;">Los puntos de las preguntas se ajustaron proporcionalmente</div>` : ''}
        </div>`;
      }

      if (preguntasModificadas.length > 0) {
        html += `<div style="padding:4px 8px;background:#fefce8;border-radius:4px;border-left:2px solid #eab308;">
          <div style="font-weight:bold;margin-bottom:3px;color:#854d0e;">✏️ Preguntas con cambios individuales (${preguntasModificadas.length})</div>
          ${preguntasModificadas.map(pm => `
            <div style="margin-bottom:4px;padding:3px 6px;background:white;border-radius:3px;border:1px solid #fef08a;">
              <div style="font-weight:bold;color:#854d0e;">Pregunta #${pm.nro}</div>
              ${pm.cambios.map(c => `<div style="margin-bottom:1px;padding-left:6px;">→ ${c}</div>`).join('')}
            </div>
          `).join('')}
        </div>`;
      }

      html += '</div>';
      return html;
    };

    const filtrosHTML = `
      <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:bold;color:#1e3a8a;margin-bottom:8px;">🔍 Criterios de Búsqueda</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px;">
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Operación:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${filtroTipo === 'todos' ? 'Todas' : filtroTipo}</span>
          </div>
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Profesor:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${filtroProfesorNombre}</span>
          </div>
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Materia:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${filtroMateriaNombre}</span>
          </div>
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Período:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${filtroTiempo === 'todos' ? 'Todo' : filtroTiempo}</span>
          </div>
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Búsqueda:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${searchText || '(ninguna)'}</span>
          </div>
          <div style="padding:4px 8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <span style="color:#64748b;">Resultados:</span>
            <span style="font-weight:bold;color:#1e3a8a;">${total} operaciones</span>
          </div>
        </div>
      </div>
    `;

    const tablaHTML = quicesFiltrados.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th style="width:90px;">Operación</th>
            <th>Título</th>
            <th style="width:100px;">Profesor</th>
            <th style="width:80px;">Materia</th>
            <th style="width:50px;">Pregs.</th>
            <th style="width:55px;">Modo</th>
            <th style="width:40px;">Escala</th>
            <th style="width:100px;">Fecha</th>
          </tr>
        </thead>
        <tbody>
        ${quicesFiltrados.map((q: any, i: number) => {
          const titulo = q.quiz_titulo || q.detalles?.quiz_titulo || 'Sin título';
          const prof = q.usuario || {};
          const mat = q.materia || q.detalles?.materia || {};
          const fecha = fmtFechaHora(q.fecha_operacion);
          const pregs = q.cantidad_preguntas ?? q.detalles?.cantidad_preguntas ?? 0;
          const badge = labelBadgeCompleto(q.tipo_operacion || '');
          const modo = q.detalles?.modo_juego || q.cambio?.datos_nuevos?.modo_juego || '-';
          const escala = q.detalles?.escala_puntuacion || q.cambio?.datos_nuevos?.ponderacion || '-';
          const exito = q.resultado?.exito;
          const exitoBadge = exito === false
            ? '<span style="display:inline-block;padding:1px 5px;border-radius:8px;font-size:8px;font-weight:bold;color:white;background:#ef4444;">ERROR</span>'
            : '';
          const detalleCambios = construirDetalleCambios(q);
          const rowBg = i % 2 === 0 ? '' : 'background:#f8fafc;';

          return `
            <tr style="page-break-inside:avoid;${rowBg}">
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#64748b;">${i + 1}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;">
                <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;color:white;background:${badge.color};">${badge.label}</span>
                ${exitoBadge}
              </td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#1e293b;">${titulo.substring(0, 50)}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:10px;">${prof.nombre || ''} ${prof.apellido || ''}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:10px;">${mat.nombre || 'N/A'}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;">${pregs}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px;color:#475569;">${modo}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:bold;color:#1e3a8a;">${escala}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#475569;">${fecha}</td>
            </tr>
            ${detalleCambios ? `
            <tr style="page-break-inside:avoid;">
              <td colspan="9" style="padding:0 6px 6px 6px;border-bottom:1px solid #e2e8f0;">
                ${detalleCambios}
              </td>
            </tr>` : ''}
          `;
        }).join('')}
        </tbody>
      </table>
    ` : '<div style="color:#999;font-style:italic;font-size:11px;text-align:center;padding:12px;">No hay operaciones registradas en el historial de auditoría</div>';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
          .stats-grid { display: grid; grid-template-columns: repeat(${otros > 0 ? 4 : 3}, 1fr); gap: 8px; margin-bottom: 16px; }
          .stat-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
          .stat-value { font-size: 22px; font-weight: bold; color: #1e3a8a; }
          .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
          th { background: #1e3a8a; color: white; padding: 7px 6px; text-align: left; font-size: 10px; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          tbody { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
          .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        ${membrete}

        ${filtrosHTML}

        <div class="section-title">📊 Resumen de Operaciones</div>
        <div class="stats-grid">
          <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#22c55e;">${creaciones}</div><div class="stat-label">Creaciones</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#3b82f6;">${modificaciones}</div><div class="stat-label">Modificaciones</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#ef4444;">${eliminaciones}</div><div class="stat-label">Eliminaciones</div></div>
          ${otros > 0 ? `<div class="stat-item"><div class="stat-value" style="color:#6b7280;">${otros}</div><div class="stat-label">Otros</div></div>` : ''}
        </div>

        <div class="section-title">📋 Historial de Operaciones (${total})</div>
        ${tablaHTML}

        <div class="footer">
          <p>UNIDAD EDUCATIVA INSTITUTO METROPOLITANO ADVENTISTA - San Cristóbal, Estado Táchira</p>
          <p>Este informe fue generado automáticamente el ${fechaGeneracion}</p>
        </div>
      </body>
      </html>
    `;
    await generarPDFBase(html, `auditoria_historial_quices_${Date.now()}.pdf`, 'Guardar historial de auditoría de quices');
  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('Error al generar el PDF. Por favor intenta nuevamente.');
  }
};



// Genera PDF con el detalle de sesiones, su linea de tiempo y ranking de participantes
export const generarPDFSesiones = async (
  sesionesFiltradas: SesionHistorial[],
  filtrosActivos: { busqueda: string; estatus: string; tiempo: string }
) => {
  try {
    const membrete = await generarMembreteHTML('Auditoria de Sesiones');
    const fechaGeneracion = new Date().toLocaleString('es-ES');

    const fmtFecha = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      const fechaStr = typeof fecha === 'string' ? fecha : String(fecha);
      const fechaUtc = (fechaStr.includes('+') || fechaStr.endsWith('Z')) ? fechaStr : fechaStr + 'Z';
      const date = new Date(fechaUtc);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
    };

    const fmtFechaCorta = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      const fechaStr = typeof fecha === 'string' ? fecha : String(fecha);
      const fechaUtc = (fechaStr.includes('+') || fechaStr.endsWith('Z')) ? fechaStr : fechaStr + 'Z';
      const date = new Date(fechaUtc);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Caracas' });
    };

    const fmtTiempo = (ms: number | undefined | null): string => {
      if (!ms) return '-';
      const seg = Math.floor(ms / 1000);
      const min = Math.floor(seg / 60);
      const segRest = seg % 60;
      return `${min.toString().padStart(2, '0')}:${segRest.toString().padStart(2, '0')}`;
    };

    const colorEvento = (tipo: string): string => {
      if (tipo === 'SESION_CREACION') return '#22c55e';
      if (tipo === 'SESION_INICIO') return '#3b82f6';
      if (tipo === 'SESION_RESULTADO') return '#8b5cf6';
      if (tipo === 'SESION_MODIFICACION') return '#f59e0b';
      if (tipo === 'SESION_ELIMINACION') return '#ef4444';
      return '#6b7280';
    };

    const labelEvento = (tipo: string): string => {
      if (tipo === 'SESION_CREACION') return 'SESION CREADA';
      if (tipo === 'SESION_INICIO') return 'INICIO';
      if (tipo === 'SESION_RESULTADO') return 'RESULTADO';
      if (tipo === 'SESION_MODIFICACION') return 'DESACTIVADA';
      if (tipo === 'SESION_ELIMINACION') return 'ELIMINADA';
      return tipo || '';
    };

    const labelEstado = (sesion: SesionHistorial): string => {
      if (sesion.eliminado) return 'Eliminada';
      if (!sesion.activo) return 'Inactiva';
      const ahora = new Date();
      if (sesion.fecha_inicio && new Date(sesion.fecha_inicio) > ahora) return 'Agendada';
      if (sesion.fecha_fin && new Date(sesion.fecha_fin) < ahora) return 'Expirada';
      return 'Activa';
    };

    const colorEstado = (sesion: SesionHistorial): string => {
      if (sesion.eliminado) return '#FF3B30';
      if (!sesion.activo) return '#999999';
      const ahora = new Date();
      if (sesion.fecha_inicio && new Date(sesion.fecha_inicio) > ahora) return '#007AFF';
      if (sesion.fecha_fin && new Date(sesion.fecha_fin) < ahora) return '#FF9500';
      return '#34C759';
    };

    const ahora = new Date();
    const total = sesionesFiltradas.length;
    const agendadas = sesionesFiltradas.filter(s => !s.eliminado && s.fecha_inicio && new Date(s.fecha_inicio) > ahora).length;
    const activas = sesionesFiltradas.filter(s => !s.eliminado && s.activo && s.fecha_inicio && new Date(s.fecha_inicio) <= ahora && s.fecha_fin && new Date(s.fecha_fin) >= ahora).length;
    const expiradas = sesionesFiltradas.filter(s => !s.eliminado && s.activo && s.fecha_fin && new Date(s.fecha_fin) < ahora).length;
    const inactivas = sesionesFiltradas.filter(s => !s.eliminado && !s.activo).length;
    const eliminadas = sesionesFiltradas.filter(s => s.eliminado).length;

    const filtrosHTML = `
      <div style="background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:16px;font-size:11px;">
        <strong style="color:#1e3a8a;">Filtros aplicados:</strong>
        <span style="color:#475569;">
          ${filtrosActivos.busqueda ? `Busqueda: "${filtrosActivos.busqueda}"` : ''}
          ${filtrosActivos.estatus !== 'todos' ? ` | Estatus: ${filtrosActivos.estatus}` : ''}
          ${filtrosActivos.tiempo !== 'todos' ? ` | Tiempo: ${filtrosActivos.tiempo}` : ''}
          ${!filtrosActivos.busqueda && filtrosActivos.estatus === 'todos' && filtrosActivos.tiempo === 'todos' ? 'Sin filtros (mostrando todos)' : ''}
        </span>
      </div>
    `;

    const sesionesHTML = sesionesFiltradas.map((sesion) => {
      const badgeColor = colorEstado(sesion);
      const badgeLabel = labelEstado(sesion);

      const eventosOrdenados = [...(sesion.eventos || [])].sort((a, b) =>
        new Date(a.fecha_operacion).getTime() - new Date(b.fecha_operacion).getTime()
      );

      const eventosCicloVida = eventosOrdenados.filter(e => e.tipo_operacion !== 'SESION_RESULTADO');

      const profesorEvento = eventosCicloVida.find(e => e.usuario?.rol === 'Profesor');
      const profesorNombre = profesorEvento ? `${profesorEvento.usuario.nombre} ${profesorEvento.usuario.apellido}` : 'N/A';

      const timelineHTML = eventosCicloVida.map((evento) => {
        const color = colorEvento(evento.tipo_operacion);
        const label = labelEvento(evento.tipo_operacion);
        const usuario = evento.usuario ? `${evento.usuario.nombre} ${evento.usuario.apellido}` : '';
        const fecha = fmtFecha(evento.fecha_operacion);

        let detalleExtra = '';
        if (evento.tipo_operacion === 'SESION_CREACION' && evento.datos_nuevos) {
          const d = evento.datos_nuevos;
          const extras: string[] = [];
          if (d.codigo_acceso) extras.push(`Codigo: ${d.codigo_acceso}`);
          if (d.tipo_sesion) extras.push(`Tipo: ${d.tipo_sesion}`);
          if (extras.length > 0) {
            detalleExtra = `<div style="margin-top:3px;font-size:10px;color:#475569;">${extras.join(' | ')}</div>`;
          }
        }

        return `
          <div style="display:flex;align-items:flex-start;margin-bottom:10px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};margin-top:4px;margin-right:10px;flex-shrink:0;"></div>
            <div style="flex:1;">
              <div style="font-size:11px;font-weight:bold;color:${color};">${label}</div>
              <div style="font-size:10px;color:#475569;">${usuario ? usuario + ' · ' : ''}${fecha}</div>
              ${detalleExtra}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;">
          <div style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-family:monospace;font-size:13px;font-weight:bold;color:#1e3a8a;">${sesion.codigo_acceso || 'N/A'}</span>
                <span style="font-size:13px;font-weight:bold;color:#1e3a8a;margin-left:10px;">${sesion.quiz_titulo || sesion.nombre_grupo || 'Sin titulo'}</span>
              </div>
              <span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:9px;font-weight:bold;color:white;background:${badgeColor};">${badgeLabel}</span>
            </div>
            <div style="font-size:11px;color:#475569;margin-top:6px;">
              <span>📘 ${sesion.materia?.nombre || 'N/A'} (${sesion.materia?.codigo || ''})</span>
              <span style="margin-left:12px;">👤 ${profesorNombre}</span>
            </div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">
              <span>📅 ${fmtFecha(sesion.fecha_inicio)} - ${fmtFecha(sesion.fecha_fin)}</span>
              <span style="margin-left:12px;">🎯 ${sesion.quiz_modo_juego || 'Igual'} / ${sesion.quiz_ponderacion || 100} pts</span>
              <span style="margin-left:12px;">📝 ${sesion.quiz_cantidad_preguntas || 0} preguntas</span>
            </div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">
              <span>👥 ${sesion.total_participantes || 0} participantes</span>
            </div>
          </div>
          ${timelineHTML ? `
          <div style="padding:12px 16px;">
            <div style="font-size:12px;font-weight:bold;color:#1e3a8a;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Historial</div>
            ${timelineHTML}
          </div>
          ` : `
          <div style="padding:12px 16px;text-align:center;font-size:11px;color:#94a3b8;">
            Sin eventos registrados
          </div>
          `}
          ${(sesion.participantes || []).length > 0 ? `
          <div style="padding:12px 16px;border-top:1px solid #e2e8f0;">
            <div style="font-size:12px;font-weight:bold;color:#1e3a8a;margin-bottom:8px;">Ranking de Participantes</div>
            <table style="width:100%;border-collapse:collapse;font-size:10px;">
              <thead>
                <tr style="background:#1e3a8a;color:white;">
                  <th style="padding:5px 6px;text-align:left;">#</th>
                  <th style="padding:5px 6px;text-align:left;">Nombre</th>
                  <th style="padding:5px 6px;text-align:left;">Email</th>
                  <th style="padding:5px 6px;text-align:left;">Nota</th>
                  <th style="padding:5px 6px;text-align:left;">Tiempo</th>
                  <th style="padding:5px 6px;text-align:left;">Rep.</th>
                </tr>
              </thead>
              <tbody>
                ${[...sesion.participantes]
                  .sort((a, b) => b.nota_final - a.nota_final)
                  .map((p, idx) => `
                    <tr style="page-break-inside:avoid;">
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${p.nombre} ${p.apellido}</td>
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;color:#64748b;">${p.email || ''}</td>
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#1e3a8a;">${p.nota_final}/${sesion.quiz_ponderacion || 100}</td>
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${fmtTiempo(p.tiempo_total_ms)}</td>
                      <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${p.repeticiones || 0}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
          ` : `
          <div style="padding:12px 16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
            Sin participantes
          </div>
          `}
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
          .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
          .stat-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
          .stat-value { font-size: 22px; font-weight: bold; color: #1e3a8a; }
          .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
          .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        ${membrete}

        ${filtrosActivos.busqueda || filtrosActivos.estatus !== 'todos' || filtrosActivos.tiempo !== 'todos' ? filtrosHTML : ''}

        <div class="section-title">Resumen</div>
        <div class="stats-grid">
          <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#34C759;">${activas}</div><div class="stat-label">Activas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#007AFF;">${agendadas}</div><div class="stat-label">Agendadas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#FF9500;">${expiradas}</div><div class="stat-label">Expiradas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#999999;">${inactivas}</div><div class="stat-label">Inactivas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#FF3B30;">${eliminadas}</div><div class="stat-label">Eliminadas</div></div>
        </div>

        <div class="section-title">Sesiones (${total})</div>
        ${sesionesFiltradas.length > 0 ? sesionesHTML : '<div style="color:#999;font-style:italic;font-size:11px;text-align:center;padding:8px;">No hay sesiones que mostrar</div>'}

        <div class="footer">
          <p>UNIDAD EDUCATIVA INSTITUTO METROPOLITANO ADVENTISTA - San Cristobal, Estado Tachira</p>
          <p>Este informe fue generado automaticamente el ${fechaGeneracion}</p>
        </div>
      </body>
      </html>
    `;
    await generarPDFBase(html, `auditoria_sesiones_${Date.now()}.pdf`, 'Guardar informe de auditoria de sesiones');
  } catch (error) {
    console.error('Error al generar PDF de sesiones:', error);
    alert('Error al generar el PDF. Por favor intenta nuevamente.');
  }
};

// Genera PDF con el historial de cada materia y sus cambios a lo largo del tiempo
export const generarPDFMaterias = async (
  materiasFiltradas: any[],
  historialPorMateria: Record<string, any[]>,
  filtrosActivos: { busqueda: string; profesor: string; estatus: string; tiempo: string }
) => {
  try {
    const membrete = await generarMembreteHTML('Auditoria de Materias');
    const fechaGeneracion = new Date().toLocaleString('es-ES');

    // Helper: formatear fecha para PDF
    const fmtFecha = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      const fechaStr = typeof fecha === 'string' ? fecha : String(fecha);
      const fechaUtc = (fechaStr.includes('+') || fechaStr.endsWith('Z')) ? fechaStr : fechaStr + 'Z';
      const date = new Date(fechaUtc);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
    };

    // Helper: label de evento de materia
    const labelEvento = (evento: any): string => {
      const tipo = evento.tipo_operacion || '';
      if (tipo === 'MATERIA_CREACION') return 'Creada';
      if (tipo === 'MATERIA_ELIMINACION') return 'Eliminada';
      if (tipo === 'MATERIA_MODIFICACION') {
        const ant = evento.datos_anteriores;
        const nue = evento.datos_nuevos;
        if (ant?.activo !== undefined && nue?.activo !== undefined) {
          if (ant.activo === true && nue.activo === false) return 'Desactivada';
          if (ant.activo === false && nue.activo === true) return 'Activada';
        }
        return 'Modificada';
      }
      return tipo;
    };

    // Helper: color de evento
    const colorEvento = (evento: any): string => {
      const tipo = evento.tipo_operacion || '';
      if (tipo === 'MATERIA_CREACION') return '#22c55e';
      if (tipo === 'MATERIA_ELIMINACION') return '#ef4444';
      if (tipo === 'MATERIA_MODIFICACION') {
        const ant = evento.datos_anteriores;
        const nue = evento.datos_nuevos;
        if (ant?.activo !== undefined && nue?.activo !== undefined) {
          if (ant.activo === true && nue.activo === false) return '#f97316';
          if (ant.activo === false && nue.activo === true) return '#06b6d4';
        }
        return '#3b82f6';
      }
      return '#6b7280';
    };

    // Helper: detalle de cambios
    const detalleCambios = (evento: any): string => {
      if (evento.tipo_operacion !== 'MATERIA_MODIFICACION') return '';
      const ant = evento.datos_anteriores;
      const nue = evento.datos_nuevos;
      if (!ant || !nue) return '';
      const cambios: string[] = [];
      if (ant.nombre !== undefined && nue.nombre !== undefined && ant.nombre !== nue.nombre) {
        cambios.push(`nombre: ${ant.nombre} &rarr; ${nue.nombre}`);
      }
      if (ant.codigo !== undefined && nue.codigo !== undefined && ant.codigo !== nue.codigo) {
        cambios.push(`codigo: ${ant.codigo} &rarr; ${nue.codigo}`);
      }
      if (ant.profesor_id !== undefined && nue.profesor_id !== undefined && ant.profesor_id !== nue.profesor_id) {
        const nombreAnt = ant.profesor_nombre || `ID: ${ant.profesor_id}`;
        const nombreNue = nue.profesor_nombre || `ID: ${nue.profesor_id}`;
        cambios.push(`profesor: ${nombreAnt} &rarr; ${nombreNue}`);
      }
      return cambios.length > 0 ? cambios.map(c => `<div style="margin-left:12px;font-size:10px;color:#475569;">&bull; ${c}</div>`).join('') : '';
    };

    // Contar estadísticas
    const total = materiasFiltradas.length;
    const activas = materiasFiltradas.filter(m => m.activo && !m.eliminada).length;
    const desactivadas = materiasFiltradas.filter(m => !m.activo && !m.eliminada).length;
    const eliminadas = materiasFiltradas.filter(m => m.eliminada).length;

    // Construir HTML de filtros
    const filtrosHTML = `
      <div style="background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:16px;font-size:11px;">
        <strong style="color:#1e3a8a;">Filtros aplicados:</strong>
        <span style="color:#475569;">
          ${filtrosActivos.busqueda ? `Busqueda: "${filtrosActivos.busqueda}"` : ''}
          ${filtrosActivos.profesor ? ` | Profesor: ${filtrosActivos.profesor}` : ''}
          ${filtrosActivos.estatus !== 'todos' ? ` | Estatus: ${filtrosActivos.estatus}` : ''}
          ${filtrosActivos.tiempo !== 'todos' ? ` | Tiempo: ${filtrosActivos.tiempo}` : ''}
          ${!filtrosActivos.busqueda && !filtrosActivos.profesor && filtrosActivos.estatus === 'todos' && filtrosActivos.tiempo === 'todos' ? 'Sin filtros (mostrando todos)' : ''}
        </span>
      </div>
    `;

    // Construir HTML de cada materia
    const materiasHTML = materiasFiltradas.map((materia, idx) => {
      const prof = materia.profesor_actual || {};
      const badgeClass = materia.eliminada ? 'badge-red' : materia.activo ? 'badge-green' : 'badge-orange';
      const labelEstado = materia.eliminada ? 'Eliminada' : materia.activo ? 'Activa' : 'Desactivada';
      const eventos = historialPorMateria[materia.materia_id] || [];
      const eventosOrdenados = [...eventos].sort((a: any, b: any) => {
        const diff = new Date(a.fecha_operacion).getTime() - new Date(b.fecha_operacion).getTime();
        if (diff !== 0) return diff;
        const order: Record<string, number> = { MATERIA_CREACION: 0, MATERIA_MODIFICACION: 1, MATERIA_ELIMINACION: 2 };
        return (order[a.tipo_operacion] ?? 1) - (order[b.tipo_operacion] ?? 1);
      });

      return `
        <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;">
          <div style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="font-size:14px;color:#1e3a8a;">${materia.nombre}</strong>
                <span style="font-size:11px;color:#64748b;margin-left:8px;">(${materia.codigo})</span>
              </div>
              <span class="badge ${badgeClass}">${labelEstado}</span>
            </div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">
              <span>Dictada por: ${prof.nombre || ''} ${prof.apellido || ''}</span>
              <span style="margin-left:12px;">Fecha Creacion: ${fmtFecha(materia.fecha_creacion)}</span>
            </div>
          </div>
          ${materia.eliminada && materia.eliminado_por ? `
          <div style="padding:8px 16px;background:#fef2f2;border-bottom:1px solid #fecaca;">
            <div style="font-size:11px;color:#991b1b;">
              Eliminado por: ${materia.eliminado_por.nombre || ''} ${materia.eliminado_por.apellido || ''}
              ${materia.fecha_eliminacion ? ` | Fecha: ${fmtFecha(materia.fecha_eliminacion)}` : ''}
            </div>
          </div>
          ` : ''}
          ${eventosOrdenados.length > 0 ? `
          <div style="padding:12px 16px;">
            <div style="font-size:12px;font-weight:bold;color:#1e3a8a;margin-bottom:8px;">Historial</div>
            ${eventosOrdenados.map((evento: any) => {
              const color = colorEvento(evento);
              const label = labelEvento(evento);
              const detalle = detalleCambios(evento);
              const esCreacion = evento.tipo_operacion === 'MATERIA_CREACION';
              const profNombre = esCreacion && evento.usuario ? `${evento.usuario.nombre} ${evento.usuario.apellido}` : '';
              return `
                <div class="timeline-event" style="display:flex;align-items:flex-start;margin-bottom:8px;">
                  <div style="width:10px;height:10px;border-radius:50%;background:${color};margin-top:4px;margin-right:10px;flex-shrink:0;"></div>
                  <div>
                    <div style="font-size:12px;font-weight:bold;color:${color};">${label}</div>
                    ${profNombre ? `<div style="font-size:10px;color:#475569;">Profesor: ${profNombre}</div>` : ''}
                    ${detalle}
                    <div style="font-size:10px;color:#64748b;">${fmtFecha(evento.fecha_operacion)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ` : `
          <div style="padding:12px 16px;text-align:center;font-size:11px;color:#94a3b8;">
            Sin eventos registrados
          </div>
          `}
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
          .stat-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
          .stat-value { font-size: 22px; font-weight: bold; color: #1e3a8a; }
          .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: bold; color: white; }
          .badge-green { background: #22c55e; }
          .badge-red { background: #ef4444; }
          .badge-orange { background: #f97316; }
          .timeline-event { page-break-inside: avoid; }
          .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        ${membrete}

        ${filtrosActivos.busqueda || filtrosActivos.profesor || filtrosActivos.estatus !== 'todos' || filtrosActivos.tiempo !== 'todos' ? filtrosHTML : ''}

        <div class="section-title">Resumen</div>
        <div class="stats-grid">
          <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total Materias</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#22c55e;">${activas}</div><div class="stat-label">Activas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#f97316;">${desactivadas}</div><div class="stat-label">Desactivadas</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#ef4444;">${eliminadas}</div><div class="stat-label">Eliminadas</div></div>
        </div>

        <div class="section-title">Materias (${total})</div>
        ${materiasFiltradas.length > 0 ? materiasHTML : '<div style="color:#999;font-style:italic;font-size:11px;text-align:center;padding:8px;">No hay materias que mostrar</div>'}

        <div class="footer">
          <p>UNIDAD EDUCATIVA INSTITUTO METROPOLITANO ADVENTISTA - San Cristobal, Estado Tachira</p>
          <p>Este informe fue generado automaticamente el ${fechaGeneracion}</p>
        </div>
      </body>
      </html>
    `;
    await generarPDFBase(html, `auditoria_materias_${Date.now()}.pdf`, 'Guardar informe de auditoria de materias');
  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('Error al generar el PDF. Por favor intenta nuevamente.');
  }
};



// Genera PDF con todas las estadisticas del sistema en un solo reporte
export const generarPDFAuditoriaCompleta = async (
  estadisticas: EstadisticasGenerales,
  quices: QuizCreado[],
  sesiones: SesionReciente[],
  materias: MateriaAuditoria[],
) => {
  try {
    const membrete = await generarMembreteHTML('📊 Auditoría Completa del Sistema');
    const fechaGeneracion = new Date().toLocaleString('es-ES');

    const quicesArray = Array.isArray(quices) ? quices : [];
    const sesionesArray = Array.isArray(sesiones) ? sesiones : [];
    const materiasArray = Array.isArray(materias) ? materias : [];

    const totalParticipantes = sesionesArray.reduce((sum, s) => sum + (s.total_participantes || 0), 0);
    const promParticipantes = sesionesArray.length > 0
      ? (totalParticipantes / sesionesArray.length).toFixed(1) : '0';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .stat-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
          .stat-value { font-size: 22px; font-weight: bold; color: #1e3a8a; }
          .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
          .summary { background: #f0f9ff; padding: 10px 14px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 16px; font-size: 11px; color: #334155; }
          .summary span { font-weight: bold; color: #1e3a8a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
          th { background: #1e3a8a; color: white; padding: 7px 6px; text-align: left; font-size: 10px; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          tbody { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: bold; color: white; }
          .badge-green { background: #34C759; }
          .badge-blue { background: #007AFF; }
          .badge-orange { background: #FF9500; }
          .badge-red { background: #FF3B30; }
          .badge-gray { background: #999999; }
          .empty { color: #999; font-style: italic; font-size: 11px; text-align: center; padding: 8px; }
          .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        ${membrete}

        <div class="section">
          <div class="section-title">📈 Estadísticas Generales</div>
          <div class="stats-grid">
            <div class="stat-item"><div class="stat-value">${estadisticas?.total_quizes || 0}</div><div class="stat-label">Total Quices</div></div>
            <div class="stat-item"><div class="stat-value">${estadisticas?.total_materias || 0}</div><div class="stat-label">Total Materias</div></div>
            <div class="stat-item"><div class="stat-value">${estadisticas?.total_usuarios_activos || 0}</div><div class="stat-label">Usuarios Activos</div></div>
            <div class="stat-item"><div class="stat-value">${estadisticas?.sesiones_activas || 0}</div><div class="stat-label">Sesiones Activas</div></div>
          </div>
          <div class="summary">
            <strong>Resumen de Actividad:</strong>
            Promedio participantes por sesión: <span>${promParticipantes}</span>
          </div>
          ${estadisticas?.usuarios_por_rol && estadisticas.usuarios_por_rol.length > 0 ? `
          <table>
            <thead><tr><th>Rol</th><th>Cantidad</th></tr></thead>
            <tbody>
            ${estadisticas.usuarios_por_rol.map((rol: any) => `<tr><td>${rol.rol}</td><td>${rol.cantidad}</td></tr>`).join('')}
            </tbody>
          </table>` : ''}
        </div>

        <div class="section">
          <div class="section-title">🎯 Quices Recientes (${quicesArray.length})</div>
          ${quicesArray.length > 0 ? `
          <table>
            <thead><tr><th>#</th><th>Título</th><th>Profesor</th><th>Materia</th><th>Pregs.</th><th>Fecha</th></tr></thead>
            <tbody>
            ${quicesArray.filter(q => q).slice(0, 50).map((q, i) => {
              const prof = q.profesor || (q as any).creador || {};
              const mat = q.materia || {};
              const fecha = q.fecha_creacion ? new Date(q.fecha_creacion).toLocaleDateString('es-ES') : 'N/A';
              return `<tr><td>${i + 1}</td><td>${(q.titulo || 'Sin título').substring(0, 40)}</td><td>${prof.nombre || ''} ${prof.apellido || ''}</td><td>${mat.nombre || 'N/A'}</td><td>${q.cantidad_preguntas || 0}</td><td>${fecha}</td></tr>`;
            }).join('')}
            </tbody>
          </table>` : '<div class="empty">No hay quices registrados</div>'}
        </div>

        <div class="section">
          <div class="section-title">📚 Materias (${materiasArray.length})</div>
          ${materiasArray.length > 0 ? `
          <table>
            <thead><tr><th>#</th><th>Materia</th><th>Código</th><th>Profesor</th><th>Sesiones</th><th>Estado</th></tr></thead>
            <tbody>
            ${materiasArray.filter(m => m).map((m, i) => {
              const prof = m.profesor_actual || {};
              return `<tr><td>${i + 1}</td><td>${m.nombre}</td><td>${m.codigo}</td><td>${prof.nombre || ''} ${prof.apellido || ''}</td><td>${m.estadisticas?.sesiones_activas || 0}</td><td>${m.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td></tr>`;
            }).join('')}
            </tbody>
          </table>` : '<div class="empty">No hay materias registradas</div>'}
        </div>

        <div class="section">
          <div class="section-title">🎯 Sesiones Recientes (${sesionesArray.length})</div>
          ${sesionesArray.length > 0 ? `
          <table>
            <thead><tr><th>#</th><th>Nombre</th><th>Materia</th><th>Código</th><th>Partic.</th><th>Estado</th><th>Período</th></tr></thead>
            <tbody>
            ${sesionesArray.filter(s => s).slice(0, 30).map((s, i) => {
              const fmt = (f: string) => f ? new Date(f).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' }) : '?';
              const ahora = new Date();
              let estado = 'Activa';
              let badgeClass = 'badge-green';
              if (s.eliminado) {
                estado = 'Eliminada';
                badgeClass = 'badge-red';
              } else if (!s.activo) {
                estado = 'Inactiva';
                badgeClass = 'badge-gray';
              } else if (s.fecha_inicio && new Date(s.fecha_inicio) > ahora) {
                estado = 'Agendada';
                badgeClass = 'badge-blue';
              } else if (s.fecha_fin && new Date(s.fecha_fin) < ahora) {
                estado = 'Expirada';
                badgeClass = 'badge-orange';
              }
              const totalPart = s.total_participantes || s.participantes?.length || 0;
              return `<tr><td>${i + 1}</td><td>${(s.nombre_grupo || 'Sin nombre').substring(0, 30)}</td><td>${s.materia?.nombre || 'N/A'}</td><td>${s.codigo_acceso || 'N/A'}</td><td>${totalPart}</td><td><span class="badge ${badgeClass}">${estado}</span></td><td>${fmt(s.fecha_inicio)} - ${fmt(s.fecha_fin)}</td></tr>`;
            }).join('')}
            </tbody>
          </table>` : '<div class="empty">No hay sesiones registradas</div>'}
        </div>

        <div class="footer">
          <p>UNIDAD EDUCATIVA INSTITUTO METROPOLITANO ADVENTISTA - San Cristóbal, Estado Táchira</p>
          <p>Este informe fue generado automáticamente el ${fechaGeneracion}</p>
        </div>
      </body>
      </html>
    `;
    await generarPDFBase(html, `auditoria_completa_${Date.now()}.pdf`, 'Guardar auditoría completa');
  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('Error al generar el PDF. Por favor intenta nuevamente.');
  }
};

// Traduce nombres de columnas de la BD a etiquetas en espanol para el PDF
const formatearCampoBitacora = (campo: string): string => {
  const map: Record<string, string> = {
    'usu_nombre': 'Nombre',
    'usu_apellido': 'Apellido',
    'usu_email': 'Email',
    'usu_activo': 'Estado',
    'usu_fk_rol': 'Rol',
    'usu_imagen': 'Foto',
    'usu_puntos_app': 'Puntos',
    'usu_contrasena': 'Contraseña',
  };
  return map[campo] || campo;
};

// Convierte el codigo de operacion en una etiqueta legible
const labelBitacora = (tipo: string): string => {
  const map: Record<string, string> = {
    'USUARIO_CREACION': 'REGISTRO',
    'USUARIO_LOGIN': 'INICIO DE SESIÓN',
    'USUARIO_LOGOUT': 'CIERRE DE SESIÓN',
    'USUARIO_MODIFICACION': 'MODIFICACIÓN DE PERFIL',
    'USUARIO_DESACTIVACION': 'CAMBIO DE ESTADO',
    'USUARIO_ELIMINACION': 'ELIMINACIÓN DE USUARIO',
    'LOGRO_OBTENIDO': 'LOGRO OBTENIDO',
    'SESION_INICIO': 'INGRESO A SESIÓN',
    'SESION_RESULTADO': 'QUIZ COMPLETADO',
    'SESION_CREACION': 'SESIÓN CREADA',
    'SESION_MODIFICACION': 'SESIÓN DESACTIVADA',
    'SESION_ELIMINACION': 'SESIÓN ELIMINADA',
    'QUIZ_CREACION': 'QUIZ CREADO',
    'QUIZ_MODIFICACION': 'QUIZ MODIFICADO',
    'QUIZ_ELIMINACION': 'QUIZ ELIMINADO',
    'MATERIA_CREACION': 'MATERIA CREADA',
    'MATERIA_MODIFICACION': 'MATERIA MODIFICADA',
    'MATERIA_ELIMINACION': 'MATERIA ELIMINADA',
    'PDF_GENERACION': 'PDF GENERADO',
  };
  return map[tipo] || tipo.replace(/_/g, ' ');
};

// Asigna un color a cada tipo de operacion para distinguirlas visualmente
const colorBitacoraHex = (tipo: string): string => {
  if (tipo === 'USUARIO_CREACION' || tipo === 'USUARIO_LOGIN') return '#22c55e';
  if (tipo === 'LOGRO_OBTENIDO') return '#eab308';
  if (tipo === 'USUARIO_MODIFICACION') return '#f59e0b';
  if (tipo === 'USUARIO_DESACTIVACION') return '#f97316';
  if (tipo.includes('ELIMINACION')) return '#ef4444';
  if (tipo === 'SESION_RESULTADO') return '#16a34a';
  if (tipo === 'SESION_INICIO' || tipo === 'SESION_CREACION') return '#8b5cf6';
  if (tipo === 'SESION_MODIFICACION') return '#d97706';
  if (tipo.includes('QUIZ')) return '#2563eb';
  if (tipo.includes('MATERIA')) return '#0891b2';
  if (tipo === 'USUARIO_LOGOUT') return '#94a3b8';
  if (tipo === 'PDF_GENERACION') return '#0ea5e9';
  return '#6b7280';
};

// Saca las iniciales del nombre y apellido para el avatar en el PDF
const getInitialsLocal = (nombre?: string, apellido?: string): string => {
  const f = nombre?.charAt(0).toUpperCase() || '';
  const l = apellido?.charAt(0).toUpperCase() || '';
  return f + l || '👤';
};



// Arma el HTML de una entrada individual en la bitacora de usuarios
const construirEntradaBitacora = (
  acc: any,
  fmtFechaHora: (f: string | undefined | null) => string,
  currentUserId?: number
): string => {
  const t = acc.tipo_operacion || '';
  const d = acc.detalles || {};
  const actor = acc.usuario;
  const fecha = fmtFechaHora(acc.fecha_operacion);
  const label = labelBitacora(t);
  const color = colorBitacoraHex(t);

  let descripcion = '';
  let detallesExtra = '';

  if (t === 'USUARIO_CREACION') {
    descripcion = 'Se registró en la plataforma';
  } else if (t === 'USUARIO_LOGIN') {
    descripcion = 'Inició sesión en la plataforma';
  } else if (t === 'USUARIO_LOGOUT') {
    descripcion = 'Cerró sesión en la plataforma';
  } else if (t === 'USUARIO_MODIFICACION') {
    const target = d.usuario_afectado;
    const targetName = target ? `${target.nombre} ${target.apellido || ''}`.trim() : 'su perfil';
    const actorName = actor ? `${actor.nombre} ${actor.apellido || ''}`.trim() : '';
    if (actorName && target) {
      descripcion = `${actorName} modificó el perfil de ${targetName}`;
    } else {
      descripcion = 'Modificó su perfil';
    }
    const cambio = acc.cambio;
    const campos: string[] = [];
    let fotoCambiada = false;
    if (cambio?.datos_nuevos && typeof cambio.datos_nuevos === 'object') {
      Object.entries(cambio.datos_nuevos).forEach(([campo, valores]: [string, any]) => {
        if (valores && typeof valores === 'object' && 'anterior' in valores && 'nuevo' in valores) {
          if (campo === 'usu_imagen') {
            fotoCambiada = true;
          } else {
            const campoLbl = formatearCampoBitacora(campo);
            const vAnt = valores.anterior === null || valores.anterior === undefined ? '(vacío)' : String(valores.anterior);
            const vNue = valores.nuevo === null || valores.nuevo === undefined ? '(vacío)' : String(valores.nuevo);
            campos.push(`${campoLbl}: ${vAnt} → ${vNue}`);
          }
        }
      });
    }
    const camposHTML = campos.length > 0
      ? campos.map(c => `<div style="font-size:9px;color:#475569;padding-left:8px;margin-top:2px;">• ${c}</div>`).join('')
      : '';
    const fotoHTML = fotoCambiada
      ? `<div style="font-size:9px;color:#475569;padding-left:8px;margin-top:2px;">• 📷 Foto de perfil actualizada</div>`
      : '';
    detallesExtra = camposHTML + fotoHTML;
  } else if (t === 'USUARIO_DESACTIVACION') {
    const activar = acc.cambio?.datos_nuevos?.activo === true;
    const target = d.usuario_afectado;
    const targetName = target ? `${target.nombre} ${target.apellido || ''}`.trim() : 'la cuenta';
    const actorName = actor ? `${actor.nombre} ${actor.apellido || ''}`.trim() : '';
    if (actorName) {
      descripcion = activar
        ? `${actorName} activó la cuenta de ${targetName}`
        : `${actorName} desactivó la cuenta de ${targetName}`;
    } else {
      descripcion = activar ? 'Cuenta activada' : 'Cuenta desactivada';
    }
  } else if (t === 'USUARIO_ELIMINACION') {
    const target = d.usuario_afectado;
    const targetName = target ? `${target.nombre} ${target.apellido || ''}`.trim() : 'un usuario';
    const actorName = actor ? `${actor.nombre} ${actor.apellido || ''}`.trim() : '';
    descripcion = actorName ? `${actorName} eliminó a ${targetName}` : 'Usuario eliminado';
  } else if (t === 'LOGRO_OBTENIDO') {
    const nombre = d.logro_nombre || d.logro_codigo || 'Logro';
    const pts = d.logro_puntos || d.puntos_recompensa || 0;
    descripcion = `Obtuvo el logro "${nombre}"`;
    if (pts > 0) descripcion += ` (+${pts} pts)`;
  } else if (t === 'SESION_INICIO') {
    const quiz = d.quiz_titulo || 'Quiz';
    const codigo = d.codigo_acceso ? `Código: ${d.codigo_acceso}` : '';
    descripcion = `Ingresó a la sesión "${quiz}"`;
    if (codigo) descripcion += ` (${codigo})`;
  } else if (t === 'SESION_RESULTADO') {
    const quiz = d.quiz_titulo || 'Quiz';
    const nota = d.nota_final;
    const escala = d.escala_puntuacion || 100;
    const rep = d.es_repeticion ? ' (repetición)' : '';
    const materia = d.materia_nombre || '';
    const tiempo = d.tiempo_total_ms ? `${Math.round(d.tiempo_total_ms / 1000)}s` : '';
    descripcion = `Completó "${quiz}"`;
    if (nota !== undefined && nota !== null) descripcion += ` — Nota: ${nota}/${escala}`;
    descripcion += rep;
    const extras: string[] = [];
    if (materia) extras.push(`📘 ${materia}`);
    if (tiempo) extras.push(`⏱️ ${tiempo}`);
    if (extras.length > 0) {
      detallesExtra = `<div style="font-size:9px;color:#475569;padding-left:8px;margin-top:2px;">${extras.join(' · ')}</div>`;
    }
  } else if (t === 'SESION_CREACION') {
    const quiz = d.quiz_titulo || '';
    const codigo = d.codigo_acceso || '';
    const materia = d.materia_nombre || '';
    const modo = d.modo_juego || '';
    descripcion = `Creó sesión${quiz ? ` "${quiz}"` : ''}`;
    const extras: string[] = [];
    if (codigo) extras.push(`Código: ${codigo}`);
    if (materia) extras.push(`📘 ${materia}`);
    if (modo) extras.push(`🎯 ${modo}`);
    if (extras.length > 0) {
      detallesExtra = `<div style="font-size:9px;color:#475569;padding-left:8px;margin-top:2px;">${extras.join(' · ')}</div>`;
    }
  } else if (t === 'SESION_MODIFICACION') {
    const quiz = d.quiz_titulo || '';
    const codigo = d.codigo_acceso || acc.cambio?.datos_nuevos?.codigo_acceso || '';
    descripcion = quiz ? `Desactivó sesión "${quiz}"` : 'Desactivó sesión';
    if (codigo) descripcion += ` (Código: ${codigo})`;
  } else if (t === 'SESION_ELIMINACION') {
    const quiz = d.quiz_titulo || '';
    const codigo = d.codigo_acceso || '';
    descripcion = quiz ? `Eliminó sesión "${quiz}"` : 'Eliminó sesión';
    if (codigo) descripcion += ` (Código: ${codigo})`;
  } else if (t === 'QUIZ_CREACION') {
    const quiz = d.quiz_titulo || 'Quiz';
    const mat = d.materia_nombre || d.materia?.nombre || '';
    descripcion = `Creó quiz "${quiz}"`;
    if (mat) descripcion += ` — ${mat}`;
  } else if (t === 'QUIZ_MODIFICACION') {
    descripcion = `Modificó quiz "${d.quiz_titulo || 'Quiz'}"`;
  } else if (t === 'QUIZ_ELIMINACION') {
    descripcion = `Eliminó quiz "${d.quiz_titulo || 'Quiz'}"`;
  } else if (t === 'MATERIA_CREACION') {
    if (actor?.id === currentUserId) {
      descripcion = `Creó la materia "${d.materia_nombre || ''}"${d.materia_codigo ? ` (${d.materia_codigo})` : ''}`;
    } else {
      descripcion = `Le fue asignada la materia "${d.materia_nombre || ''}"${d.materia_codigo ? ` (${d.materia_codigo})` : ''}`;
    }
  } else if (t === 'MATERIA_MODIFICACION') {
    descripcion = `Modificó materia: ${d.materia_nombre || ''}`;
  } else if (t === 'MATERIA_ELIMINACION') {
    descripcion = `Eliminó materia: ${d.materia_nombre || ''}`;
  } else if (t === 'PDF_GENERACION') {
    descripcion = `Generó PDF: ${d.tipo_pdf || 'reporte'}`;
  } else {
    descripcion = acc.nombre_operacion || acc.tipo_operacion || 'Acción desconocida';
  }

  return `
    <div style="margin-bottom:10px;page-break-inside:avoid;">
      <div style="font-size:9px;color:#94a3b8;margin-bottom:3px;font-family:monospace;">${fecha}</div>
      <div style="border-left:3px solid ${color};padding:7px 10px;background:#f8fafc;border-radius:4px;">
        <div style="font-size:10px;font-weight:bold;color:${color};margin-bottom:2px;">${label}</div>
        <div style="font-size:10px;color:#334155;">${descripcion}</div>
        ${detallesExtra ? `<div style="margin-top:3px;border-top:1px dashed #e2e8f0;padding-top:3px;">${detallesExtra}</div>` : ''}
      </div>
    </div>
  `;
};

// Genera PDF con la bitacora completa de cada usuario y sus movimientos
export const generarPDFUsuarios = async (
  usuariosFiltrados: any[],
  filtrosActivos: { busqueda: string; rol: string; estado: string; tiempo: string }
) => {
  try {
    const membrete = await generarMembreteHTML('Bitácora de Auditoría de Usuarios');
    const fechaGeneracion = new Date().toLocaleString('es-ES');

    const total = usuariosFiltrados.length;
    const activos = usuariosFiltrados.filter(u => u.usuario.activo && !u.usuario.eliminado).length;
    const inactivos = usuariosFiltrados.filter(u => !u.usuario.activo && !u.usuario.eliminado).length;
    const eliminados = usuariosFiltrados.filter(u => u.usuario.eliminado).length;

    const fmtFecha = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      try { return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { return 'N/A'; }
    };

    const fmtFechaHora = (fecha: string | undefined | null): string => {
      if (!fecha) return 'N/A';
      const fe = typeof fecha === 'string' ? fecha : String(fecha);
      const fUtc = (fe.includes('+') || fe.endsWith('Z')) ? fe : fe + 'Z';
      try {
        return new Date(fUtc).toLocaleString('es-ES', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Caracas'
        });
      } catch { return 'N/A'; }
    };

    const rolBadge = (rolId: number) => {
      if (rolId === 3) return '<span class="badge badge-purple">Admin</span>';
      if (rolId === 2) return '<span class="badge badge-blue">Profesor</span>';
      return '<span class="badge badge-green">Alumno</span>';
    };

    const estadoBadge = (u: any) => {
      if (u.usuario.eliminado) return '<span class="badge badge-red">Eliminado</span>';
      if (u.usuario.activo) return '<span class="badge badge-green">Activo</span>';
      return '<span class="badge badge-orange">Inactivo</span>';
    };

    const usuarioCardHTML = usuariosFiltrados.map((u) => {
      const historial = u.historial_completo || [];
      const stats = u.estadisticas || {};

      let statsHTML = '';
      if (u.usuario.rol_id === 1) {
        statsHTML = `
          <span style="font-size:10px;color:#475569;">📝 ${stats.total_quices_realizados || 0} quizzes</span>
          <span style="font-size:10px;color:#475569;margin-left:8px;">📊 Prom: ${stats.promedio_nota || 0}/20</span>
          <span style="font-size:10px;color:#475569;margin-left:8px;">⭐ ${u.usuario.puntos_app || 0} pts</span>`;
      } else if (u.usuario.rol_id === 2) {
        statsHTML = `
          <span style="font-size:10px;color:#475569;">📝 ${stats.total_quizes_creados || 0} quices</span>
          <span style="font-size:10px;color:#475569;margin-left:8px;">🎯 ${stats.total_sesiones || 0} sesiones</span>
          <span style="font-size:10px;color:#475569;margin-left:8px;">👥 ${stats.total_participantes || 0} eval.</span>`;
      }

      const bitacoraHTML = historial.length > 0
        ? historial.map((acc: any) => construirEntradaBitacora(acc, fmtFechaHora, u.usuario.id)).join('')
        : '<div style="font-size:10px;color:#94a3b8;font-style:italic;text-align:center;padding:12px;">Sin movimientos registrados</div>';

      return `
        <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:36px;height:36px;border-radius:50%;background:${u.usuario.rol_id === 3 ? '#7c3aed' : u.usuario.rol_id === 2 ? '#2563eb' : '#059669'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;color:white;flex-shrink:0;">${getInitialsLocal(u.usuario.nombre, u.usuario.apellido)}</div>
                <div>
                  <span style="font-size:14px;font-weight:bold;color:#1e293b;">${u.usuario.nombre} ${u.usuario.apellido}</span>
                  ${rolBadge(u.usuario.rol_id)}
                  ${u.usuario.eliminado ? '<span class="badge badge-red" style="margin-left:4px;">Eliminado</span>' : ''}
                </div>
              </div>
              ${estadoBadge(u)}
            </div>
            <div style="font-size:10px;color:#64748b;margin-left:44px;">${u.usuario.email}</div>
            <div style="margin-top:4px;">${statsHTML}</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:4px;">
              Registro: ${fmtFecha(u.usuario.fecha_registro)}
              ${u.ultima_actividad ? ` · Última actividad: ${fmtFechaHora(u.ultima_actividad)}` : ''}
            </div>
          </div>
          <div style="padding:12px 16px;">
            <div style="font-size:11px;font-weight:bold;color:#1e3a8a;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
              📋 Bitácora de Movimientos (${historial.length})
            </div>
            ${bitacoraHTML}
          </div>
        </div>
      `;
    }).join('');

    const filtrosHTML = `
      <div style="background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:16px;font-size:11px;">
        <strong style="color:#1e3a8a;">Filtros aplicados:</strong>
        <span style="color:#475569;">
          ${filtrosActivos.busqueda ? `Búsqueda: "${filtrosActivos.busqueda}"` : ''}
          ${filtrosActivos.rol !== 'todos' ? ` | Rol: ${filtrosActivos.rol}` : ''}
          ${filtrosActivos.estado !== 'todos' ? ` | Estado: ${filtrosActivos.estado}` : ''}
          ${filtrosActivos.tiempo !== 'todos' ? ` | Tiempo: ${filtrosActivos.tiempo}` : ''}
          ${!filtrosActivos.busqueda && filtrosActivos.rol === 'todos' && filtrosActivos.estado === 'todos' && filtrosActivos.tiempo === 'todos' ? 'Sin filtros (mostrando todos)' : ''}
        </span>
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
          .stat-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
          .stat-value { font-size: 22px; font-weight: bold; color: #1e3a8a; }
          .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: bold; color: white; }
          .badge-green { background: #22c55e; }
          .badge-blue { background: #3b82f6; }
          .badge-purple { background: #7c3aed; }
          .badge-orange { background: #f97316; }
          .badge-red { background: #ef4444; }
          .empty { color: #999; font-style: italic; font-size: 11px; text-align: center; padding: 8px; }
          .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        ${membrete}

        ${filtrosActivos.busqueda || filtrosActivos.rol !== 'todos' || filtrosActivos.estado !== 'todos' || filtrosActivos.tiempo !== 'todos' ? filtrosHTML : ''}

        <div class="section-title">Resumen</div>
        <div class="stats-grid">
          <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total Usuarios</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#22c55e;">${activos}</div><div class="stat-label">Activos</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#f97316;">${inactivos}</div><div class="stat-label">Inactivos</div></div>
          <div class="stat-item"><div class="stat-value" style="color:#ef4444;">${eliminados}</div><div class="stat-label">Eliminados</div></div>
        </div>

        <div class="section-title">Bitácora por Usuario</div>
        ${usuarioCardHTML}

        <div class="footer">
          <p>UNIDAD EDUCATIVA INSTITUTO METROPOLITANO ADVENTISTA - San Cristóbal, Estado Táchira</p>
          <p>Este informe fue generado automáticamente el ${fechaGeneracion}</p>
        </div>
      </body>
      </html>
    `;
    await generarPDFBase(html, `auditoria_usuarios_${Date.now()}.pdf`, 'Guardar informe de auditoría de usuarios');
  } catch (error) {
    console.error('Error al generar PDF de usuarios:', error);
    alert('Error al generar el PDF. Por favor intenta nuevamente.');
  }
};

// Evitar que expo-router trate a este archivo como una ruta que requiere un componente por defecto
export default null;
