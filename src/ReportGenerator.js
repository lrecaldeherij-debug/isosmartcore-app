// --- GENERADOR DE REPORTES NATIVO ---
// Este método usa la impresora de tu computadora directamente.

const imprimirReporte = (titulo, contenidoHTML) => {
  // 1. Abrimos una ventana nueva en blanco
  const ventana = window.open('', '_blank');
  
  // 2. Escribimos el reporte dentro de esa ventana
  ventana.document.write(`
    <html>
      <head>
        <title>${titulo}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
          .header { border-bottom: 3px solid #2c3e50; padding-bottom: 10px; margin-bottom: 20px; }
          .empresa { font-size: 24px; font-weight: bold; color: #2c3e50; }
          .titulo { font-size: 18px; color: #555; margin-top: 5px; }
          .fecha { font-size: 12px; color: #888; text-align: right; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th { background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          
          .firma-box { margin-top: 60px; display: flex; justify-content: space-around; }
          .firma { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 10px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="fecha">Fecha: ${new Date().toLocaleDateString()}</div>
          <div class="empresa">IsoSmartCore</div>
          <div class="titulo">REPORTE: ${titulo}</div>
        </div>

        ${contenidoHTML}

        <div class="firma-box">
          <div class="firma">Elaborado por</div>
          <div class="firma">Aprobado por</div>
        </div>
      </body>
    </html>
  `);

  ventana.document.close(); // Terminamos de escribir

  // 3. Esperamos un poquito y lanzamos la orden de imprimir
  setTimeout(() => {
    ventana.focus();
    ventana.print(); // ESTO ABRE EL CUADRO DE DIÁLOGO
    ventana.close(); // Cierra la ventana extra después
  }, 500);
}

// --- FUNCIÓN PÚBLICA: RIESGOS ---
export const generarPDFRiesgos = (riesgos) => {
  // Convertimos tus datos a filas de tabla HTML
  const filas = riesgos.map(r => `
    <tr>
      <td>${r.risk_description}</td>
      <td style="text-align:center">${r.probability_initial}</td>
      <td style="text-align:center">${r.impact_initial}</td>
      <td style="text-align:center; font-weight:bold">${r.score_initial}</td>
    </tr>
  `).join('');

  const html = `
    <table>
      <thead>
        <tr>
          <th>Descripción del Riesgo</th>
          <th style="text-align:center">Prob.</th>
          <th style="text-align:center">Imp.</th>
          <th style="text-align:center">Nivel</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;

  imprimirReporte("Matriz de Riesgos y Oportunidades", html);
}

// --- FUNCIÓN PÚBLICA: PERSONAL ---
export const generarPDFPersonal = (personal) => {
  const filas = personal.map(p => `
    <tr>
      <td><strong>${p.full_name}</strong></td>
      <td>${p.job_title}</td>
      <td>${p.status}</td>
      <td>${p.skills || '-'}</td>
    </tr>
  `).join('');

  const html = `
    <table>
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>Cargo</th>
          <th>Competencia</th>
          <th>Habilidades</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;

  imprimirReporte("Registro de Personal", html);
}