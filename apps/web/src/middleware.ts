import { NextRequest, NextResponse } from "next/server";

// Frontera anónima: sin cookie de sesión solo se ven las landings
// (/, /pro) y el login. TODO lo demás de la app redirige a
// /login?next=<ruta original> - la cartelera y los perfiles de local
// también requieren sesión.
const PUBLIC_PATHS = new Set([
  "/",
  "/pro",
  "/para-academias",
  "/para-productores",
  "/login",
  // Páginas legales (spec legal-consent) - deben leerse sin sesión,
  // incluidas desde el checkbox de consentimiento del login.
  "/terminos",
  "/privacidad",
  "/opengraph-image",
  "/twitter-image",
]);

// Prefijos públicos: /reclamar/<token> es la landing de invitación -
// el destinatario la abre desde WhatsApp sin sesión; el reclamo en sí
// (POST) exige sesión vía SessionGuard del API.
const PUBLIC_PREFIXES = ["/reclamar"];

// CSP (headers del documento). Decisión documentada: script-src usa
// 'unsafe-inline' y NO nonce - verificado con next start: las páginas
// estáticas (la mayoría del árbol) sirven los scripts inline del
// framework SIN nonce (Next no los re-escribe en HTML prerenderizado),
// y forzar todo a render dinámico por CSP estricta costaría TTFB real.
// La policy aún bloquea scripts externos no-self, eval en prod,
// framing, objects, exfil por connect-src y sube http→https.
const isDev = process.env.NODE_ENV !== "production";

function cspHeader(): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const csp = cspHeader();

  const next = () => {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (PUBLIC_PATHS.has(pathname)) return next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return next();
  }
  if (req.cookies.has("omnidance_session")) return next();

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  const res = NextResponse.redirect(login);
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Excluye /api, internals de Next y todo archivo con extensión
// (manifest.json, íconos, robots.txt, sitemap.xml, sw.js).
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
