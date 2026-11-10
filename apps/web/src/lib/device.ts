// Plataforma OS del cliente en el vocabulario de telemetría (spec
// auth-sessions): navigator.userAgentData?.platform cuando existe
// (Chromium), derivado del UA cuando no (iOS Safari, browsers sin
// Client Hints). Mismo set de valores que consume el backend para
// agregar sin distinguir la fuente.

function uaPlatform(ua: string): string {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/cros/i.test(ua)) return "Chrome OS";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "unknown";
}

export function clientPlatform(): string {
  return (
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? uaPlatform(navigator.userAgent)
  );
}
