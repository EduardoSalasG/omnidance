# Handoff - 2026-10-05: deploy a producción verde (saga P1002 → Flow)

Sesión de infraestructura sobre `dev` → `main`. Objetivo: llevar
omnidance al patrón de deploy de video-repo/expenses-tracker y dejar
el API corriendo en producción. **Logrado**: run `37326822526` verde
end-to-end (CI + VM + sonda HTTPS nginx).

## Resultado final

- API en `https://api.omnidance.eduardosalasg.dev` - nginx →
  `127.0.0.1:3002` → contenedor `:4000`. `/api/health` 200, `/api/me`
  401 (gate de ruta protegida), sonda HTTPS por nginx 401.
- Contenedor arranca solo con `node apps/api/dist/main.js` -
  `apps/api/docker-entrypoint.sh` **eliminado** (commit `108e1b5`).
- Migrate + seed son **one-shots del workflow**, nunca en el boot.
- Seed condicional por completitud: `role.count()` +
  `personRole.count({role:"ADMIN",status:"APPROVED"})` →
  `DB completa (9 roles, 1 admin) - seed omitido` (commit `e3147ed`).

## Qué pasó (para no repetir el debugging)

1. **Crash-loop P1002** (advisory lock): el entrypoint viejo corría
   `prisma migrate deploy` en cada boot contra `DATABASE_URL` pooled.
   Un contenedor viejo quedó crash-loopando ~8h sosteniendo el lock
   via sesión zombie server-side del pooler - bloqueó incluso el
   one-shot por endpoint directo. Fix: `docker rm -f omnidance-api`
   en la VM + terminar la sesión en Neon
   (`pg_terminate_backend` sobre `pg_locks WHERE locktype='advisory'`).
2. **`DIRECT_DATABASE_URL` descartado** por decisión del usuario.
   Queda `MIGRATION_DATABASE_URL` (opcional) con precedencia
   **secret GH > `.env` VM > `DATABASE_URL`** - ojo: un secret GH
   con URL pooled pisa un `.env` correcto.
3. **Fail-close de Flow**: `resolveGateway` exige en prod
   `PAYMENT_GATEWAY=flow` + `FLOW_API_KEY` + `FLOW_SECRET_KEY`.
   El usuario puso keys **placeholder** - el API levanta (solo valida
   presencia + `FLOW_BASE_URL` sandbox exacto) pero los pagos NO
   funcionan hasta credenciales sandbox reales
   (sandbox.flow.cl → Mis datos → Integraciones).
4. **Health check "failures" iniciales son normales**: el loop imprime
   `attempt N/60` en cada intento; 3-4 intentos (~8s) es el cold start
   de Nest (module graph + Prisma connect + bind). Solo es problema
   si llega a 60/60.

## Estado git

- `main` = `dev` en merge `96cf181`. Commits del día: `108e1b5`
  (sin entrypoint), `c89ec3f` (docs ci-cd), `e3147ed` (seed check),
  `1f8cbac`/`96cf181` (merges). Tag `v0.1.0` sigue en `87dfe57`
  (código de producto idéntico - todo lo posterior es CI/docs).

## Pendientes (usuario)

- **Flow sandbox real**: reemplazar `FLOW_API_KEY`/`FLOW_SECRET_KEY`
  placeholder en `/opt/apps/omnidance/.env` + recreate.
- **Netlify**: confirmar `API_PROXY_TARGET`, `NEXT_PUBLIC_API_URL`
  **vacía**, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` si se activa web push,
  `NEXT_PUBLIC_CARTO_BASEMAP_KEY`, `NEXT_PUBLIC_WEB_URL`.
- **Resend**: `RESEND_API_KEY`/`EMAIL_FROM`/`MAIL_FROM` en la VM -
  sin esto los magic links no llegan (login cojo).
- ~~VAPID~~ - hecho el mismo día (ver "Post-handoff").

## Post-handoff (misma sesión)

- **VAPID habilitado**: usuario generó keys, `.env` VM + Netlify
  pública; rerun `37326822526` recreó el contenedor y rebuild de
  Netlify horneó la pública en el bundle.
- **Verificación pública end-to-end**:
  `api…/api/health` 200, `api…/api/me` 401, `omnidance.netlify.app`
  200, `omnidance.netlify.app/api/health` 200 (proxy same-origin OK -
  cookies first-party confirmadas).
- `workflow_dispatch` agregado al workflow (commit `4ffaa09`, `dev`) -
  permite redeploy manual sin commit una vez mergeado a `main`.
- Health gate ahora imprime `API healthy after N attempt(s)` (commit
  `8e9148c`, `dev`) - ya no parecen errores los attempts de cold start.

## Pendientes (repo)

- Docs de referencia completas en `docs/ci-cd.md` (checklist primer
  deploy, troubleshooting P1002/Flow, precedencia de secrets).
- `dev` adelanta a `main`: `8e9148c` (log health gate), `4ffaa09`
  (workflow_dispatch), `f165624` (sweep em-dash + quitar hint de
  métricas en género) y el feature nuevo abajo - promover todo junto
  en el próximo release con bump MINOR + CHANGELOG.

## Feature: paso post-registro `/bienvenida` (change post-signup-profile-setup)

Pedido del usuario: signup corto como está; tras crear cuenta pedir
sexo/Instagram/etc. en un paso propio salteable, con recordatorio sutil
en `/perfil`.

- `POST /auth/register` ok → redirect a `/bienvenida?next=…` (propaga
  `next` validado; solo register, los otros modos no cambian).
- `/bienvenida` (grupo (app)): nombre pre-llenado, teléfono, Instagram,
  género (GenderGroup compartido, nullable/deseleccionable) y chips de
  estilos con rol+nivel opcional. Todos los campos opcionales.
  Submit = `PATCH /me` + `PUT /me/style-roles` condicional; "ahora no"
  y submit marcan `onboarding["profile-setup"]` (POST /me/onboarding)
  → `next || /inicio`. Guard: marca hecha → redirect; sin sesión → login.
- Card "Completa tu perfil" en `/perfil` mientras falte teléfono,
  Instagram, género o un estilo; dismiss persistente vía
  `onboarding["profile-reminder"]`; CTA a `/perfil/datos`.
- API: `PATCH /me` ahora responde 409 `phone_exists` si el teléfono
  normalizado es de otra persona (antes P2002 → 500). Spec agregada.
- `GenderGroup` extraído a `components/profile/GenderGroup.tsx`
  (reusado por `/perfil/datos` y `/bienvenida`).
- i18n: nuevo part `welcome.json`, keys `profile.reminder.*`.
- Sin migración - `Person.onboarding` (JSON) guarda las marcas.

Verificado: API tests 1429/1429 (63 archivos), `nest build` OK,
`tsc --noEmit` web OK, `next build` OK (`/bienvenida` 4.52 kB),
i18n audit ALL_KEYS_OK, openspec validate OK. Pendiente: QA funcional
del flujo register → bienvenida → skip/save en navegador real, y
archivar el change al cerrar release.

## Feature: depuración del catálogo de estilos (change prune-style-catalog)

Pedido del usuario: el picker "Tu baile" ofrecía estilos nicho que no
se quieren como selección personal.

- `STYLE_CATALOG` pierde "Salsa on2" y "Bachata dominicana"; seed dev
  sin la serie inactiva "Bachata Dominicana - Intensivo" ni los
  styleRoles de Sebastian/Daniela con esos estilos.
- Denylist `apps/web/src/lib/profile-styles.ts` (`PROFILE_HIDDEN_STYLES`:
  Salsa on2, Bachata dominicana, Afrocubano, Rueda de casino, Fusión)
  aplicada al select de `/perfil/datos` y chips de `/bienvenida`. Un
  estilo oculto ya asignado sigue visible en su fila. Series, eventos
  y academias no se tocan (Rueda/Afrocubano/Fusión siguen vigentes ahí).
- Los seeds no borran filas: DBs ya pobladas (Neon prod incluida)
  conservan los 2 estilos removidos, pero el denylist los oculta del
  picker igual. Si se quiere borrarlos de prod hay que hacerlo a mano
  revisando FKs (PersonStyleRole, bloques de eventos, series).

Verificado: 1429/1429 tests API (los e2e siembran dev completo),
`tsc --noEmit` web OK, openspec validate OK.

## Feature: borrar usuario en cascada desde admin (change admin-user-delete)

Motivo: re-testear onboarding en prod con email real - exige liberar
el email de la cuenta previa.

- `DELETE /api/admin/users/:personId` (permiso `admin.access`):
  transacción que borra las 9 filas con FK a `Person` (PersonRole,
  FiscalProfile, PersonStyleRole, Rsvp, EventDj, Notification,
  PushToken, PlatformSubscription payer; `producerId` → null) y luego
  la `Person`. Audita `USER_DELETE`. Self-delete → 400; fantasma → 404.
  Ids sin FK (tickets, audit, sesiones) quedan como huella - mismo
  criterio que una baja de negocio.
- Ficha `/admin/usuarios/[personId]`: card "Zona de peligro" con
  confirm + redirect al listado.
- Acceso admin en prod: magic link a `SEED_ADMIN_EMAIL` (la cuenta
  que creó el seed prod tiene ADMIN APPROVED) → `/admin/usuarios`.

Verificado: 1434/1434 tests API (+5 e2e de cascada), `tsc --noEmit`
web OK, i18n audit ALL_KEYS_OK, openspec validate OK.

## Fix: magic link dejaba al usuario sin sesión en prod

Reportado por el usuario: magic link llegaba pero no iniciaba sesión.

- Causa: `POST /auth/magic-link` armaba el link sobre `API_URL`
  (`api.omnidance…/api/auth/verify`) → el `Set-Cookie` caía en el
  dominio del API mientras la SPA consume todo same-origin por el
  proxy de Netlify (`omnidance.netlify.app/api/*`) → la cookie nunca
  viajaba. Ahora el link apunta a `WEB_URL/api/auth/verify` → verify
  corre por el proxy y la cookie queda en el dominio web.
- Bonus: el redirect de verify ahora discrimina: cuenta nueva
  (creada por el upsert) → `/bienvenida`; existente → `/inicio`
  (antes siempre `/` - landing de marketing).
- Mismo bug latente aplicaba a cualquier link firmado que apunte al
  API; revisar si aparecen otros (hoy solo el magic link usa cookie).
- e2e: asserts de `Location` en leads.e2e (existente → /inicio) +
  nuevo caso email desconocido → /bienvenida. 1435/1435 verdes.

## Fix: íconos PWA seguían verdes

El rebrand `6fa5b62` cambió `icon.svg` a `#a78bfa` pero no la
constante `NEON` de `generate-icons.mjs` ni regeneró los PNG -
corregido y regenerados los 4 PNG (commit `98ad610`).

## Cierre de sesión - Release v0.2.0 desplegado

- **Tag**: `v0.2.0` en `main` (SHA inmutable `be7f6aff4d14a6ad2f1abeb9e1f07ff9715bf297`).
- **Changes OpenSpec archivados**: post-signup-profile-setup, prune-style-catalog, admin-user-delete, pwa-install-prompt (specs canónicas sincronizadas).
- **Deploy API**: run GH Actions `37344036269` verde - migrate sin pendientes, seed omitido (DB completa), health gate OK al intento 4.
- **Verificación prod**: `api.../api/health` 200, `api.../api/me` 401, `omnidance.netlify.app` 200, proxy same-origin 200, manifest nuevo servido (handle_links), `/bienvenida` guard OK (307 a login).
- **Incluye**: /bienvenida + reminder perfil, 409 phone_exists, catálogo de estilos depurado, DELETE admin en cascada, fix cookie magic link (WEB_URL), iconos morados + O centrada, InstallPrompt PWA, workflow_dispatch, em-dashes fuera.
- **QA pendiente**: flujo register → bienvenida en prod; install prompt en Android/iOS reales; magic link en PWA instalada (Android). Flow sigue con credenciales placeholder.

## v0.2.1 (mismo día)

- Tag `v0.2.1` en `3432594`; fix CI post-tag en `a33f9ab` (comilla
  suelta en el extractor de `SEED_ADMIN_EMAIL` rompió el script remoto
  con `unexpected EOF` - el tag queda en el commit de versión, el fix
  es infra-only).
- Deploy verde: run `37348224627` (seed omitido, healthy al intento 4).
- **Dato prod pendiente**: `Person.email` del admin quedó con comillas
  + espacios (seed corrió con el valor crudo del `.env`). Reparar en
  Neon SQL Editor - SQL exacto en `docs/ci-cd.md` (sección
  troubleshooting, "Email del admin con comillas en la DB"). Sin eso el
  magic link del admin no lo encuentra.

## v0.3.0-candidates en dev (sin promover)

### split-pro-landings (d7f2f14)

- `/pro` queda como selector de audiencia (cards + form DJ/VENUE_MANAGER).
- `/para-academias` (acento esmeralda, rol fijo ACADEMY_OWNER) y
  `/para-productores` (violeta, rol fijo PRODUCER): copy PAS por rol,
  meta/canonical propios, sitemap, cross-links.
- Strip de prueba social por audiencia: eventos reales en productor/
  pro; academias reales en academias (ver abajo).

### academy-operations-insights (0d32a84)

- `Person.birthDate` (migración `20261010000000_person_birthdate`):
  autodeclarada en `PATCH /me` (ISO pasada, año>=1900, null/vacío limpia)
  y editable en `/perfil/datos` (input date). `GET /me` la devuelve.
- `GET /academies/public` SIN sesión: `{id,name,styles}` de academias
  activas sin mora - alimenta el strip de `/para-academias`. Exposición
  mínima (sin dirección/instructores/métricas).
- Dashboard `GET /academies/:id/dashboard` gana `expiringEnrollments`
  (ACTIVE/TRIAL/ONLINE con endsAt en ventana, default 14d) y
  `upcomingBirthdays` (cumpleaños de alumnos en 30d, día/mes solamente,
  wrap dic a ene). Ventanas = PlatformParam
  `academy.insights.expiring_days` / `academy.insights.birthday_days`.
- Consola `/academia`: listas "Planes por vencer" y "Cumpleaños
  próximos" (render condicional, link a ficha del alumno).
- Seed: params nuevos + birthDates demo relativas a hoy (camila +6d,
  antonia +14d, daniela +27d, diego +45d fuera de ventana).
- Verificado: 138/138 tests tocados (33 dominio, 28 people, 77 e2e),
  tsc web limpio, i18n ALL_KEYS_OK, openspec validate x2 verde.
- Stack local levantado y verificado: api 200, /academies/public con
  academias reales, /para-academias renderiza el strip + copy nuevo.
- **Release**: acumular en dev hasta QA visual del usuario; v0.3.0
  (MINOR) junto con split-pro-landings al promover.

---

## Update 2026-10-06 - academy-payment-claims en dev (commit bd93b63)

Feature completa: pagos directos alumno a academia con validacion por comprobante.

- Schema: AcademyPaymentMethod (TRANSFER/PAYMENT_LINK/CASH + details JSON) y PaymentClaim (PENDING/APPROVED/REJECTED + receiptKey) - migracion 20261011000000.
- src/storage: puerto STORAGE + LocalDiskStorage en UPLOADS_DIR (dev ./uploads, prod /app/uploads con bind mount /data/omnidance-uploads en la VM - sin el volumen los comprobantes se pierden en cada recreate). Stream autenticado, nunca estatico publico.
- API: metodos CRUD admin + listado sesion; POST claims multipart (imagen/pdf <=5MB, limite multer + mime -> 400); cola owner; approve (tx: Payment MEMBERSHIP gateway MANUAL + enrollment extendido/creado con membershipBase/membershipEndsAt + planId actualizado al plan declarado); reject con motivo; notificaciones a owner y alumno.
- refId claim-<id> no decodifica a plan en decodeMembershipRef -> los pagos MANUAL nunca entran a Payout (verificado en payouts.controller.ts).
- Web: 'Pagar a la academia' en /academias/[id] (metodos + upload + historial); /academia/cobros con ClaimsQueue + PaymentMethodsAdmin; i18n academyPay.
- Verificado: 90/90 e2e academias, 1470/1470 suite API, tsc web limpio, i18n ALL_KEYS_OK, smoke en vivo (claim -> aprobacion -> 409 re-approve, receipt 200, exe -> 400).
- OpenSpec: change academy-payment-claims validado, tasks completas - pendiente archivar al release.
- Pendiente antes de prod: montar /data/omnidance-uploads en la VM (docs/ci-cd.md tiene el snippet de compose), review visual de las dos superficies, y QA del flujo completo en dev.
