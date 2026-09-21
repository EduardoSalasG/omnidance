/**
 * Email de bienvenida — dark-first, misma paleta que la app
 * (night-950/900/700 + neon lime #34d399). HTML email-safe: layout con
 * tablas y estilos inline (los clientes de correo ignoran <style> y
 * flex/grid modernos).
 */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
                <div style="width:28px;height:28px;border-radius:9999px;background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.4);text-align:center;line-height:28px;color:#34d399;font-size:13px;font-weight:700;">✓</div>
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

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenido a Omnidance</title></head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">Tu comunidad de salsa, bachata y timba ya te espera en la pista.&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <!-- Wordmark -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.12em;">OMNI</span><span style="color:#34d399;font-size:22px;font-weight:800;letter-spacing:0.12em;">DANCE</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#12121a;border:1px solid #2a2a3a;border-radius:20px;padding:40px 32px;">
              <!-- Acento superior -->
              <div style="height:3px;width:48px;background-color:#34d399;border-radius:9999px;margin:0 auto 28px auto;"></div>
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.2;text-align:center;">
                Bienvenido a la pista,<br>${first}
              </h1>
              <p style="margin:16px 0 0 0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;text-align:center;">
                Ya eres parte de Omnidance — la plataforma que une a la comunidad
                de salsa, bachata y timba de Santiago.
              </p>

              <div style="height:32px;line-height:32px;">&nbsp;</div>

              <!-- Features -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${rows}
              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 0 0;">
                    <a href="${webUrl}/inicio" style="display:inline-block;background-color:#34d399;color:#0a0a0f;font-size:15px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:9999px;">
                      Entrar a Omnidance
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 16px 0 16px;">
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:12px;line-height:1.6;">
                Omnidance · Santiago de Chile<br>
                Recibiste este correo porque creaste tu cuenta en Omnidance.
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
