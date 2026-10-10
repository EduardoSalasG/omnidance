# Changelog

Todos los cambios notables del proyecto se documentan aquí, siguiendo
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y SemVer.

## [0.8.2] - 2026-10-10

### Fixed

- **Seed — eventos del mismo día**: `nextDay(weekday)` siempre saltaba
  al *siguiente* weekday (`|| 7`), así que correr el seed un sábado
  movía los sociales del sábado (Trilogía incluida) a la semana
  siguiente en vez de dejarlos esa misma noche. Ahora incluye el día
  actual cuando el weekday calza y la hora del evento aún no pasa.
  Semántica `weeksAhead` intacta (SCE sigue cediendo su sábado a
  Trilogía).

## [0.8.1] - 2026-10-10

### Fixed

- **SSR en producción (Netlify)**: los módulos con fetch server-side
  (`/eventos`, detalle de evento, academias, clases, locales, checkouts,
  `/evaluar`, `/reclamar`) seguían cayendo a `http://localhost:4000` en
  el runtime serverless — las vars de `[build.environment]` no llegan a
  la función y `NEXT_PUBLIC_WEB_URL` no estaba seteada. `serverApiUrl()`
  ahora resuelve a nivel request con fallback al **origin propio** vía
  `headers()` (la web sirve `/api/*` por el rewrite — cero dependencia
  de env vars). Reemplaza el `SERVER_API_URL` module-scope de v0.7.0.
- **socket.io en producción**: el edge de Netlify normalizaba
  `/socket.io/` → 308 → `/socket.io` y el path sin barra no matchea
  engine.io (Nest 404 en loop). `[[redirects]]` en `netlify.toml`
  proxea `/socket.io/*` al API a nivel edge, antes del runtime Next.

## [0.8.0] - 2026-10-10

Onboarding guiado completo para los cuatro roles de consola: el
productor y el instructor ahora reciben el tour de bienvenida que el
dancer y el dueño de academia ya tenían.

### Added

- **Tour del productor** (`tour="productor"`): recorre el dashboard
  operativo — KPIs (eventos agendados, entradas vendidas, facturación
  del mes), cobros por revisar, tops por facturación y asistencia —
  luego la navegación a `Mis eventos`, el menú de módulos y la campana
  de notificaciones. Copy reescrito al vocabulario de la consola v2
  (el texto anterior referenciaba liquidaciones y listas de puerta,
  módulos que salieron del sidebar).
- **Tour del instructor** (`tour="instructor"`): recorre el home —
  "Tu semana" (KPIs de clases/horas/alumnos), próximas clases —
  y la navegación a `Mis clases`, `Alumnos`, la campana y el perfil.

### Auditado (sin cambios necesarios)

- **Dancer**: `profile-setup` en `/bienvenida` + `home`/`home-academy`
  + tours por módulo (eventos, QR, clases, bailes, amigos, prácticas,
  perfil).
- **Dueño de academia**: `academia-owner` (dashboard) + `academia`
  (hub staff) + los tours de lente social.

## [0.7.0] - 2026-10-10

Consolas del instructor y del productor como ciudadanos de primera
clase: navegación mínima, dashboards operativos, asistencia en ventana,
recordatorios de clase, y la config del productor dividida en páginas.
Además el fix del bug de producción que dejaba los módulos server-side
apuntando a localhost.

### Added

- **Consola del instructor**: tab `Clases` normal (sin centro verde),
  home con "Próximas clases" (lo que dicta como primario o co-profe),
  tab `Alumnos` sin drawer móvil, y perfil sin gamificación ni "Mis
  pagos". Asistencia solo marcabile en la ventana **30 min antes a 30
  después** del inicio real (`attendance.out_of_window`); fuera de hora
  se muestra el horario habilitado y los no marcados quedan "Sin
  confirmar" sin perder el cupo.
- **Recordatorios de clase**: job por minuto notifica al plantel y a
  los alumnos BOOKED a los **30 y 10 min** antes ("Faltan 30 minutos
  para tu clase X en Academia"), con deep-link por lente y dedupe
  (persona, clase, offset). `class.instructor_assigned` al asignar
  instructor en serie/slot/import CSV.
- **Consola del productor v2**: `/inicio` como dashboard operativo
  (eventos agendados, entradas vendidas, facturación del mes, top 5 por
  facturación y por asistencia en la misma fila, cobros por revisar) vía
  `GET /producer/dashboard`; perfil sin pagos/racha/insignias.
- **Configuración del productor en páginas**: Valores por defecto
  (`/productor/parametros`: mesas, aforo sentable, corte de preventa),
  Medios de pago (`/productor/medios-pago`: pasarela propia + medios de
  cobro directos), Suscripción (`/productor/suscripcion`: Producer Pro +
  comisión todo incluido, retorno `?pro=ok` de Flow) y Apariencia
  (`/productor/apariencia`).
- **Listas de invitados dentro de la ficha del evento**:
  `EventListsSection` en `/productor/eventos/[id]`; `/productor/listas`
  redirige al listado de eventos y `nueva?eventId=`/`[id]` conservan el
  contexto del evento.
- **Cola masiva de comprobantes**: `/productor/comprobantes` muestra la
  cola PENDING completa primero (navega a ficha para aprobar/rechazar),
  historial resuelto, filtros y empty state explícito.
- **Notificación `ticket.sale` al productor** al liquidar una compra de
  entradas (comprador · cantidad · evento · monto, deep-link a la
  ficha); sin autoaviso cuando el comprador es el productor.
- **Reservas de mesa editables**: las CONFIRMED admiten guardar cambios
  de mesa asignada y tamaño desde la ficha del evento.
- **Paginación en analítica**: `POST /query/run` acepta
  `page`/`pageSize` (clamped, máx 100) y devuelve `total` real; la UI
  renderiza `Pager` y resetea a página 1 al cambiar filtros.
- **Seed enriquecido**: todos los eventos reciben 150-350 entradas
  determinísticas (vie/sáb 250-350), pagos PAID, ~85% de check-ins en
  pasados, reservas de mesa mezcladas y claims PENDING para probar la
  consola del productor; log de progreso por sección.

### Fixed

- **Módulos server-side rotos en prod** (`SERVER_API_URL`): las páginas
  SSR fetcheaban `API_URL ?? localhost:4000` y en Netlify la var no
  existía → eventos, academias, clases, locales, checkouts y fichas
  públicas fallaban. La resolución ahora cae a `API_PROXY_TARGET` o al
  origen propio vía el rewrite `/api/*`.
- Selects de academia/serie/plan duplicados por data parcial: dedupe
  por label normalizado (`dedupeOptions`).

## [0.6.0] - 2026-10-09

Plantel multi-profesor por horario y clase (co-teaching): una clase
puede ser dictada por N instructores, y se suma Eduardo Salas al
dataset del piloto.

### Added

- **Modelo multi-instructor** (`academies/class-series`): nuevas tablas
  `ClassSlotInstructor` (plantel del horario) y `ClassInstructor`
  (plantel materializado por instancia) con migración versionada +
  backfill del primario existente. `instructorId` se conserva como
  instructor principal: comisión, encuesta y liquidación siguen leyendo
  el singular sin repartir montos — el join es el conjunto completo.
- **Materialización copia el plantel**: cada clase nueva recibe todos
  los co-profes del slot (primario incluido, dedup).
- **`instructors[]` en las lecturas**: detalle de clase, roster,
  `/classes/teaching`, clases por serie y dashboard del owner exponen
  el plantel completo (primario primero, con foto/Instagram en
  detalle); el singular `instructor` se mantiene por compatibilidad.
- **Asistencia por cualquier profe del plantel**: `canMark`,
  `markAttendance` y el filtro `?instructorId` aceptan primario o
  co-instructor (slot-level y class-level).
- **Web muestra "A · B"**: cards de clase, ficha `/clases/[id]`
  (avatares + Instagram de cada profe), roster de academia, ficha de
  serie y dashboard del owner renderizan todos los instructores.
- **Eduardo Salas en el seed** (`salas.eduardo.cl@gmail.com`): cuenta
  con DANCER + INSTRUCTOR, teléfono, género, estilos Mambo on2 y
  Bachata sensual LEADER intermedio, enrollment Ilimitado en Mambo
  Madness, instructor del plantel y co-profe de los sábados junto a
  María, más actividad social (clique, entradas, check-ins, sesiones,
  badges, IG `eduardosalasg`). Claim de cuenta al registrarse.

### Fixed

- Import masivo de horario: los slots importados ahora también escriben
  su fila `ClassSlotInstructor` (el plantel no quedaba incompleto si el
  slot no pasaba por el controller).

## [0.5.0] - 2026-10-09

Onboarding del dueño de academia en ambos viewports y corrección del
chrome móvil del bailarín.

### Added

- **Checklist de activación persistente** en el home del owner: 5 pasos
  (primera serie/horario, plan de membresía, medio de pago publicado,
  equipo invitado, primer alumno) con progreso visible "N de M"; solo
  desaparece cuando la academia queda completa. Nuevo `methodsCount` en
  `GET /academies/:id/dashboard` (conteo de medios de pago activos).
- **Tour de primera visita `academia-owner`** en `/inicio` (clave propia,
  no pisa el tour `academia` del hub de staff): recorre KPIs, checklist,
  operación del día, colas pendientes, alertas de retención, navegación
  (hamburguesa en `<lg` / sidebar en `≥lg`) y campana de notificaciones.
- **`OnboardingRunner` espera targets async**: sondea cada 250ms hasta
  que el set de anchors quede estable (~1.5s, máx 8s) en vez de
  resolverlos una sola vez — las secciones detrás de fetch (dashboard,
  gates) ya entran al tour; las ausentes se omiten como antes.
- **Tour de staff `/academia` resuelve en desktop**: anchors
  `nav-academy`/`nav-classes` replicados en la sidebar; el toggle de la
  sidebar usa `sidebar-toggle` (sin colisión con `appbar-menu`).

### Fixed

- **DANCER ya no ve drawer ni hamburguesa en `<lg`**: `accountGroup`
  (Perfil) se agregaba siempre al drawer aunque `DRAWER_BY_ROLE.DANCER`
  estuviera vacío — cumple `dancer-navigation` (tab bar + sheet `+`).
- La hamburguesa ya no flashea mientras `/me` carga (`hasDrawerItems`
  exige sesión resuelta).

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

[0.5.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.5.0
[0.4.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.4.0
[0.2.1]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.2.1
[0.2.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.2.0
[0.1.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.1.0
