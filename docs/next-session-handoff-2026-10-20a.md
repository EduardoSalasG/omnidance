# Handoff - 2026-10-20a (consola productor v2 + paginación analítica + seed)

## Completado en esta sesión (commits en dev)

| Commit | Slice |
|---|---|
| `8ea42c5` | Consola instructor + ventana asistencia [-30,+30]min + recordatorios 30/10min |
| `918929e` | Seed: log de progreso por sección |
| `2b4f2da` | **Fix prod**: SERVER_API_URL (server fetch caía a localhost en Netlify) + home productor tipo dashboard |
| `125e870` | **Este batch**: consola productor v2 + paginación `/query/run` + seed eventos |
| `07ff990` | release 0.7.0: versiona + changelog |

### Consola productor v2 (este batch)

- **Configuración dividida** en páginas (patrón `/academia/configuracion/*`):
  `/productor/parametros` = Valores por defecto (mesas + aforo sentable +
  corte preventa); `/productor/medios-pago` (pasarela + métodos propios);
  `/productor/suscripcion` (Producer Pro + comisión read-only +
  `ProReturnNotice` - el retorno Flow `?pro=ok` del webhook
  `platform-customer-return` ahora apunta acá); `/productor/apariencia`
  (ThemeToggle). `PRO_SECTION_HREF` → `/productor/suscripcion`.
- **Nav**: Configuración lista Defaults/Medios de pago/Suscripción/Mis
  pagos/Apariencia; sin "Listas de invitados".
- **Listas dentro de la ficha**: `EventListsSection` en
  `/productor/eventos/[id]`; `/productor/listas` → redirect a eventos;
  `nueva?eventId=` preseleccionado + back a la ficha; `listas/[id]` back
  al evento dueño.
- **Reservas de mesa**: REQUESTED→confirmar/cancelar, CONFIRMED→guardar
  cambios (mesa+tamaño)/cancelar.
- **Comprobantes**: cola masiva PENDING primero + historial resuelto +
  FilterBar + Pager + empty state (ya no hay página en blanco).
- **Dashboard**: tops en `lg:grid-cols-2` (facturación izq, asistencia
  der), cobros por revisar como sección propia.
- **Notificación `ticket.sale`** al productor al liquidar orden PAID
  (skip si comprador = productor); spec cubierto.
- Botones "Nuevo evento"/"Nuevo código" = `primary` (acento morado).

### Paginación `/query/run`

- DTO: `page`/`pageSize` (int ≥1, size ≤100). Servicio clampa y pasa
  `skip`/`take` a handlers (`ExecOpts` + `capped(rows, take, skip)`).
- `QueryRunResult` gana `page`/`pageSize`; `/analitica` renderiza `Pager`,
  filtros/entidad resetean a pág 1, retry mantiene página.
- Delta del change `analytics-query-engine` actualizado (sigue abierto -
  falta su task 6.3 QA manual + handoff).

### Seed

- Muvet productor: edición pasada CLOSED (Desafío de Tronos), ventas del
  mes, lista de invitados, 3 claims PENDING (transferencia/MP).
- **Todos** los eventos PUBLISHED/LIVE/CLOSED: 150-350 entradas
  determinísticas por hash del id (vie/sáb 250-350), pagos PAID, ~85%
  check-ins en pasados; mesas reservables en 3 eventos con mezcla
  REQUESTED/CONFIRMED/CANCELLED.
- Corrido en local: seed 39s (idempotente), eventos verificados con
  counts reales (Desafío próximo: 275 tk + 6 mesas; edición anterior:
  272 tk + 230 check-ins).

## Verificación citada

- `tsc --noEmit` web + api: limpio.
- `payment-settlement` 23/23 + `query.service` 13/13.
- `i18n-audit`: `ALL_KEYS_OK`. `impeccable detect`: `[]`.
- `openspec validate --changes`: 2 passed. `producer-console-v2`
  archivado → specs canónicas actualizadas.

## Release v0.7.0 — estado

- Tag `v0.7.0` en `main` (`07ff990`), push main + dev sincronizados.
- Deploy API (GH Actions → VM): **success** en 5m49s —
  `/api/health` 200, `/api/events` 200 con data.
- **Web (Netlify): rebuild disparado por el push pero aún sirve el
  build anterior** (chunks de páginas nuevas 404 en CDN al cierre).
  El fix SSR entra en producción cuando ese build termine - verificar
  `/productor/apariencia` renderiza tras login.

## Release v0.8.0 — onboarding tours (commit `ff49f37`, tag `v0.8.0`)

- **Audit**: dancer (`profile-setup` + `home`/`home-academy` + tours por
  módulo) y owner (`academia-owner` + `academia`) ya estaban completos.
- **Productor**: tour `productor` montado en la rama PRODUCER de HomeHub
  — `producer-kpis` → `producer-claims` → `producer-tops` → `nav-events`
  → menú (`appbar-menu` móvil / `app-sidebar` desktop) → `appbar-bell`.
  Copy `tours.productor` reescrito al vocabulario v2 (el anterior
  mencionaba liquidaciones/listas de puerta, módulos eliminados).
- **Instructor**: tour `instructor` — `home-stats` → `home-classes`
  (anchor nuevo en "Próximas clases") → `nav-classes` → `nav-students`
  → `appbar-bell` → `nav-profile`.
- Anchors nuevos en `ProducerDashboard` (kpis/claims/tops) y
  `SIDEBAR_TOUR["/productor/eventos"]="nav-events"` en BottomNav.
- Persistencia: mismo contrato — `POST /me/onboarding {tour}` mergea en
  `Person.onboarding` JSON; los tours corren una sola vez por usuario.
- OpenSpec `2026-10-10-console-onboarding-tours` archivado → specs
  `events/producer-console` y `academies/staff-roles` actualizadas.
- **Deploy**: API workflow success 5m45s; `/api/health` y `/api/events`
  200 en prod. Web: rebuild de Netlify disparado por el push — verificar
  en Deploys que sirva el build de `ff49f37` (los tours son front-only).

## Release v0.8.1 — hotfix SSR + socket.io (commit `e284554`, tag `v0.8.1`)

- **Causa raíz del "eventos no carga en prod" que persistía tras v0.7.0**:
  `API_PROXY_TARGET` vive en `[build.environment]` de netlify.toml —
  disponible en build pero **no en runtime** del serverless; y
  `NEXT_PUBLIC_WEB_URL` nunca se seteó en el UI de Netlify → el helper
  seguía cayendo a `localhost:4000`. Prueba: `/reclamar/<token-falso>`
  en prod renderizaba `errorTitle` ("No pudimos cargar la invitación")
  cuando el API responde 404 → debió ser `goneTitle`.
- **Fix**: `serverApiUrl()` (función request-scope, reemplaza la const
  `SERVER_API_URL`) agrega fallback al **origin del request** vía
  `headers()` (x-forwarded-host/host + x-forwarded-proto) — la propia
  web sirve `/api/*` por el rewrite de next.config.mjs. 11 call sites
  actualizados (9 pages + public-events/public-academies).
- **socket.io**: Netlify edge normalizaba `/socket.io/` → 308 →
  `/socket.io`; engine.io solo matchea `/socket.io/` → Nest 404 en loop
  de polling. Fix: `[[redirects]]` en netlify.toml proxea `/socket.io/*`
  al API a nivel edge con `force = true` (antes del runtime Next).
- Errores React #418/#423 de la consola del usuario: probable efecto del
  SSR roto o edge cache con builds mixtos — re-evaluar tras el rebuild.
- **Verificado en prod** (buildId `Typw-kN_p8BWocvQAhw1Q`):
  `/socket.io/?EIO=4&transport=polling` → handshake `0{"sid":...}` OK;
  `/reclamar/<fake>` → `goneTitle` ("Este link ya no es válido") → el
  fetch SSR llega al API. Eventos y todos los módulos SSR resueltos.
- **Seed Mambo Madness**: verificado exhaustivamente en local — todos
  los slots/clases de Eduardo y María José ya son PM (lun 19:30/20:30,
  sáb 17:00/18:00). Si en prod se ven AM es data vieja: re-correr
  `SEED_ENV=dev pnpm db:seed` contra Neon (la poda de slots stale en
  `mmClass` los limpia). Requiere la URL directa de Neon (VM `.env` o
  secret `MIGRATION_DATABASE_URL`).

## Pendiente

- QA manual del productor (320/768/1024) + handoff 6.3 de
  analytics-query-engine.
- Seed de prod (`SEED_ENV=dev pnpm db:seed` contra la URL directa) sigue
  pendiente en cancha del usuario.
- Verificar rebuild de Netlify v0.8.0 (los tours `productor`/`instructor`
  corren en la primera visita a `/inicio` de usuarios sin la key en
  `Person.onboarding`).

## Gaps conocidos

- `/productor/parametros` y `/productor/pagos` mantienen gate inline
  (duplican `ProducerGate`) - mismo comportamiento, refactor cosmético
  pendiente.
- `producer.modules.params`/`paramsDesc` quedaron sin referencia en el
  front (el hub murió) - candidatos a limpieza.

---

## v0.8.3 - lente instructor + transferencias (2026-10-10, `859c011` en main)

- **Lente INSTRUCTOR degrada privilegios**: `/academia/alumnos`,
  `/alumnos/[personId]` y `/alumnos/nuevo` ahora respetan la lente
  activa (`useActiveRole`) — bajo INSTRUCTOR no hay KPIs/Insights/
  ImportCard/CTA ni editor de enrollment, aunque la persona tenga
  ADMIN/owner/staff reales (spec academies/staff-roles, ya lo exigía).
- **API**: `GET /academies/:id/students/insights` solo computa
  `topPayersMonth` con cap `payments` (instructor recibe `[]`). Test
  nuevo: `academies-insights.controller.spec.ts` (2 tests).
- **FilterBar**: `min-w-0` en labels/inputs de grid y en el par
  desde/hasta — los `input[type=date]` ya no desbordan la celda ni se
  montan entre sí (fix global: aplica a todas las consolas).
- **Seed**: bloque "transferencias para todos" tras limpieza E2E — toda
  academia sin TRANSFER recibe uno activo con datos generados; todo rol
  PRODUCER aprobado recibe `ProducerPaymentMethod` TRANSFER. Verificado:
  20/20 academias, 16/16 productores. **Prod**: el deploy solo corre
  baseline — hay que lanzar `SEED_ENV=dev pnpm --filter @omnidance/api
  prisma db seed` con la URL directa de Neon para aplicarlo.
- Verificación: tsc web+api, i18n `ALL_KEYS_OK`, impeccable `[]`,
  openspec validate+archive, tests academies 210/210, seed local,
  deploy API success + health/events 200.

---

## v0.8.4 - canonical/og:url ya no localhost (2026-10-11, `a383e7f` en main)

- **Causa**: `NEXT_PUBLIC_WEB_URL` nunca se seteo en el UI de Netlify;
  `metadataBase` caia a `localhost:3000` y WhatsApp/crawlers leian
  `canonical`/`og:url` como localhost al compartir `/para-academias`.
- **Fix**: var pintada en `[build.environment]` de `netlify.toml`
  (NEXT_PUBLIC_* se inlinea en build, a diferencia del runtime);
  `apps/web/src/lib/site-url.ts` resuelve `NEXT_PUBLIC_WEB_URL ->
  `process.env.URL` (la inyecta Netlify en todo build) -> localhost.
  4 consumidores migrados: layout (metadataBase), sitemap, robots,
  JsonLd. Verificado en prod: canonical/og:url emiten
  `https://omnidance.netlify.app/para-academias`, 0 localhost.
- Verificacion: tsc web limpio, build verde, bundle con dominio
  inlineado, sitemap/robots emiten el dominio real.
