# @omnidance/web

PWA Next.js 14 (App Router) + React 18 + TypeScript. Una sola app para
todas las superficies: bailarín, staff y consolas B2B. La navegación y los
módulos cambian según el rol/lente activo — el usuario multi-rol elige su
lente desde `/perfil`.

## Correr

```bash
# desde la raíz del repo
pnpm dev:web          # http://localhost:3000
```

El browser llama `/api/*` same-origin — `next.config.mjs` proxea al API
(`API_PROXY_TARGET`, default `localhost:4000`). Solo setear
`NEXT_PUBLIC_API_URL` si el API vive en otro host sin proxy.

| Var | Uso |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (notificaciones) |
| `API_PROXY_TARGET` | Destino del proxy `/api/*` (dev tunnels, LAN) |

## Diseño

- **Dark-first, mobile-first** (la app se usa de noche en locales oscuros).
  Inspiración Apple/iOS: materiales translúcidos, tipografía SF-like,
  targets táctiles, reduced-motion respetado.
- **Acentos por modo** (`globals.css` → `--accent`):
  marketing/landing `lime` · social `violeta` · academia `verde`.
  El chrome escribe `data-mode` y todos los tokens (`text-neon`,
  `bg-neon`, focus rings) resuelven solo.
- **Design system atómico** en `src/components/ui` — reutilizar, no
  duplicar primitivas.
- **Bottom nav ≤ 5 ítems** por rol; QR siempre centrado donde existe;
  notificaciones viven en la campana del appbar con badge `99+`; el drawer
  (hamburguesa) lleva las funciones de menor frecuencia.

## i18n

Solo `es-CL` habilitado. Los namespaces viven en `src/i18n/parts/*.json`
(no en `messages/es-CL.json`); `src/i18n/messages.ts` los deep-mergea —
registrar ahí cada part nuevo. Auditoría: `node scripts/i18n-audit.cjs`
→ `ALL_KEYS_OK`.

## Mapa de rutas

### Públicas / marketing

| Ruta | Contenido |
|---|---|
| `/` | Landing de conversión |
| `/login` | Magic link + password |
| `/estilos`, `/estilos/[style]` | Landings SEO por estilo (SSR, JSON-LD) |

### Consumidor (DANCER)

| Ruta | Contenido |
|---|---|
| `/inicio` | Feed por rol |
| `/eventos`, `/eventos/[id]` | Catálogo, ficha, checkout |
| `/qr` | QR personal rotativo (check-in/invitación) |
| `/entradas` | Billetera de tickets |
| `/amigos`, `/amigos/[id]` | Buscador, solicitudes, perfil público |
| `/academias` | Directorio de academias |
| `/clases` | Mis reservas + explorar con filtros (día/estilo/nivel) |
| `/practicas` | Partners de práctica |
| `/bailes`, `/viajes` | Sesiones y viajes a congresos |
| `/escanear` | Scanner QR |
| `/perfil`, `/notificaciones` | Cuenta (selector de lente) y bandeja |

### Consolas por rol

| Rol | Rutas |
|---|---|
| `ACADEMY_OWNER` / `INSTRUCTOR` | `/academia` (hub + dashboard + settings quórum owner-only), `/academia/clases` (mis clases del instructor), `/academia/clases/[id]` (roster + quórum), `/academia/series`, `/academia/horarios`, `/academia/planes`, `/academia/alumnos` + `/alumnos/[personId]` (historial + próximas), `/academia/asistencia`, `/academia/particulares`, `/academia/videos` |
| `PRODUCER` | `/productor` + `/eventos`, `/eventos/[id]` (fees admin-only), `/codigos`, `/listas`, `/pagos` (liquidaciones), `/parametros` (read-only) |
| `STAFF` | `/staff`, `/staff/[eventId]` — check-in de puerta |
| `DJ` | `/dj` — gigs próximos + ranking de sugerencias |
| `VENUE_MANAGER` | `/venue` — KPIs + arriendos del local |
| `SUPPORT` | `/soporte` — buscador de usuarios + ficha read-only |
| `ADMIN` | `/admin` — usuarios, roles/RBAC, solicitudes, params, catálogos, auditoría |
| Varios | `/analitica` — KPIs por lente (admin/productor/academia/venue) · `/crm` + campañas/triggers |

## Testing y calidad

`pnpm --filter @omnidance/web test` (vitest) · `npx tsc --noEmit` ·
`node scripts/i18n-audit.cjs` · `node scripts/contrast-check.cjs`
(tokens neón vs fondos).

## PWA

Instalable (manifest + service worker en `public/`). Íconos generados por
`scripts/generate-icons.mjs`. Push vía Web Push — suscripción en `/perfil`.
