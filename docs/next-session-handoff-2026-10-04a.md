# Handoff — 2026-10-04a: remove-social-blocks-invites

Sesión sobre `dev` implementando el change OpenSpec
`remove-social-blocks-invites`: bloqueo de personas, invitaciones a
bailar (invite/confirm/decline), solicitudes de pareja y toggle de
disponibilidad **eliminados** — los bailes solo se registran por escaneo
QR en pista.

## Decisión de diseño clave (no estaba en los deltas originales)

El delta eliminaba `POST /sessions/invite` — que era el **único** alta de
`DanceSession` por QR — sin reemplazo, mientras el proposal dice "los
bailes solo se registran vía escaneo QR". Se resolvió así:

- **Nuevo `POST /sessions/scan` `{qrToken, eventId}`** → crea la sesión
  directamente `CONFIRMED` (`confirmedAt` = escaneo). El QR rotativo
  TOTP acredita presencia mutua: el escaneo ES la confirmación, no hace
  falta handshake. Notifica `session.confirmed` a la persona escaneada y
  acredita `session_confirmed` + evalúa badges de ambos (mismo hook que
  tenía el confirm eliminado).
- Se añadió el requirement `ADDED` correspondiente al delta
  `specs/partner-requests/spec.md` y la línea al proposal — el change
  queda autoconsistente.
- `declare` queda creando `INVITED` **sin resolución posible** (confirm
  eliminado) — el proposal lo declara "backlog separado, sigue vivo".
  En la web las cards INVITED entrantes ya no muestran botones muertos;
  expiran solas a las 24h (effectiveStatus). ⚠️ Si el producto quiere
  que declare cuente, hace falta un follow-up (p.ej. auto-confirm o un
  mecanismo de validación distinto).

## Completado

- **Migración** `20261008000000_drop_social_blocks_invites`: DROP TABLE
  `AvailabilityToggle`, `PracticePartnerRequest`, `UserBlock`
  (**no aplicada** — la corre `migrate deploy`). Las `DanceSession`
  históricas (incl. INVITED/DECLINED) quedan intactas.
  `prisma migrate diff --from-migrations --to-schema-datamodel --script`
  → vacío.
- **Schema**: 3 modelos eliminados; `seed-dev.ts` sin el seed de
  partner-request. `prisma generate` re-corrido (cliente sin los modelos).
- **API**: borrados `blocks.controller`, `partner-requests.controller`,
  `availability.controller` + desregistro en `social.module`;
  `sessions.controller` sin invite/confirm/decline/`assertNotBlocked`
  (`declare`, `mine`, `rate`, `discard` intactos + nuevo `scan`);
  `people.controller` sin filtrado de bloqueados. 0 referencias
  residuales a userBlock/partnerRequest/availability en `src` y `test`.
- **e2e**: `gap-social` (25✓), `sessions` (22✓ — nuevo bloque scan +
  aserto 404 del ciclo eliminado), `social-endpoints` (9✓), `wiring`
  (7✓ — scan → notif session.confirmed); domain spec 39✓.
- **Web**: `DanceScanner` → `/sessions/scan` (copy "Baile registrado" /
  "Escanea el QR… para registrar el baile"); `SessionCard`/`types.ts`
  sin acciones confirm/decline; `amigos/[id]` usa `profile.datos.danceRole`;
  namespaces `partnerRequests`/`availability` fuera de `es-CL.json`;
  i18n-audit `ALL_KEYS_OK`.
- **Docs**: `openapi.json` + postman regenerados contra API nueva
  (198 paths; diff quirúrgico). `architecture.md`, `flows.md` y
  `omni-dance.md` actualizados (scan→CONFIRMED, features retiradas
  marcadas).

## Verificación (evidencia)

- `pnpm --filter @omnidance/api exec tsc --noEmit` → limpio
- `pnpm --filter @omnidance/web exec tsc --noEmit` → limpio
- `vitest run` 4 specs tocados → **63 passed**; `sessions.service.spec` → 39 passed
- `node apps/web/scripts/i18n-audit.cjs` → `ALL_KEYS_OK`
- `npx openspec validate remove-social-blocks-invites --strict` → valid
- Smoke en API viva (PORT=4100): invite/confirm/decline/blocks/
  partner-requests/availability → **404**; scan/mine/declare → 401 por
  SessionGuard (existen).
- Diff prisma vacío (shadow DB `omnidance_shadow` recreada en docker).

## Pendiente / gaps conocidos

1. **`declare` sin resolución**: crea INVITED que nadie puede confirmar.
   Backlog declarado en el proposal; el invitee ve una card pendiente sin
   acciones hasta que expira.
2. **`SessionsService.transition` aún soporta confirm/decline** en
   dominio (unit spec lo cubre) — inalcanzable vía API; se dejó para el
   follow-up de resolución de declares.
3. **Specs canónicas**: `safety/user-blocks` se remueve al **archivar**
   el change (orquestador: `openspec archive` sin `--skip-specs`).
4. Migración **sin aplicar** por diseño — verificar `migrate deploy` en
   el pipeline.
5. El seed demo siembra `DanceSession` INVITED históricas — quedan
   como pendientes eternas en `/bailes` (correcto como dato histórico).

---

## Cierre (integración final — mismo día, post-handoff)

Los 4 changes del pedido quedaron integrados, archivados y canonizados:

| Change | Commits | Resultado |
|---|---|---|
| `api-hardening` | `71593dd` | helmet (CSP off por Swagger) + `@nestjs/throttler` global 300/min y 8/min en `/auth/{magic-link,login,register}`; skip en `NODE_ENV=test` y WS; `Retry-After` verificado en vivo |
| `remove-social-blocks-invites` | `81ba54d` + `…declare` | `UserBlock`/`PracticePartnerRequest`/`AvailabilityToggle` eliminados (migración `20261008000000_drop_social_blocks_invites` **aplicada**); `invite`/`confirm`/`decline`/`declare`/`blocks`/`partner-requests`/`availability` → 404; nuevo `POST /sessions/scan` crea CONFIRMED directo |
| `legal-consent` | `bb935d2` | `/terminos` + `/privacidad` (Ley 21.719), checkbox requerido en alta, `Person.consentVersion`/`consentAcceptedAt` (migración `20261009000000_person_consent` **aplicada**), `POST /me/consent` + `ConsentBanner` para usuarios existentes |
| `minor-polish-fixes` | `67e2962` | HomeHub: 5xx → error de servidor honesto + retry; glyphs→`ui/icons` en consolas producer/CRM/admin/landing; género editable en lente academia |

**Además**: `POST /sessions/declare` eliminado en el mismo commit de
cierre (aún creaba INVITED sin resolución — contradice "solo QR").
Canonical `safety/user-blocks` retirada (`retire_capabilities: true`);
`sessions/qr-scan` creada; `social-modules-scope` modificada;
`sessions/retro-declared` se conserva renombrando su Purpose — las
sesiones `retroDeclared` históricas siguen excluidas de Prime Time.

**Pendiente que sigue vivo**:
- `SessionsService.transition` soporta confirm/decline en dominio
  (inalcanzable vía API — solo `discard` sigue ruteado, para limpiar
  INVITED históricas).
- Placeholders `[PENDIENTE]` en `legal.json`: RUT, domicilio legal y
  confirmar `privacidad@omnidance.cl` antes de producción.
- Revisión legal profesional del copy — la implementación no sustituye
  asesoría jurídica.
- 12 specs canónicas antiguas aún tienen `## Purpose` placeholder
  (warning pre-existente bajo `--strict`).

## loading-states (`7c6c932` + archivado)

Audit de las 65 páginas + componentes fetchers → fix transversal:

- **FLASH**: `perfil` (insignias/racha/KPIs → skeleton, nunca "0" ni
  empty-state en vuelo), `admin/auditoria`, `admin/roles`,
  `admin/parametros` (colecciones `[]`→`null` + SkeletonList).
- **POP-IN**: 14 spots con slot skeleton reservado o select disabled
  (notificaciones ya no dispara fetch con lente default, friendEvents,
  academy-dashboard KPIs, private-lessons, PrimeTimeWidget, dj GigRating,
  billing-banner CTA, academias videos, bailes chip+racha, staff title +
  lista skeleton en vez de Spinner, selects de catálogos).
- **`useMe()` compartido** (`src/lib/me-context.tsx`): `MeProvider` en el
  layout de `(app)` — un solo `/me` deduplicado; consumen ConsentBanner,
  perfil, notificaciones, amigos, academia/page, academy-settings,
  academy-profile, academy-billing-banner. Expone `refresh()` para
  post-mutación. No reemplaza guards ni el /me de HomeHub (granularidad
  error session-vs-server).
- **Regla canónica nueva**: estado `T[] | null` — `null`=cargando→skeleton;
  `[]` post-fetch=empty-state. Prohibido `?? 0`/`"—"` como placeholder.
- Verificación: tsc web limpio, i18n ALL_KEYS_OK, impeccable `[]`,
  spec `loading-states` canonizada (3 requirements). **Smoke manual de
  rutas pendiente** — probar /perfil, /notificaciones, /amigos,
  /staff/:id en la sesión dev.

## loading-states ronda 2 (`06ea0a7` + `1494e9a`)

El usuario reportó flashes residuales tras la ronda 1 → se refinaron dos
patrones:

- **Skeleton que colapsa a nada** (`06ea0a7`): el skeleton de una
  sección opcional que resuelve vacía es el mismo flash que se buscaba
  eliminar. Regla: contenido opcional = nada hasta resolver, aparece una
  sola vez si hay data; contenido garantizado = skeleton dentro de slot
  persistente. Fix en amigos (fetch de upcoming-events en paralelo con
  /friends), academias videos, dj rating, billing CTA, PrimeTimeWidget,
  módulos owner de /academia. BottomNav migrado a useMe() (sin /me
  propio, chrome resuelve con la página).
- **Waterfall /me → data + pantalla en blanco** (`1494e9a`): /perfil
  mostraba PageLoading en blanco y luego los KPIs pop-in. Se extendió
  MeContextData al contrato completo de /me (phone, gender, styleRoles,
  enrollments, consent*, pendingProfile, effectivePro, onboarding) y se
  migraron TODOS los consumidores: perfil/datos, completar, HomeHub,
  gates admin/producer, staff, productor/{eventos,eventos/[id],pagos,
  parametros,listas}, practicas/{,nueva}, academia/alumnos, videos,
  private-lessons, crm-context, OnboardingRunner. Los fetches de datos
  disparan en paralelo con /me (especulativos — 401 descarta); /perfil
  tiene shell skeleton con forma real usando getStoredActiveRole() para
  la lente. ~10 requests /me duplicados eliminados por sesión.

Verificación: tsc web limpio, vitest 3/3, impeccable detect `[]`,
rutas principales 200 en dev. Smoke manual pendiente de las rutas
role-gated con sesión real (productor/academia/admin).

## Particulares en reservadas (`9c25a20`, change `2026-10-05-particulares-en-reservadas`)

Pedido: "la sección de mis particulares no debe existir — es otra clase
que aparece en reservadas". Eliminada la bandeja `/clases/particular`
y toda su navegación.

- **`/clases` scope reservadas**: `loadMine` hace `Promise.all`
  `/classes/mine` + `/private-lessons/mine`; union `ReservedItem`
  ordenada por día+hora (misma convención ISO-medianoche-UTC del día
  local que `Class.date`). Grupo fijo "Por agendar" arriba para las
  compradas sin `scheduledAt` (pago nunca invisible). Card compacta:
  academia · hora/"por agendar" · instructor/"por asignar" · Badge de
  estado · cancelar mientras REQUESTED/CONFIRMED (PATCH action=cancel).
- **Historial**: mergea particulares DONE/CANCELLED (sort desc).
- **Calendario**: las particulares con fecha cuentan en los dots.
- **API**: `GET /private-lessons/mine` rama alumno incluye
  `academy:{id,name}` — la card no necesita fetch extra del directorio.
  FakePrisma del spec ganó `academy.findMany`.
- **`PrivateLessons`**: consola staff+instructor pura (`academy`
  requerido); sección "mis solicitudes" del alumno eliminada.
- **Entradas eliminadas**: chip `privateTray` en /clases, item del
  sheet "+" lente academia (`SHEET_ACADEMY_ITEMS = []`), label de ruta.
- **Redirects**: notificaciones `academy.private_lesson.*` y
  `checkout/return` PRIVATE → `/clases?scope=reservadas` (parsea a
  scope mias + calScope reservadas — verificado en el código).
- **i18n**: retiradas `classes.privateTray`, `lessons.mineTitle`,
  `lessons.emptyMine`, `lessons.requested` (audit ALL_KEYS_OK).
- Spec canónica `academy-learner` actualizada (+1 requirement, Purpose
  reescrito — quedaba TBD del archive anterior).

Verificación: tsc api+web limpio, vitest 17/17 private-lessons +
classes spec verde, i18n ALL_KEYS_OK, impeccable detect `[]`,
validate strict verde. **Smoke manual pendiente** con sesión real:
particular sin agendar visible arriba de reservadas, cancelación,
terminales en historial, staff /academia/particulares intacto,
notificación private_lesson navega a reservadas.

## loading-states ronda 3 (`a4c1d2e`) — barrido del patrón amigos

Revisión sistemática de las ~65 páginas buscando el patrón residual
(fetch encadenado + skeleton-que-colapsa en sección opcional).
**Único caso real: `/bailes`** — la racha esperaba a /sessions para
fetchear (waterfall) y el bloque mejor-baile+racha colapsaba si
resolvía <2 semanas. Fix: fetch paralelo + bloque que aparece una
sola vez (sin skeleton provisional).

Verificados limpios: practicas, amigos/[id], notificaciones,
staff/[eventId], venue (master-detail gated), dj, analitica (+usuario),
admin/parametros + usuarios/[id], consola academia (dashboard, videos,
teaching-classes, private-lessons), academia hub, eventos (SSR — sin
flash posible). Los skeletons `=== "loading"` restantes viven en slots
persistentes (la sección siempre existe → el placeholder se llena).

Verificación: tsc web limpio, vitest 3/3, impeccable detect `[]`.

## Particular unificada como reserva (`particular-reserva-unificada`)

Feedback del usuario sobre `particulares-en-reservadas`: el card de la
particular debía ser el MISMO `ClassCard`, cancelar desde la ficha (no
inline en la lista), una sola llamada para reservadas, y se cuestionó la
duplicación de endpoints.

**Decisión (evaluada y documentada en el proposal)**: el modelo
`PrivateLesson` separado se MANTIENE — no es "una clase con aforo 1":
se paga antes de agendarse (`scheduledAt` null), no tiene serie/slot/
recurrencia, lleva comisiones y un ciclo REQUESTED→CONFIRMED→DONE
distinto. Fusionarlo en `Class` exigiría slot/series fake o nullables
estructurales en todo el dominio. Lo que converge es la **superficie
alumno**:

- **`GET /classes/mine`** mergea las particulares activas
  (REQUESTED/CONFIRMED) en la misma respuesta — shape del card vía
  `lessonCardItem` (`class-card-projection.ts`): `series:null`,
  `capacity:1`, `myBooking:"BOOKED"`, `date`/`startTime` null cuando no
  está agendada (`instantToCardDate` convierte el instante a la
  convención medianoche-UTC del card, con offset Santiago por Intl).
- **`?scope=past`** mergea DONE→"attended"/CANCELLED→"cancelled" (la
  cancelada sin agendar se ubica por su día de compra).
- **`GET /private-lessons/:id`** nuevo — detalle para alumno dueño /
  instructor / owner / admin; la comisión solo viaja a los tres
  últimos (el alumno nunca la ve).
- **`/private-lessons/mine` pierde la rama alumno** — solo
  `?as=instructor` (400 sin eso): una sola fuente de reservas del
  learner, se eliminó la lectura duplicada.
- **Web**: `LessonCardData` (series/date nullables) + unión
  `MineCardData`; `ClassCard` renderiza la particular idéntica (título
  "Clase particular", badge Reservado, link a la ficha). `/clases` hace
  UN fetch; "Por agendar" agrupa las `date:null` arriba.
- **`/clases/[id]`**: 404 de clase → fallback `GET /private-lessons/:id`
  → ficha equivalente (academia, instructor o "por asignar", fecha o
  "por agendar", precio, estado) + `PrivateLessonCancelCta` al pie
  (zona destructiva + sheet de confirmación — mismo patrón que
  `ClassBookingCta`; la devolución es manual, como reserva pagada).

Verificación: tsc api+web limpio, vitest 63/63 (classes 41 +
private-lessons 22, incl. merge mine/past, auth del detalle y comisión
oculta al alumno), i18n ALL_KEYS_OK, impeccable detect `[]`, openspec
validate verde, openapi.json+postman regenerados (198 paths),
flows.md/architecture.md actualizados. **Smoke manual pendiente**:
particular sin agendar arriba de reservadas, ficha + cancelación con
sesión real, consola staff intacta.

## Planes de academia — tag de tipo + seed por categorías (508ec9d + archive)

Pedido: el periodo del plan (Mensual/Trimestral/Semestral) va como tag
verde, no como texto; los nombres del seed ya no llevan periodo ni
conteo semanal (era redundante con el card) — ahora son categorías que
varían por academia; todas ofrecen clase de prueba y clase suelta.

- **UI** (`profile-plans-section.tsx`): `Badge variant="neon"` para el
  tipo junto al nombre; la línea gris solo muestra cuotas
  (N clases · N/semana).
- **Seed**: `plan()` acepta `aliases` — busca por nombre nuevo o
  antiguos y renombra in-place; restos con alias quedan `active:false`
  (no se borran, pueden tener enrollments). Verificado: 2 corridas
  idempotentes, 0 planes con nombre viejo, 0 duplicados, 80 activos.
- **Nombres**: muvet Oro/Platino/Diamante + Pack flexible; tumbao
  Normal; Mambo Madness Básico/Premium/VIP/Oro/Diamante; las 16
  restantes rotan pares [Básico,Premium] [Plata,Oro] [Normal,Extendido]
  [Esencial,VIP] [Bronce,Platino] [Inicial,Diamante] por índice.
- **Todas las academias**: `TRIAL` "Clase de prueba" $0 + `SINGLE`
  "Clase suelta" ($8k general / $10k Mambo-Tumbao / $12k muvet).
- Spec canonizada en `academies/public-profile` (tipo como tag +
  convención de nombres + renombre idempotente).

Verificación: tsc api+web limpio, openspec 47/47, impeccable detect
`[]`, SSR autenticado de `/academias/:id` confirma tag neon + nombres.

## CI/CD (mismo patrón que video-repo)

- **API → GitHub Actions**: `.github/workflows/deploy-api-docker.yml` —
  push a `main` → test+build → imagen `ghcr.io/<owner>/omnidance-api:<sha>`
  → SSH a la VM → `migrate deploy` + seed prod one-shot → recreate →
  health gate (`/api/health` 200 + `/api/me` 401) → nginx reload + sonda
  HTTPS por `vars.PUBLIC_API_HOST`.
- **`apps/api/Dockerfile`**: multi-stage node:22-slim; openssl en builder
  ANTES de install (sin él el postinstall de prisma genera engine
  openssl-1.1.x y el runtime openssl-3 no lo encuentra — verificado con
  build+run real: health 200, /me 401, migrate deploy OK).
- **`apps/api/docker-compose.yml`**: servicio `api` 127.0.0.1:4000,
  env_file .env, healthcheck curl. Prod no lleva DB ni Redis (REDIS_URL
  no se usa en runtime).
- **Front → Netlify**: `netlify.toml` (`shared build → web build`,
  publish `apps/web/.next`, plugin nextjs). Env vars en Netlify UI:
  `API_PROXY_TARGET` (rewrites same-origin → API), `NEXT_PUBLIC_*`.
  socket.io queda en polling por el proxy (ya es así en dev).
- **Docs**: `docs/ci-cd.md` = checklist completo (secrets GH, vars,
  .env de la VM incl. PAYMENT_GATEWAY=flow fail-close, nginx, Netlify).
- Infra/tooling — sin cambio de comportamiento → sin change OpenSpec.
- **Pendiente del usuario**: provisionar secrets/vars en GitHub, crear
  sitio Netlify + env vars, preparar `.env` en la VM y el vhost nginx.
  Primer push a `main` con todo listo dispara el primer deploy.
