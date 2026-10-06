import {
  ctaButton,
  emailShell,
  escapeHtml,
  fallbackLink,
} from "../../auth/infrastructure/emails";

/**
 * Invitación por magic link de larga duración (spec academy-staff-roles /
 * academy-bulk-import): el link ya crea/inicia la cuenta al hacer click.
 */

interface InviteEmailInput {
  personName: string | null;
  academyName: string;
  link: string;
}

export function staffInviteEmailHtml(input: InviteEmailInput): string {
  const first = input.personName
    ? `, ${escapeHtml(input.personName.split(" ")[0] || input.personName)}`
    : "";
  return emailShell(
    `${input.academyName} te agregó a su equipo en Omnidance.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Te sumaron al equipo${first}
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      <strong style="color:#ffffff;">${escapeHtml(input.academyName)}</strong>
      te agregó como colaborador en Omnidance. Con este link entras
      directo a tu cuenta — no necesitas contraseña.
    </p>
    ${ctaButton(input.link, "Entrar a la consola")}
    ${fallbackLink(input.link)}`,
  );
}

export function studentInviteEmailHtml(input: InviteEmailInput): string {
  const first = input.personName
    ? `, ${escapeHtml(input.personName.split(" ")[0] || input.personName)}`
    : "";
  return emailShell(
    `${input.academyName} ya está en Omnidance - entra a reservar tus clases.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Tu academia ya está en Omnidance${first}
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      <strong style="color:#ffffff;">${escapeHtml(input.academyName)}</strong>
      migró a Omnidance y ya tienes tu inscripción cargada. Con este link
      creas tu cuenta al entrar — no necesitas contraseña.
    </p>
    ${ctaButton(input.link, "Activar mi cuenta")}
    ${fallbackLink(input.link)}`,
  );
}
