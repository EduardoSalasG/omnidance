import { NextRequest, NextResponse } from "next/server";

// Frontera anónima: sin cookie de sesión solo se ven las landings, el
// login y la cartelera pública de /eventos (lista de la semana). El resto
// de los módulos de la app redirige a /login?next=<ruta original>.
const PUBLIC_PATHS = new Set([
  "/",
  "/pro",
  "/login",
  "/eventos",
  "/opengraph-image",
  "/twitter-image",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /locales/:id es prefijo (ruta dinámica): el perfil del local solo
  // expone datos ya públicos (nombre, dirección, horarios, cartelera).
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/locales/")
  )
    return NextResponse.next();
  if (req.cookies.has("omnidance_session")) return NextResponse.next();

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

// Excluye /api, internals de Next y todo archivo con extensión
// (manifest.json, íconos, robots.txt, sitemap.xml, sw.js).
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
