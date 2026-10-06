import {
  ctaButton,
  emailShell,
  escapeHtml,
  fallbackLink,
} from "../../auth/infrastructure/emails";

/**
 * Recordatorios de renovación de plan (spec academy-renewal-reminders):
 * aviso "por vencer" y aviso "en gracia". El alumno paga por fuera
 * (medio de la academia) o por checkout - el CTA lleva a la ficha.
 */

interface RenewalEmailInput {
  studentName: string;
  academyName: string;
  planName: string | null;
  /** endsAt del ciclo - se muestra como fecha (día/mes/año es-CL). */
  endsAtLabel: string;
  academyUrl: string;
}

export function renewalExpiringEmailHtml(
  input: RenewalEmailInput,
): string {
  const first = escapeHtml(
    input.studentName.split(" ")[0] || input.studentName,
  );
  const plan = input.planName ? ` (${escapeHtml(input.planName)})` : "";
  return emailShell(
    `Tu plan en ${input.academyName} vence el ${input.endsAtLabel} - renueva para no perder tu cupo.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Tu plan está por vencer, ${first}
    </h1>
    <p style="margin:16px 0 8px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Tu plan en <strong style="color:#ffffff;">${escapeHtml(input.academyName)}</strong>${plan}
      vence el <strong style="color:#ffffff;">${escapeHtml(input.endsAtLabel)}</strong>.
    </p>
    <p style="margin:0 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Paga por el medio que usa tu academia o directo en la app para
      seguir agendando clases sin interrupciones.
    </p>
    ${ctaButton(input.academyUrl, "Renovar mi plan")}
    ${fallbackLink(input.academyUrl)}`,
  );
}

export function renewalGraceEmailHtml(
  input: RenewalEmailInput & { graceUntilLabel: string },
): string {
  const first = escapeHtml(
    input.studentName.split(" ")[0] || input.studentName,
  );
  const plan = input.planName ? ` (${escapeHtml(input.planName)})` : "";
  return emailShell(
    `Tu plan en ${input.academyName} venció - tienes hasta el ${input.graceUntilLabel} para regularizar.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Tu plan venció, ${first}
    </h1>
    <p style="margin:16px 0 8px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Tu plan en <strong style="color:#ffffff;">${escapeHtml(input.academyName)}</strong>${plan}
      venció el ${escapeHtml(input.endsAtLabel)}.
    </p>
    <p style="margin:0 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Tienes hasta el <strong style="color:#ffffff;">${escapeHtml(input.graceUntilLabel)}</strong>
      para realizar tu pago. Después de esa fecha no podrás agendar
      clases del mes.
    </p>
    ${ctaButton(input.academyUrl, "Regularizar mi plan")}
    ${fallbackLink(input.academyUrl)}`,
  );
}
