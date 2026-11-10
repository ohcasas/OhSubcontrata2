import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ContratoFirmado } from '../services/pagos';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function fechaLarga(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
}

/** Página HTML del contrato firmado: texto exacto que se firmó + datos de la firma. */
export function htmlContrato(c: ContratoFirmado): string {
  const firma =
    c.estado === 'tacito'
      ? 'Conformidad tácita: el cliente no respondió en el plazo y la obra se dio por conforme.'
      : `Firmado electrónicamente por ${esc(c.firmante_nombre ?? '—')} el ${esc(fechaLarga(c.firmado_at))}.`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    @page { margin: 22mm 18mm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 4px; }
    .sub { text-align: center; color: #555; font-size: 10pt; margin-bottom: 18px; }
    pre { white-space: pre-wrap; font-family: inherit; margin: 0; text-align: justify; }
    .firma { margin-top: 26px; padding-top: 10px; border-top: 1px solid #999; font-size: 10.5pt; }
    .hash { font-family: monospace; font-size: 8.5pt; color: #555; word-break: break-all; margin-top: 6px; }
    .pie { margin-top: 18px; font-size: 8.5pt; color: #666; text-align: center; }
  </style></head><body>
    <h1>${esc(c.titulo)}</h1>
    <div class="sub">${c.tramo_titulo ? esc(c.tramo_titulo) + ' · ' : ''}3B Conecta</div>
    <pre>${esc(c.cuerpo)}</pre>
    <div class="firma">${firma}
      <div class="hash">Huella SHA-256 del texto: ${esc(c.hash)}</div>
    </div>
    <div class="pie">3B GROUP ARQUITECTURA, S.L.U. · NIF B02601367 · C/ Cervantes 39, 02250 Albacete · contacto3b@3bconecta.com</div>
  </body></html>`;
}

/** Genera el PDF y abre el menú de compartir/guardar del móvil. */
export async function compartirContratoPdf(c: ContratoFirmado): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: htmlContrato(c) });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite compartir archivos.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: c.titulo,
  });
}