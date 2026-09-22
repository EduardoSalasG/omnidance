/**
 * Plantillas de email transaccional — dark-first, identidad de marca:
 * night-950/900/700 + acento morado #a78bfa (el violeta es la marca fuera
 * de la app — landing, marketing, correos —; el lime solo existe dentro
 * de la app como acento del modo Academia).
 * HTML email-safe: layout con tablas y estilos inline (los clientes de
 * correo ignoran <style> y flex/grid modernos). Nada de imágenes: el
 * wordmark es texto, la "O" un tile de tabla — cero assets bloqueados.
 */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Botón pill morado — mismo lenguaje que los CTAs de la app. */
const ctaButton = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding:8px 0 0 0;">
        <a href="${href}" style="display:inline-block;background-color:#a78bfa;color:#0a0a0f;font-size:15px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:9999px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;

/** Link de respaldo bajo el botón — para clientes que no renderizan <a> styled. */
const fallbackLink = (href: string) => `
  <p style="margin:20px 0 0 0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;text-align:center;word-break:break-all;">
    Si el botón no funciona, copia este link:<br>
    <a href="${href}" style="color:#c4b5fd;">${href}</a>
  </p>`;

/**
 * Shell de marca: wordmark + card night-900 sobre night-950 + footer.
 * `content` es el interior de la card (tablas/p inline ya estilizados).
 */
function emailShell(preheader: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Omnidance</title></head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <!-- Marca: la "O" del ícono (tile night-900, O morada) + wordmark -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" valign="middle" width="44" height="44" style="width:44px;height:44px;background-color:#12121a;border:1px solid #2a2a3a;border-radius:12px;color:#a78bfa;font-size:26px;font-weight:800;line-height:44px;">O</td>
                  <td style="padding-left:12px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.12em;">OMNI</span><span style="color:#a78bfa;font-size:20px;font-weight:800;letter-spacing:0.12em;">DANCE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#12121a;border:1px solid #2a2a3a;border-radius:20px;padding:40px 32px;">
              <!-- Acento superior -->
              <div style="height:3px;width:48px;background-color:#a78bfa;border-radius:9999px;margin:0 auto 28px auto;"></div>
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 16px 0 16px;">
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:12px;line-height:1.6;">
                Omnidance · Santiago de Chile
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Bienvenida (register + primer magic link) ───

const FEATURES: { title: string; desc: string }[] = [
  {
    title: "La cartelera completa",
    desc: "Todos los sociales de la semana: salsa, bachata y timba en un solo lugar — con la mezcla real de cada noche.",
  },
  {
    title: "Tu entrada es tu QR",
    desc: "Compra desde la app y muéstralo en la puerta. El mismo QR te conecta con quien bailes en la pista.",
  },
  {
    title: "Planifica tu noche",
    desc: "Clases antes del social, shows y cierre — sabes exactamente qué pasa y a qué hora.",
  },
];

export function welcomeEmailHtml(name: string, webUrl: string): string {
  const first = escapeHtml(name.split(" ")[0] || name);
  const rows = FEATURES.map(
    (f) => `
      <tr>
        <td style="padding:0 0 20px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" valign="top">
                <div style="width:28px;height:28px;border-radius:9999px;background:rgba(167,139,250,0.14);border:1px solid rgba(167,139,250,0.4);text-align:center;line-height:28px;color:#a78bfa;font-size:13px;font-weight:700;">✓</div>
              </td>
              <td style="padding-left:12px;">
                <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;line-height:1.4;">${f.title}</p>
                <p style="margin:4px 0 0 0;color:rgba(255,255,255,0.55);font-size:13px;line-height:1.5;">${f.desc}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
  ).join("");

  return emailShell(
    "Tu comunidad de salsa, bachata y timba ya te espera en la pista.",
    `
    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-0.02em;text-align:center;">
      Bienvenido a la pista,<br>${first}
    </h1>
    <p style="margin:16px 0 0 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Ya eres parte de Omnidance — la plataforma que une a la comunidad
      de salsa, bachata y timba de Santiago.
    </p>
    <div style="height:32px;line-height:32px;">&nbsp;</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${rows}
    </table>
    ${ctaButton(`${webUrl}/inicio`, "Entrar a Omnidance")}
    <p style="margin:24px 0 0 0;color:rgba(255,255,255,0.35);font-size:12px;line-height:1.6;text-align:center;">
      Recibiste este correo porque creaste tu cuenta en Omnidance.
    </p>`,
  );
}

// ─── Magic link (login sin contraseña) ───

export function magicLinkEmailHtml(link: string): string {
  return emailShell(
    "Tu link de acceso a Omnidance (válido 15 minutos).",
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Tu acceso a Omnidance
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Entra con este link — es válido por <strong style="color:#ffffff;">15 minutos</strong>.
      Si no lo pediste tú, ignora este correo.
    </p>
    ${ctaButton(link, "Entrar a Omnidance")}
    ${fallbackLink(link)}`,
  );
}

// ─── Invitación de lead (cuenta creada por admin) ───

export function inviteEmailHtml(
  name: string,
  link: string,
): string {
  const first = escapeHtml(name.split(" ")[0] || name);
  return emailShell(
    "Tu cuenta Omnidance está lista — entra y completa tus datos.",
    `
    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.02em;text-align:center;">
      Tu cuenta está lista, ${first}
    </h1>
    <p style="margin:16px 0 24px 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
      Entra con este link y completa tus datos para empezar a usar la app.
    </p>
    ${ctaButton(link, "Activar mi cuenta")}
    ${fallbackLink(link)}`,
  );
}
