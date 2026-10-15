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

// Solo-anónimas: con sesión van directo a /inicio. Antes lo hacía cada
// page con cookies() -> las volvía dinámicas + no-store (y mataba el
// bfcache). En middleware las landings quedan estáticas y cacheables.
const ANON_ONLY = new Set(["/", "/pro", "/para-academias", "/para-productores"]);

// Primer segmento con FORMA de locale que no es un locale soportado
// (/de/eventos, /en-US/x): se salta el gate y cae al notFound() del
// layout [locale] - 404 limpio en vez del rebote a login que igual
// terminaba en 404 post-login.
const LOCALE_SHAPED = /^\/([a-z]{2}(?:-[a-zA-Z]{2,4})?)(?=\/|$)/;

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

  // /es-CL/x → /x (308): el default nunca lleva prefijo; normalizar
  // ANTES del gate evita que next= capture el path ya prefijado.
  if (pathname.startsWith(`/${routing.defaultLocale}`)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(routing.defaultLocale.length + 1) || "/";
    const res = NextResponse.redirect(url, 308);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // Path sin prefijo de locale para el gate de sesión y el next=.
  const prefix = pathname.match(LOCALE_RE)?.[0] ?? "";
  const bare = pathname.slice(prefix.length) || "/";

  const isPublic =
    PUBLIC_PATHS.has(bare) ||
    PUBLIC_PREFIXES.some((p) => bare.startsWith(p));

  // Locale-shaped desconocido: no gatear - 404 vía notFound del layout.
  const maybeLocale = pathname.match(LOCALE_SHAPED)?.[1];
  const badLocalePrefix =
    maybeLocale !== undefined &&
    !routing.locales.includes(
      maybeLocale as (typeof routing.locales)[number],
    ) &&
    pathname.split("/").filter(Boolean).length >= 2;

  // Con sesión, las landings anónimas van a /inicio (antes en cada page
  // con cookies() - en middleware las páginas quedan estáticas).
  if (
    !badLocalePrefix &&
    isPublic &&
    ANON_ONLY.has(bare) &&
    req.cookies.has("omnidance_session")
  ) {
    const home = req.nextUrl.clone();
    home.pathname = `${prefix}/inicio`;
    home.search = "";
    const res = NextResponse.redirect(home);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  if (!badLocalePrefix && !isPublic && !req.cookies.has("omnidance_session")) {
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
  // NEXT_LOCALE redundante cuando se sirvió el default sin prefijo y sin
  // cookie previa: quien llegó a "/" por Accept-Language=es ya resolvió
  // es-CL - el Set-Cookie no aporta y marca la respuesta no-store, lo que
  // mata el bfcache y la caché compartida para toda la audiencia es-CL.
  // La cookie sí se conserva cuando aporta: locales con prefijo (/en…),
  // preferencia explícita existente, o redirects de detección.
  if (!prefix && !req.cookies.has("NEXT_LOCALE") && res.status < 300) {
    res.headers.delete("set-cookie");
  }
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Excluye /api, internals de Next y todo archivo con extensión
// (manifest.json, íconos, robots.txt, sitemap.xml, sw.js).
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
