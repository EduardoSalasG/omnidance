// Parse corto de User-Agent (spec auth-sessions): labels legibles para
// "Mis dispositivos" (/me/sessions) y la ficha admin de sesiones, más
// la plataforma OS en el vocabulario de la telemetría app.launch
// (componente app-launch-tracker del web usa el mismo set de valores).
// Heurística sin dependencia: cubre los UAs reales del producto (iOS
// Safari, Android Chrome, desktop) y degrada a "Dispositivo".

/** Plataforma OS en el vocabulario de telemetría (Android/iOS/Windows…). */
export function osLabel(ua?: string | null): string | null {
  if (!ua) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/cros/i.test(ua)) return "Chrome OS";
  if (/macintosh|mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

function deviceName(ua: string): string {
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? "Android" : "Tablet Android";
  if (/windows phone/i.test(ua)) return "Windows Phone";
  if (/windows/i.test(ua)) return "Windows";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/macintosh|mac os x/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Dispositivo";
}

function browserName(ua: string): string | null {
  // Orden importa: los UAs de Chrome/Edge/Firefox iOS contienen
  // "Safari" - los más específicos van primero.
  if (/edg\/|edga\/|edgios\//i.test(ua)) return "Edge";
  if (/opr\/|opera|opt\//i.test(ua)) return "Opera";
  if (/firefox|fxios\//i.test(ua)) return "Firefox";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/chrome|crios\//i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return null;
}

/** Label de "mis dispositivos": "iPhone · Safari", "Windows · Chrome"… */
export function deviceLabel(ua?: string | null): string {
  if (!ua) return "Dispositivo desconocido";
  const device = deviceName(ua);
  const browser = browserName(ua);
  return browser ? `${device} · ${browser}` : device;
}
