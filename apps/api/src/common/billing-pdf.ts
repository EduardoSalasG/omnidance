import PDFDocument from "pdfkit";

/**
 * Nota de cobro interna (spec admin-billing-documents): documento A4 con
 * layout de factura - encabezado emisor, datos del receptor, folio,
 * período de liquidación, tabla de líneas y totales neto/IVA/total.
 *
 * NO es un documento tributario (sin CAF/SII): el disclaimer va en el
 * encabezado y el pie, y los documentos VOID se estampan como anulados.
 * No reutiliza buildTablePdf porque el formato es de documento (bloques
 * + tabla corta), no de reporte tabular multi-página.
 */
export interface BillingPdfData {
  folio: number;
  issuedAt: Date;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  receiverName: string;
  receiverRut: string | null;
  actorType: string;
  lines: { label: string; amount: number }[];
  netClp: number;
  vatClp: number;
  totalClp: number;
  currency: string;
}

const MARGIN = 50;

const clp = (n: number, currency = "CLP") =>
  `${currency} ${new Intl.NumberFormat("es-CL").format(n)}`;

const dmy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;

export function buildBillingPdf(data: BillingPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: `Nota de cobro ${data.folio}`,
      Creator: "Omnidance",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - MARGIN * 2;

  // ── Encabezado ──────────────────────────────────────────────
  doc.fontSize(16).font("Helvetica-Bold").text("OMNIDANCE", { width });
  doc.fontSize(11).font("Helvetica-Bold").text(
    "NOTA DE COBRO - COMISION DE PLATAFORMA",
    { width },
  );
  doc.fontSize(8).font("Helvetica").fillColor("#666").text(
    "Documento interno - no valido como documento tributario (sin CAF/SII)",
    { width },
  );
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#000").text(`Folio N° ${data.folio}`, {
    continued: true,
    width: width / 2,
  });
  doc.text(`Emitido: ${dmy(data.issuedAt)}`, {
    width: width / 2,
    align: "right",
  });
  doc.text(
    `Periodo liquidado: ${dmy(data.periodStart)} a ${dmy(data.periodEnd)}`,
  );
  if (data.status === "VOID") {
    doc
      .font("Helvetica-Bold")
      .fillColor("#B00020")
      .fontSize(12)
      .text("ANULADO", { align: "right" });
    doc.fillColor("#000");
  }
  doc.moveDown(0.8);

  // ── Receptor ────────────────────────────────────────────────
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + width, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).text("Cobrado a:", { width });
  doc.font("Helvetica").fontSize(10).text(data.receiverName, { width });
  if (data.receiverRut) doc.text(`RUT: ${data.receiverRut}`);
  doc
    .fontSize(8)
    .fillColor("#666")
    .text(`Tipo de actor: ${data.actorType}`, { width });
  doc.fillColor("#000").moveDown(0.8);

  // ── Tabla de líneas ─────────────────────────────────────────
  const descW = width * 0.72;
  const amtW = width - descW;
  const rowY = () => doc.y;
  const row = (label: string, amount: string, bold = false) => {
    const y = rowY();
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .text(label, MARGIN, y, { width: descW - 8 });
    doc.text(amount, MARGIN + descW, y, { width: amtW, align: "right" });
    doc.y = y + 16;
  };

  doc.font("Helvetica-Bold").fontSize(9).text("Detalle", MARGIN, doc.y);
  doc.y += 4;
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + width, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.y += 6;

  for (const l of data.lines) row(l.label, clp(l.amount, data.currency));

  // ── Totales ─────────────────────────────────────────────────
  doc.moveDown(0.3);
  doc
    .moveTo(MARGIN + descW - 40, doc.y)
    .lineTo(MARGIN + width, doc.y)
    .strokeColor("#999")
    .stroke();
  doc.y += 6;
  row("Neto", clp(data.netClp, data.currency));
  row("IVA", clp(data.vatClp, data.currency));
  row("Total", clp(data.totalClp, data.currency), true);

  // ── Pie ─────────────────────────────────────────────────────
  doc
    .fontSize(7)
    .fillColor("#666")
    .text(
      "Nota de cobro interna emitida por Omnidance al actor sobre las deducciones de su liquidacion. No reemplaza la factura o boleta exenta que el actor deba emitir a la plataforma cuando corresponda.",
      MARGIN,
      doc.page.height - MARGIN - 30,
      { width, align: "left" },
    );

  doc.end();
  return done;
}
