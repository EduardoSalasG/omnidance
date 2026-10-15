import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Middleware de next-intl: resuelve el locale por prefijo / cookie /
// Accept-Language y rewritea el árbol [locale]. El gate de sesión se
// compone ANTES, sobre el path sin prefijo de locale.
const intlMiddleware = createMiddleware(routing);

// Prefijo de locale no-default en el path externo (/en/…, /fr/…).
// es-CL no lleva prefijo (localePrefix "as-needed").
const NON_DEFAULT_LOCALES = routing.locales.filter(
  (l) => l !== routing.defaultLocale,
);
const LOCALE_RE = new RegExp(`^\\/(${NON_DEFAULT_LOCALES.join("|")})(?=\\/|$)`);

// Frontera anónima: sin cookie de sesión solo se ven las landings
// (/, /pro) y el login. TODO lo demás de la app redirige a
// /login?next=<ruta original> - la cartelera y los perfiles de local
// también requieren sesión. Los paths se comparan SIN prefijo de
// locale: /en/login es tan público como /login.
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

  // Path sin prefijo de locale para el gate de sesión y el next=.
  const prefix = pathname.match(LOCALE_RE)?.[0] ?? "";
  const bare = pathname.slice(prefix.length) || "/";

  const isPublic =
    PUBLIC_PATHS.has(bare) ||
    PUBLIC_PREFIXES.some((p) => bare.startsWith(p));

  if (!isPublic && !req.cookies.has("omnidance_session")) {
    const login = req.nextUrl.clone();
    login.pathname = `${prefix}/login`;
    // next= guarda el path SIN prefijo: la navegación post-login pasa
    // por el adapter de i18n que re-agrega el locale activo.
    login.search = `?next=${encodeURIComponent(bare + req.nextUrl.search)}`;
    const res = NextResponse.redirect(login);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  const res = intlMiddleware(req);
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Excluye /api, internals de Next y todo archivo con extensión
// (manifest.json, íconos, robots.txt, sitemap.xml, sw.js).
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
