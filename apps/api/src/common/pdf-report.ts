import PDFDocument from "pdfkit";

/**
 * Reporte PDF tabular genérico (exportes operativos). A4 vertical,
 * encabezado con título/subtítulo/resumen, tabla con header repetido en
 * cada página y numeración «Página X de Y» al pie.
 *
 * Las celdas se truncan a UNA línea con `widthOfString` + «…» y se dibujan
 * con `lineBreak:false` y sin `width` - así el texto nunca pasa por el
 * LineWrapper y no hay paginación implícita (pdfkit ≥0.16 asigna `width`
 * por defecto salvo con `lineBreak:false`, y cualquier texto bajo maxY
 * dispara un salto). El salto de página lo controla solo el loop de filas.
 */
interface TableReport {
  title: string;
  /** Línea secundaria bajo el título (fecha del evento, scope, generación). */
  subtitle?: string;
  /** Líneas de resumen entre el subtítulo y la tabla (totales, conteos). */
  summary?: string[];
  /** KPIs como cards (misma lectura que los KPI del reporte web):
      borde suave, label muted en caps chica, valor bold. `newRow`
      inicia una fila nueva (métodos de pago van en su propia fila). */
  kpis?: { label: string; value: string; newRow?: boolean }[];
  headers: string[];
  /** Pesos de columna (fracciones del ancho, ~suma 1). Sin ellos el
      ancho se reparte parejo - columna # o fechas comen espacio de
      nombres largos. */
  colWidths?: readonly number[];
  rows: unknown[][];
}

const MARGIN = 40;
const ROW_H = 15;
const FONT_SIZE = 8.5;

// Paleta de marca (apps/web/src/app/globals.css): accent #7c3aed en el
// tema oscuro default; violeta suave para bandas y hover.
const BRAND = {
  accent: "#7c3aed",
  accentSoft: "#6d28d9",
  accentTint: "#ede9fe",
  ink: "#0b0b10",
  text: "#1f1f2a",
  muted: "#6b6b7a",
  line: "#e4e4ef",
};

export function buildTablePdf({
  title,
  subtitle,
  summary = [],
  kpis = [],
  headers,
  colWidths,
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
  // Ancho por columna: pesos explícitos o reparto parejo.
  const colWs = headers.map((_, i) =>
    colWidths?.[i] ? colWidths[i] * width : width / Math.max(1, headers.length),
  );
  const colX: number[] = [];
  colWs.reduce((acc, w) => {
    colX.push(acc);
    return acc + w;
  }, 0);
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - ROW_H;

  /** Texto que cabe en `maxW` puntos; si no, corta y cierra con «…». */
  const fit = (s: string, maxW: number) => {
    if (doc.widthOfString(s) <= maxW) return s;
    let t = s;
    while (t.length && doc.widthOfString(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  /** Texto crudo (lineBreak:false + sin width → sin wrapper → no pagina). */
  const cell = (s: string, i: number, y: number, numeric: boolean) => {
    const w = colWs[i] ?? 0;
    const t = fit(s, w - 8);
    const tx = numeric
      ? MARGIN + colX[i] + w - 4 - doc.widthOfString(t)
      : MARGIN + colX[i] + 4;
    doc.text(t, tx, y, { lineBreak: false });
  };

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, width, ROW_H).fill(BRAND.accent);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(FONT_SIZE);
    headers.forEach((h, i) => cell(h, i, y + 3.5, false));
    doc.y = y + ROW_H;
  };

  // Banda de marca en la parte superior de la página: línea accent +
  // wordmark, con aire real bajo el título del reporte.
  doc.rect(MARGIN, 18, width, 2.5).fill(BRAND.accent);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(BRAND.accentSoft)
    .text("Omnidance", MARGIN, 23, { lineBreak: false });
  doc.y = MARGIN + 8;

  // Header explícito a la izquierda (x = margen), título y
  // subtítulo multi-línea (academia en línea 1, período en línea 2).
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(BRAND.ink)
    .text(title, MARGIN, doc.y);
  if (subtitle) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(BRAND.muted)
      .text(subtitle, MARGIN, doc.y);
  }
  doc.moveDown(0.4);
  summary.forEach((s) => {
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.text).text(s);
  });
  doc.moveDown(0.8);

  // KPI cards en filas de 4 (mismo lenguaje visual que el reporte
  // web): `newRow` fuerza fila nueva (los métodos van aparte); con
  // más de 4 por fila hace wrap.
  if (kpis.length) {
    const GAP = 8;
    const PER_ROW = 4;
    const cardW = (width - GAP * (PER_ROW - 1)) / PER_ROW;
    const cardH = 34;
    // Segmentos por newRow, luego chunks de 4.
    const segs: (typeof kpis)[] = [[]];
    for (const k of kpis) {
      if (k.newRow && segs[segs.length - 1].length) segs.push([]);
      segs[segs.length - 1].push(k);
    }
    const lines = segs.flatMap((seg) => {
      const out: (typeof kpis)[] = [];
      for (let i = 0; i < seg.length; i += PER_ROW)
        out.push(seg.slice(i, i + PER_ROW));
      return out;
    });
    lines.forEach((line, li) => {
      if (li > 0) doc.y += 8;
      const y0 = doc.y;
      line.forEach((k, i) => {
        const x = MARGIN + i * (cardW + GAP);
        doc
          .roundedRect(x, y0, cardW, cardH, 4)
          .lineWidth(0.7)
          .strokeColor(BRAND.line)
          .stroke();
        doc.rect(x, y0, 2.5, cardH).fill(BRAND.accent);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor(BRAND.muted)
          .text(k.label.toUpperCase(), x + 8, y0 + 6, {
            lineBreak: false,
            width: cardW - 12,
          });
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(BRAND.ink)
          .text(k.value, x + 8, y0 + 17, {
            lineBreak: false,
            width: cardW - 12,
          });
      });
      doc.y = y0 + cardH;
    });
    doc.moveDown(0.9);
  }

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
      doc.rect(MARGIN, y, width, ROW_H).fill(BRAND.accentTint);
    }
    doc.fillColor(BRAND.text);
    row.forEach((v, i) => {
      cell(
        v === null || v === undefined ? "" : String(v),
        i,
        y + 3.5,
        typeof v === "number",
      );
    });
    doc.y = y + ROW_H;
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .strokeColor(BRAND.line)
      .lineWidth(0.5)
      .stroke();
  });

  const pages = doc.bufferedPageRange();
  doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.muted);
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
