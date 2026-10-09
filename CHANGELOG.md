# Changelog

Todos los cambios notables del proyecto se documentan aquí, siguiendo
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y SemVer.

## [0.4.0] - 2026-10-09

Release de consolas y piloto: consola de dueño de academia completa
(v3+v4), paridad de consola productor (v5), consola CRM, motor de
consultas de analítica por lente, insights operativos por módulo y la
preparación del piloto productivo con usuarios reales y dataset demo.

### Added

- **Consola owner de academia**: navegación reestructurada, Clases
  como entidad navegable (listado + detalle con acciones + borrado
  lógico), Planes con KPIs y detalle, Cobros con detalle e historial
  unificado, Equipo con acuerdo económico (`payType`: PER_CLASS /
  MONTHLY / COMMISSION), Particulares, encuestas mensuales curso/profe
  (anónimas, con job), paginación `{items,total,page,pageSize}` en
  todos los listados.
- **Paridad consola productor**: fichas navegables (código, lista,
  liquidación, comprobante), cards clickeables, ConsoleHeader, zona
  destructiva, `me/payouts` paginado y endpoints de detalle.
- **Consola CRM**: ficha de contacto (score/actividad/recientes),
  ficha de campaña con envío por diálogo, crear campaña/trigger como
  páginas, sort en listados, iconos reales.
- **Analítica por lente**: un solo `/analitica` por rol activo con el
  motor de consultas compartido (`GET /query/catalog`,
  `POST /query/run`, `/query/options`, exports y consultas guardadas);
  fuentes lazy desenvueltas correctamente en la lente owner.
- **Insights por módulo**: `/academia/alumnos` (top 5 asistencia y
  monto pagado del mes), `/academia/series` (KPIs asistencia/clase y
  clases-semana/alumno + top/bottom 5), `/academia/planes` (top 5
  comprados del mes), `/academia/cobros` (planes por vencer hoy/esta
  semana); endpoints `students/insights`, `series/insights` y
  `topPurchasedMonth` en `plans/kpis`.
- **Filtros operativos**: modalidad multiselect en `/academia/series`
  (chips en FilterBar + `typeId` CSV en el endpoint).
- **Claim de cuenta pre-sembrada**: `POST /auth/register` sobre email
  existente reclama la Person — password correcto → sesión; sin match
  o sin password → magic link + 409. Permite registrar usuarios reales
  sobre data sembrada.
- **Checkout transparente**: el método de pago siempre visible en
  eventos y membresía — sin métodos propios, la pasarela queda como
  única opción marcada.

### Changed

- **Seed demo enriquecido**: usuarios reales del piloto (Gabriel
  owner/dancer/instructor, Mónica, María), academia "Adrian y Leo"
  (mambo), Mambo Madness con parrilla/planes reales y ~94 alumnos,
  20-70 alumnos con asistencias del mes pasado/vigente en todas las
  academias, evento Trilogía 5ta edición completo, MercadoPago como
  PAYMENT_LINK, cleanup automático de residuos E2E y poda de estilos
  removidos.
- **Piloto productivo**: `SEED_ENV=prod` corre temporalmente el
  dataset demo; el seed real quedó en `seed-prod-baseline.ts`
  (`SEED_ENV=baseline`).
- **Chrome/UI**: h1 único por página, un solo "volver" por página,
  toggle Social/Academia solo en `/inicio`, skeleton único de arranque
  en analítica, cards de planes con layout vertical en desktop,
  vencimientos de inicio redirigen a `/academia/cobros`, botón guardar
  centrado en edición de método, "Perfil público" → "Perfil de la
  academia".

## [0.3.0] - 2026-10-06

Release mayor de plataforma: consola admin operativa (jobs + campañas
de mail), programa completo de pagos directos (academia y productor)
con validación por comprobante, puertos de pago multi-proveedor,
consola financiera, check-in offline y wallet.

### Added

- **Consola de jobs `/admin/jobs`**: `ScheduledJob` + `JobRun` en DB
  (la DB es la fuente de verdad del horario — sobrevive deploys),
  registro central `JOB_REGISTRY` con 5 jobs, catch-up al boot,
  `nextRunAt` real vía `cron-parser` en `America/Santiago`, editar
  cron/pausar/ejecutar-ahora e historial por corrida con contadores.
  Claim atómico `runningRunId IS NULL` para multi-instancia.
- **Campañas de mail `/admin/campanas`**: asunto + HTML con preview,
  audiencias ALL/ROLE/EVENT (con búsqueda `q` de eventos) y con
  contexto `ENROLLMENTS_EXPIRING`/`ENROLLMENTS_EXPIRED`/
  `PLATFORM_SUB_EXPIRING`/`CLAIMS_PENDING`; variables `{{var}}` por
  destinatario validadas al guardar; dedup por ciclo vía
  `MailCampaignSent`; envío único o cron, test-send, cancelación
  mid-send y tracking por destinatario.
- **Opt-out de campañas**: `Person.mailOptOutAt`, footer con link
  firmado `GET /api/mail/unsubscribe?p=&t=` (HMAC-SHA256 con
  `JWT_SECRET`, público), exclusión en resolución y re-chequeo al
  enviar; el correo transaccional no se ve afectado.
- **Pagos directos alumno → academia**: medios propios del owner
  (transferencia/link/efectivo) configurables en `/academia/cobros` y
  visibles en el checkout; claim `AWAITING` persistente (el alumno
  sale a pagar y retoma), datos de transferencia copiables en bloque,
  comprobante adjunto y validación del owner con seguimiento de
  intentos sin comprobante.
- **Medios de cobro propios del productor** (transferencia/link/
  efectivo con comprobante validado, `OWN_METHOD`) y **cuentas de
  pasarela del productor** (credenciales cifradas, `OWN_GATEWAY`,
  webhook `?account=`).
- **Puertos de pago multi-proveedor**: `GatewayRegistry` con webhook
  `:provider`, adaptador MercadoPago, adaptador Fintoc (A2A CL/MX) y
  `SubscriptionProvider` normalizado (Flow como adaptador, provider
  por param).
- **Comisión todo incluido**: el comprador paga el precio exacto y la
  comisión se descuenta al productor.
- **Consola financiera `/admin/finanzas`**: KPIs, liquidaciones,
  devengado y SaaS; notas de cobro internas `BillingDocument` por
  liquidación.
- **Check-in offline en puerta**: manifiesto cacheado + cola
  IndexedDB + sync batch.
- **Wallet**: push day-of de tickets, lanzador Google Wallet y
  pendiente en wallet.
- **Academias**: carga masiva CSV (`bulk-import`), colaboradores por
  capacidad con auditoría, emails de renovación con gracia + aviso al
  owner, insights de retención (planes por vencer + cumpleaños),
  `Person.birthDate`, `GET /academies/public`.
- **Eventos**: corte de preventa por evento/productor con entrada
  liberada online.
- **Landings pro separadas**: `/para-academias` y `/para-productores`
  con copy por rol.

### Changed

- Selector de eventos de campañas: búsqueda por nombre sin límite de
  ~50 PUBLISHED, muestra fecha y status.
- CTA de compra de planes/clases unificado a "Comprar" ("Extender
  vigencia" cuando hay plan vigente).
- Copy: "consola"/"panel" → lenguaje simple; encuesta "Sofocante" →
  "Calurosa"; landing academias reordenada por operación.

### Fixed

- CI: comilla suelta en el extractor de `SEED_ADMIN_EMAIL` rompía el
  script remoto del deploy.

## [0.2.1] - 2026-10-05

### Fixed

- **Install prompt en Android**: el service worker solo se registraba
  al activar push, así que Chrome nunca emitía `beforeinstallprompt` y
  el aviso era invisible en Android. Ahora `/sw.js` se registra al
  montar el aviso, declara el `fetch` handler que Chrome exige, y hay
  instrucciones manuales (menú ⋮) como fallback.
- **`SEED_ADMIN_EMAIL` contaminado**: el workflow extraía el valor del
  `.env` con `grep|cut` crudo - las comillas y espacios quedaban en
  `Person.email` y el magic link nunca encontraba al admin. El
  extractor y `seed-prod` ahora normalizan (comillas + whitespace +
  minúscula, igual que auth).
- Notificaciones push muestran el ícono de la app (`/icon-192.png`).

## [0.2.0] - 2026-10-05

Primera iteración post-release inicial: onboarding post-registro,
mantenedor admin con borrado en cascada, depuración del catálogo de
estilos, fixes de autenticación magic-link y polish de PWA.

### Added

- **Onboarding**: paso post-registro `/bienvenida` (salteable) que pide
  nombre, teléfono, Instagram, género, estilos de baile con rol y nivel;
  solo corre una vez vía marca `onboarding["profile-setup"]`.
- **Perfil**: recordatorio "Completa tu perfil" en `/perfil` mientras
  falten datos, con dismiss persistente `onboarding["profile-reminder"]`.
- **Admin**: `DELETE /api/admin/users/:personId` borra al usuario en
  cascada (9 relaciones con FK a `Person`, `producerId` en null) con
  auditoría `USER_DELETE`; zona de peligro en la ficha de usuario con
  confirmación. El email queda libre para re-registro.
- **PWA**: prompt de instalación post-login (diálogo nativo en Chromium
  vía `beforeinstallprompt`, instrucciones del share sheet en iOS),
  dismiss persistente; manifest declara `id`, `scope` y
  `handle_links: "preferred"` para que los links del dominio abran la
  app instalada.

### Changed

- **Catálogo de estilos**: seed sin `Salsa on2` ni `Bachata dominicana`;
  el picker "Tu baile" oculta además `Afrocubano`, `Rueda de casino` y
  `Fusión` (siguen disponibles para academias, series y eventos).
- **Magic link**: el link del email ahora apunta al origen web
  (`WEB_URL/api/auth/verify`) para que la cookie de sesión caiga en el
  dominio del frontend; verify redirige a `/bienvenida` en cuentas
  nuevas y `/inicio` en existentes.
- **CI**: workflow del deploy acepta `workflow_dispatch` para redeploy
  manual; el health gate loguea el intento exitoso.
- **Copy**: eliminado el uso de guión largo (em-dash) en toda la app.

### Fixed

- `PATCH /me` con teléfono ya registrado en otra cuenta responde
  `409 phone_exists` en vez de un error 500 por conflicto Prisma.
- Íconos PWA regenerados con el acento morado del rebrand (antes
  salían verdes) y la O centrada verticalmente.

## [0.1.0] - 2026-10-05

Primera versión estable - promoción inicial de `dev` a `main` con pipeline
de despliegue a producción.

### Added

- **Nightlife**: eventos, series y asistencia con QR rotativo (TOTP),
  ticketing con cargo de servicio, passes y series-pass, staff por evento,
  check-ins, lista/venue, analíticas B2B del productor, sugerencias de
  canciones y ratings privados agregados.
- **Academy**: perfiles públicos de academias, planes por categoría
  (mensual/trimestral/semestral/pack/clase suelta/clase de prueba),
  inscripciones y cuotas, reservas de clases, clases particulares
  (compra → asignación del instructor → realización), videos y CRM del
  academy owner (scores, tags, campañas, triggers).
- **Economía**: checkout con Flow, códigos de descuento, payouts
  PRODUCER/ACADEMY/VENUE, suscripciones SaaS de academia y tiers Producer
  Pro (con trial de lanzamiento) gateando features avanzadas.
- **Gamificación**: rachas, puntos, insignias y Prime Time - conductas,
  nunca puntajes expuestos.
- **Plataforma**: auth por magic link con sesiones firmadas, RBAC global
  DB-driven (roles/permisos/grants), parámetros operativos en
  `PlatformParam`, auditoría admin, notificaciones in-app + Web Push,
  i18n `es-CL` y PWA dark-first mobile-first.
- **Operación**: exports de eventos/series en CSV y PDF, panel admin
  (parámetros, inteligencia de usuarios), health check `/api/health`.

### Security

- Secrets con fail-fast en producción (sin defaults públicos para JWT/QR).
- Payments fail-close: `PAYMENT_GATEWAY=flow` exige credenciales reales.
- Ratings y evaluaciones siempre privados y agregados; scores CRM
  privados por actor.

### CI/CD

- API: GitHub Actions → build + suite completa (unit + e2e sobre Postgres
  efímero) → imagen `ghcr.io/EduardoSalasG/omnidance-api` → deploy SSH a
  la VM → migrate + seed → health gate → sonda HTTPS por nginx.
- Contenedor Docker auto-contenido: `prisma migrate deploy` en cada boot
  (aplica solo pendientes) + seed prod condicional si la DB está vacía.
- Web: Netlify (Next.js runtime) con rewrite same-origin `/api/*` →
  `api.omnidance.eduardosalasg.dev`.
- DB: Neon Postgres externo (`omnidance`) - pooled para runtime, directo
  para migraciones.

[0.2.1]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.2.1
[0.2.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.2.0
[0.1.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.1.0
