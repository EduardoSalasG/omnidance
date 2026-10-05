import PDFDocument from "pdfkit";

/**
 * Reporte PDF tabular genérico (exportes operativos). A4 vertical,
 * encabezado con título/subtítulo/resumen, tabla con header repetido en
 * cada página y numeración «Página X de Y» al pie.
 *
 * Las celdas se truncan a UNA línea con `widthOfString` + «…» y se dibujan
 * con `lineBreak:false` y sin `width` — así el texto nunca pasa por el
 * LineWrapper y no hay paginación implícita (pdfkit ≥0.16 asigna `width`
 * por defecto salvo con `lineBreak:false`, y cualquier texto bajo maxY
 * dispara un salto). El salto de página lo controla solo el loop de filas.
 */
export interface TableReport {
  title: string;
  /** Línea secundaria bajo el título (fecha del evento, scope, generación). */
  subtitle?: string;
  /** Líneas de resumen entre el subtítulo y la tabla (totales, conteos). */
  summary?: string[];
  headers: string[];
  rows: unknown[][];
}

const MARGIN = 40;
const ROW_H = 15;
const FONT_SIZE = 8.5;

export function buildTablePdf({
  title,
  subtitle,
  summary = [],
  headers,
  rows,
}: TableReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN + 20, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: title, Creator: "Omnidance" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - MARGIN * 2;
  const colW = width / Math.max(1, headers.length);
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - ROW_H;

  /** Texto que cabe en `maxW` puntos; si no, corta y cierra con «…». */
  const fit = (s: string, maxW: number) => {
    if (doc.widthOfString(s) <= maxW) return s;
    let t = s;
    while (t.length && doc.widthOfString(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  /** Texto crudo (lineBreak:false + sin width → sin wrapper → no pagina). */
  const cell = (s: string, x: number, y: number, numeric: boolean) => {
    const t = fit(s, colW - 8);
    const tx = numeric
      ? MARGIN + x + colW - 4 - doc.widthOfString(t)
      : MARGIN + x + 4;
    doc.text(t, tx, y, { lineBreak: false });
  };

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, width, ROW_H).fill("#1a1a2e");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(FONT_SIZE);
    headers.forEach((h, i) => cell(h, i * colW, y + 3.5, false));
    doc.y = y + ROW_H;
  };

  doc.font("Helvetica-Bold").fontSize(15).fillColor("#111111").text(title);
  if (subtitle) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(subtitle);
  }
  doc.moveDown(0.4);
  summary.forEach((s) => {
    doc.font("Helvetica").fontSize(9).fillColor("#222222").text(s);
  });
  doc.moveDown(0.8);

  drawHeader();
  doc.font("Helvetica").fontSize(FONT_SIZE);
  rows.forEach((row, r) => {
    if (doc.y > bottomLimit()) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(FONT_SIZE);
    }
    const y = doc.y;
    if (r % 2 === 1) {
      doc.rect(MARGIN, y, width, ROW_H).fill("#f3f3f6");
    }
    doc.fillColor("#222222");
    row.forEach((v, i) => {
      cell(
        v === null || v === undefined ? "" : String(v),
        i * colW,
        y + 3.5,
        typeof v === "number",
      );
    });
    doc.y = y + ROW_H;
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .strokeColor("#dddddd")
      .lineWidth(0.5)
      .stroke();
  });

  const pages = doc.bufferedPageRange();
  doc.font("Helvetica").fontSize(7.5).fillColor("#888888");
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    const label = `Página ${i + 1} de ${pages.count}`;
    doc.text(
      label,
      MARGIN + width - doc.widthOfString(label),
      doc.page.height - MARGIN,
      { lineBreak: false },
    );
  }

  doc.end();
  return done;
}
