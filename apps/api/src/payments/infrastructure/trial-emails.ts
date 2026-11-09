import {
  ctaButton,
  emailShell,
  escapeHtml,
} from "../../auth/infrastructure/emails";

// Correos del ciclo de vida del trial (spec platform-trials): bienvenida
// con todos los tiers del dominio y el plan en prueba marcado, último
// día con oferta de conversión, y ficha interna a CX por cada registro.

export interface CxContact {
  name: string;
  email: string;
  phone: string;
}

const cxBlock = (cx: CxContact) => `
    <p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:13px;line-height:1.7;text-align:center;">
      Tu contacto en Omnidance es <strong style="color:#ffffff;">${escapeHtml(cx.name)}</strong><br>
      <a href="mailto:${escapeHtml(cx.email)}" style="color:#c4b5fd;">${escapeHtml(cx.email)}</a>
      &nbsp;·&nbsp; ${escapeHtml(cx.phone)}
    </p>`;

const tierRow = (name: string, desc: string, inTrial: boolean) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="color:#ffffff;font-size:14px;font-weight:700;">${escapeHtml(name)}</span>
        ${inTrial ? `<span style="margin-left:8px;color:#a78bfa;font-size:11px;font-weight:800;letter-spacing:0.05em;">EN PRUEBA</span>` : ""}
        <br><span style="color:rgba(255,255,255,0.55);font-size:12px;">${desc}</span>
      </td>
    </tr>`;

const tierTable = (rows: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 4px 0;background-color:rgba(255,255,255,0.03);border-radius:10px;">
    ${rows}
  </table>`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const firstName = (name: string | null) =>
  name ? `, ${escapeHtml(name.split(" ")[0] || name)}` : "";

const ACADEMY_TIERS: [string, string][] = [
  ["COBROS", "Cobranza de membresías por la pasarela y lista de alumnos al día"],
  ["STUDIO", "Todo COBROS + clases, reservas, asistencia, equipo y preventas"],
  ["PRO", "Todo STUDIO + analítica, CRM, videos y multi-academia"],
];

const PRODUCER_TIERS: [string, string][] = [
  ["PRO_STARTER", "Panel de productor, venta de tickets y reportes base"],
  ["PRO_GROWTH", "Todo STARTER + promos, listas de invitados y analítica"],
  ["PRO_BIG", "Todo GROWTH + equipo ampliado y herramientas avanzadas"],
];

function welcomeHtml(input: {
  personName: string | null;
  headline: string;
  intro: string;
  tiers: [string, string][];
  trialTier: string;
  trialEndsAt: Date;
  ctaUrl: string;
  cx: CxContact;
}): string {
  return emailShell(
    `${input.headline} - tu prueba corre hasta el ${fmtDate(input.trialEndsAt)}.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      ${input.headline}${firstName(input.personName)}
    </h1>
    <p style="margin:16px 0 20px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      ${input.intro} Tienes <strong style="color:#ffffff;">${input.trialTier}</strong> en
      prueba hasta el <strong style="color:#ffffff;">${fmtDate(input.trialEndsAt)}</strong> - así se comparan los planes:
    </p>
    ${tierTable(
      input.tiers
        .map(([n, d]) => tierRow(n, d, n === input.trialTier))
        .join(""),
    )}
    ${ctaButton(input.ctaUrl, "Explorar mi consola")}
    ${cxBlock(input.cx)}`,
  );
}

export function academyTrialWelcomeEmailHtml(input: {
  personName: string | null;
  academyName: string;
  trialEndsAt: Date;
  ctaUrl: string;
  cx: CxContact;
}): string {
  return welcomeHtml({
    personName: input.personName,
    headline: "Bienvenido a Omnidance",
    intro: `<strong style="color:#ffffff;">${escapeHtml(input.academyName)}</strong> ya tiene su consola lista.`,
    tiers: ACADEMY_TIERS,
    trialTier: "STUDIO",
    trialEndsAt: input.trialEndsAt,
    ctaUrl: input.ctaUrl,
    cx: input.cx,
  });
}

export function producerTrialWelcomeEmailHtml(input: {
  personName: string | null;
  trialEndsAt: Date;
  ctaUrl: string;
  cx: CxContact;
}): string {
  return welcomeHtml({
    personName: input.personName,
    headline: "Tu cuenta de productor está activa",
    intro: `Ya puedes publicar eventos y probar las herramientas Pro.`,
    tiers: PRODUCER_TIERS,
    trialTier: "PRO_STARTER",
    trialEndsAt: input.trialEndsAt,
    ctaUrl: input.ctaUrl,
    cx: input.cx,
  });
}

export function trialLastDayEmailHtml(input: {
  personName: string | null;
  actorLabel: string;
  ctaUrl: string;
  cx: CxContact;
}): string {
  return emailShell(
    `Último día de tu prueba: 50% de descuento solo por hoy.`,
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Hoy termina tu prueba${firstName(input.personName)}
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      ${input.actorLabel} Si te suscribes <strong style="color:#ffffff;">hoy</strong>,
      el primer mes sale con <strong style="color:#a78bfa;">50% de descuento</strong> - la
      oferta vence a medianoche.
    </p>
    ${ctaButton(input.ctaUrl, "Suscribirme con 50% off")}
    ${cxBlock(input.cx)}`,
  );
}

/** Ficha interna a cx.notify_email por cada trial iniciado. */
export function cxFichaEmailHtml(
  title: string,
  rows: [string, string][],
): string {
  return emailShell(
    title,
    `
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;text-align:center;">
      ${escapeHtml(title)}
    </h1>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background-color:rgba(255,255,255,0.03);border-radius:10px;">
      ${rows
        .map(
          ([k, v]) => `
      <tr>
        <td style="padding:8px 12px;color:rgba(255,255,255,0.5);font-size:12px;width:40%;">${escapeHtml(k)}</td>
        <td style="padding:8px 12px;color:#ffffff;font-size:13px;">${escapeHtml(v)}</td>
      </tr>`,
        )
        .join("")}
    </table>`,
  );
}
