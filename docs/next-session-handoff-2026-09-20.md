# Handoff — 2026-09-20

## Completado (mergeado a `dev` como `0865dbd`, feature `6fa5b62`)

### Inteligencia de usuarios admin (openspec `admin-user-intel`)

- **API** — `admin.module.ts` registra dos controllers nuevos:
  - `user-intel.controller.ts`: `GET /admin/users/:personId/detail` (datos personales,
    historial de roles con timestamps, data específica por rol activo) y
    `GET /admin/users/:personId/analytics?role=` (analítica filtrada por rol).
    Ambos `SessionGuard + RolesGuard + @RequirePermissions("admin.access")`.
    Sin passwordHash/qrSecret ni ratings individuales/evaluadores.
  - `browse.controller.ts`: `GET /admin/browse/:entity` — 8 entidades con filtros
    (status, `q`, ids, `from`/`to`).
  - `admin.controller.ts`: `GET /admin/users` ahora es **search-only** — `q` < 2 chars → `[]`;
    busca name/email/phone, máx. 100.
  - `test/admin-intel.e2e.spec.ts`: 16 tests nuevos.
- **Web**:
  - `/admin/usuarios` — búsqueda lazy, cards con nombre/email/roles, click → ficha.
  - `/admin/usuarios/[personId]` — ficha 360° + gestión de roles (asignar/revocar,
    auditoría conservada) + CTA "Ver analítica".
  - `/admin/datos` — explorador por categorías con filtros, carga lazy de FKs.
  - `/analitica/usuarios` + `/analitica/usuarios/[personId]` — "Analítica por Usuario":
    buscador igual al mantenedor, `PillTabs` deslizable (ARIA tablist, 44px, primera
    opción activa) filtrando secciones por rol.
  - `/perfil` — oculta racha/insignias con lente ADMIN; fetch lazy de gamificación
    al volver a lente no-admin (`gamifFetched`).
  - Componentes nuevos: `ui/pill-tabs.tsx`, `ui/spinner.tsx` (`Spinner`, `PageLoading`).
- **Analítica por rol**: dancer → secciones `social` (gasto lifetime/mes/promedio, último
  evento, favoritos con recuento, hora media de check-in, bailes, puntaje, ranking,
  badges) + `academy` (academias activas, clases pasadas/futuras, pagos vigentes e
  históricos, recuentos por academia/estilo/género). Producer, staff, instructor,
  academy owner, venue manager y DJ con sus secciones; soporte/admin → metadata de
  cuenta + historial de roles.

### Marca y chrome

- Acento: **morado por defecto** (`:root` morado); verde solo en lentes academy
  (owner/instructor/dancer-academy). `data-mode` lo escribe `BottomNav` (conoce el rol),
  ya no `ChromeShell` — corrige el bug de admin quedando verde tras tocar academy.
- **Anti-flash**: tabs del bottom nav y switch Social/Academia no renderizan hasta que
  `/me` resuelve (`meChecked`) — nada de UI de otro rol ni por milisegundos.
- Landing rediseñada: minimalista morada, SEO (metadata + JsonLd + skip link),
  features + CTA; **eliminados three.js** (`LandingScene`, `SceneCanvas`) y las deps
  `three`/`@types/three`. Assets lime → morado (`icon.svg`, `opengraph-image`,
  `generate-icons.mjs`); literales lime de `/estilos` → tokens.
- `Spinner`/`PageLoading` reemplazan textos "Cargando…" en ~50 vistas.

## Verificación

- `npx vitest run` (API): **38 archivos / 874 tests verde**.
- `tsc --noEmit` limpio en web y API · `node apps/web/scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
- Smoke en vivo (admin): `users?q=` devuelve persona → `detail` → `analytics?role=DANCER`
  (social con montos/favoritos) → `browse/events?status=PUBLISHED` → 13.
- OpenAPI + Postman regenerados: **158 paths**.

## Pendiente / gaps

- `dev` quedó **adelante de `origin`** — falta `git push` (usuario no lo confirmó aún).
- `Role.requestable` sigue en schema como columna inerte (sin migración destructiva);
  candidata a cleanup posterior.
- Analítica por usuario cubre los KPIs pedidos; posibles extensiones futuras:
  cohortes/retención, funnel de conversión, RFM, riesgo de churn, rentabilidad por evento.
- Revisión manual de UI en navegador de las rutas nuevas recomendada
  (`/admin/datos`, `/admin/usuarios/[id]`, `/analitica/usuarios/[id]`) — verificado por
  SSR/API pero no con QA visual exhaustivo.

## Contexto operativo

- Repo público: https://github.com/EduardoSalasG/omnidance (`dev` default, `main` existe).
- Workflow: feature/* → merge `--no-ff` a `dev`; **commits sin firma de agente**.
- Git no está en el PATH de algunos shells: usar `"/c/Program Files/Git/bin/git.exe"`.
- `git`/`node` del sistema pueden dejar procesos `node.exe` zombie ocupando :3000 — si el
  web no responde, revisar `Get-NetTCPConnection -LocalPort 3000` y matar el PID.
