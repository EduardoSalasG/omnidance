import { emailShell, escapeHtml } from "../../auth/infrastructure/emails";

/**
 * Resguardo de pago al pagador (spec payment-notifications): la
 * plataforma envía su propio comprobante con los datos del producto -
 * el mail de la pasarela solo informa el cargo genérico. Se dispara una
 * sola vez por Payment: el caller lo invoca tras el claim atómico →PAID.
 */
export interface PaymentReceiptEmailInput {
  payerName: string | null;
  /** Producto comprado con su referencia: "Social SBK",
   *  "Mensual, Academia X", "Suscripción COBROS · factura inv9". */
  product: string;
  /** Monto total formateado es-CL ($10.500). */
  amountLabel: string;
  /** Medio reportado por la pasarela (Webpay Plus) o método declarado. */
  mediaLabel: string | null;
  /** Fecha/hora del PAID formateada es-CL. */
  paidAtLabel: string;
  /** Nº de transacción interno (Payment.id). */
  paymentId: string;
  /** Referencia de la pasarela (flowOrder / token), si existe. */
  gatewayRef: string | null;
}

const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;color:rgba(255,255,255,0.45);font-size:13px;line-height:1.4;border-bottom:1px solid #1e1e2a;">${label}</td>
      <td align="right" style="padding:10px 0;color:#ffffff;font-size:14px;font-weight:600;line-height:1.4;border-bottom:1px solid #1e1e2a;">${value}</td>
    </tr>`;

export function paymentReceiptEmailHtml(
  input: PaymentReceiptEmailInput,
): string {
  const first = input.payerName
    ? `, ${escapeHtml(input.payerName.split(" ")[0] || input.payerName)}`
    : "";
  const media = input.mediaLabel ? row("Medio", escapeHtml(input.mediaLabel)) : "";
  const gatewayRef = input.gatewayRef
    ? row("Ref. pasarela", escapeHtml(input.gatewayRef))
    : "";
  return emailShell(
    `Pagaste: ${input.product} · ${input.amountLabel}`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Pago confirmado${first}
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Tu pago quedó registrado. Este es tu respaldo con los datos de la compra.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Producto", escapeHtml(input.product))}
      ${row("Monto", escapeHtml(input.amountLabel))}
      ${media}
      ${row("Fecha", escapeHtml(input.paidAtLabel))}
      ${row("Nº transacción", escapeHtml(input.paymentId))}
      ${gatewayRef}
    </table>
    <p style="margin:24px 0 0 0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;text-align:center;">
      Estado: confirmado. Si no reconoces este cargo, responde a este correo.
    </p>`,
  );
}
