# Changelog

Todos los cambios notables del proyecto se documentan aquí, siguiendo
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y SemVer.

## [1.9.0] - 2026-10-22

### Added

- **Aviso a admins de registro nuevo**: cada alta real (register,
  primer magic link u OTP sobre email sin cuenta) notifica
  `user.registered` en el centro de notificaciones de cada admin
  APPROVED. Claims y altas de admin no notifican. NotificationsModule
  ahora @Global.
- **/productor/desembolso**: la cuenta de desembolso (Stripe Connect)
  pasa de sección en /productor/pagos a página propia dentro del
  grupo Configuración del nav del productor; el onboarding de Stripe
  vuelve a esa ruta.
- **Paridad i18n**: en/fr/pt-PT al día - 180 keys traducidas (cities,
  pase, trip, disbursement, features, consent). missing 0.

### Fixed

- Preheader de los correos de acceso/verificación: el código OTP
  dice 10 min y el link 15 min (antes el preheader decía 15 para
  ambos).

### Changed

- "Mis pagos" (/productor/pagos) sale del grupo Configuración y entra
  al grupo de módulos del productor (data operativa, no config).

## [1.8.0] - 2026-10-21

### Added

- **Roadmap multipais completo**: feature flags admin (fail-closed),
  city discovery (landings por ciudad, "cerca de mi" geohash), city
  guides editoriales + admin, Mi viaje (trip planner), Pase Social
  (Stripe Billing + creditos + beneficios, flag OFF).
- **Feedback de exito transversal** (todos los roles): ActionNotice
  fijo post-accion, errors silenciosos cubiertos, ConfirmSheet en
  acciones de dinero/destructivas, marcaje de asistencia sin skeleton.
- **Agregar a mi calendario** tras reservar clase (.ics RFC 5545,
  TZID, VALARM).
- **Cuota semanal en Inicio**: GET /classes/my-quota + WeeklyQuotaCard.
- **Cambiar contrasena**: PUT /me/password (verifica actual o
  establece si magic-link-only) + seccion en perfil.
- Onboarding mobile: banners con precedencia de slot, tours con
  anchor visible, action sheets scrolleables.

### Fixed

- Landing: fecha del evento en hora local (city.timezone) - ya no
  corre un dia por TZ del servidor.
- PushOptIn dentro de MeProvider (runtime error).
- Copy de agotamiento: mayuscula + singular/plural correcto.

### Changed

- Seed prod = solo baseline + admin (dataset demo fuera de prod);
  Timba fuera del catalogo (REMOVED_STYLES lo depura de DBs).
- Texto legal EU reescrito sobre patron art.13 RGPD.

## [1.7.0] - 2026-10-21

### Added

- **Fundación multipaís** (`multipais-foundation`, slice 1):
  `Country`/`City` (slug, lat/lng, timezone IANA, geohash) +
  `Venue.cityId` con backfill a Santiago, Chile — ciudad 0 intacta.
- `Event.currency` (ISO-4217, default CLP) y
  `Person.phoneCountryCode`.
- Roadmap: Pase Social con modelo cargo-en-puerta + preventa
  garantizada + créditos; congresos como task 13.

## [1.6.1] - 2026-10-21

### Fixed

- Migración de datos: normaliza `photoUrl` legacy con folder
  duplicado (bug 1.3.1) en `Person`/`Academy`.
- e2e: cubre notificaciones `role.approved`/`role.rejected` en la
  cola de validación (deuda: spec de notifySafe).
- Docs: inventario QA con flujos de soft-delete y engagement de
  serie; roadmap multipaís suma congresos y modelo de créditos
  ClassPass para el Pase Viajero.

## [1.6.0] - 2026-10-20

### Added

- **Engagement de serie** (`series-engagement`): `GET
  /events/series/:id/engagement` devuelve stats verificadas por
  check-in — asistencia promedio, ratio género y leader/follower de
  asistentes únicos — más score agregado de reviews.
- **Reviews verificadas**: `POST /events/series/:id/review` solo para
  asistentes con check-in (upsert por persona×serie). Comentarios
  privados del productor vía `GET /events/series/:id/reviews` —
  anónimos hasta para él (regla de ratings privados).
- UI: card "La serie en números" en `/eventos/[id]` con stats +
  formulario de evaluación; card de comentarios privada en la ficha
  del productor.

## [1.5.2] - 2026-10-20

### Fixed

- Pickers internos (staff, asignaciones, CRM, soporte, búsqueda de
  personas en academias/eventos) ya no ofrecen cuentas desactivadas.

## [1.5.1] - 2026-10-20

### Fixed

- i18n de la zona de peligro/baja lógica: keys quedaron anidadas en
  `users.users.*` por error y el badge mostraba la clave cruda.

## [1.5.0] - 2026-10-20

### Changed

- **Baja de usuarios pasa a soft delete** (`admin-user-soft-delete`):
  `DELETE /admin/users/:id` ahora marca `Person.deletedAt` — el grafo
  (academias, eventos, tickets, roles, historial) queda intacto. Auth
  bloqueada (sesión, password, magic link, OTP), email no liberado,
  fuera de superficies públicas. Nuevo `POST /admin/users/:id/reactivate`
  + badge "Desactivada" y botón Reactivar en el admin.

## [1.4.0] - 2026-10-20

### Changed

- **Niveles de baile** (`dance-levels-catalog`): el set pasa a
  Iniciación/Básico/Intermedio/Avanzado — la misma escala que
  `ClassLevel` de academias. Migración: `principiante → basico`.
- **Email post-registro con password**: ahora dice "Verifica tu correo"
  (copy de verificación) en vez de "Tu acceso a Omnidance" — el usuario
  no había pedido un código de acceso, está confirmando su correo.
- **Checklist del actor** (`PendingRoleCard`): el check `actorData`
  muestra el nombre por rol — "Nombre de academia" / "Nombre de evento"
  en vez del genérico "Datos del actor".

### Fixed

- **Botón "Nueva academia" en todas las páginas**: `AcademyGate` lo
  renderizaba en cada página de la consola. Ahora es una opción
  "＋ Nueva academia" dentro del selector de academia (un solo sitio).

## [1.3.2] - 2026-10-20

### Fixed

- **photoUrl con folder duplicado**: el upload de foto de persona y
  academia guardaba `/api/{people,academies}/photos/{folder}/<uuid>` —
  la ruta no matcheaba y la foto quedaba rota (404 "Cannot GET"). La
  URL pública ahora lleva solo el filename y se agregaron rutas compat
  para los photoUrls ya guardados con el folder.

## [1.3.1] - 2026-10-20

### Fixed

- **Upload de foto sin feedback**: `/perfil/datos` tragaba el error del
  upload (foto >5 MB o formato no soportado → 400/413 silencioso y el
  avatar quedaba roto con la URL anterior). Ahora muestra el error.

## [1.3.0] - 2026-10-20

### Added

- **Notificación al actor al resolver su rol**: aprobar en
  `/admin/perfiles-por-validar` avisa `role.approved` ("Tu rol fue
  aprobado") y rechazar `role.rejected`, in-app + push.
- **Revalidación de roles sin reabrir la app**: `/me` se re-fetchea al
  volver a foreground (visibilitychange en MeProvider) y `PendingRoleCard`
  refresca `/me` al montarse en `/perfil`/home — un rol recién aprobado
  aparece sin cerrar la PWA.

## [1.2.0] - 2026-10-20

### Added

- **Verificación de email para cuentas con password**
  (`fix-actor-verification-flow`): `/auth/register` envía el correo de
  acceso (link+OTP) como verificación de posesión; nuevo
  `POST /auth/resend-verification` (sesión) lo reenvía. Sin esto el
  checklist `emailVerified` de la cola de actores era imposible de
  completar para cuentas con password.
- **Checklist de validación visible al actor**: `GET /me/role-checks`
  devuelve al dueño el mismo checklist que la cola admin; nueva card
  `PendingRoleCard` en `/perfil` y en el home de lente (owner/productor)
  con links por ítem y verificación de email inline (OTP).

### Fixed

- `PATCH /academies/:id/settings` rechazaba el `photoUrl` hosteado
  (`/api/...`) que el propio upload persistía — guardar el perfil tras
  subir foto siempre fallaba con "photoUrl inválido".
- **Uploads en prod**: `apps/api/docker-compose.yml` declara el bind
  mount `/mnt/omnidance/uploads:/app/uploads` + `UPLOADS_DIR` — el
  workflow re-copia el compose a la VM y pisaba el mount manual; los
  archivos podían perderse en `--force-recreate`.

## [1.1.0] - 2026-10-20

### Added

- **Registro por landing con rol usable-invisible** (`role-registration-pipeline`):
  CTAs de `/para-academias` y `/para-productores` llevan a
  `/login?role=ACADEMY_OWNER|PRODUCER`; el primer login crea el
  `PersonRole` PENDING — consola completa pero **invisible al público**
  (directorios, lineups, búsqueda) hasta que el admin aprueba.
  Nueva cola `/admin/perfiles-por-validar` con checklist de la persona.
  Se elimina el estado `SANDBOX` (migrado a `PENDING`).
- **Control de calidad por academia** (`academy-approval-gate`):
  `Academy.reviewStatus` PENDING/APPROVED/REJECTED — la academia solo es
  pública con checklist server-side completo (auto-aprobación en el GET)
  u override admin en la cola; REJECTED la oculta siempre. Card de
  visibilidad con ítems faltantes en el dashboard del owner.
- **Perfil público de academia enriquecido**: mapa con pin arrastrable
  tras geocoding, campo información adicional y foto principal alojada.
- **Fotos alojadas**: `POST /academies/:id/photo` y `POST /me/photo` +
  streams públicos `/api/{academies,people}/photos/<key>` sobre storage
  local (`UPLOADS_DIR`, disco dedicado en prod).
- **i18n multi-locale completo**: es-CL default + en/fr/pt-PT con
  paridad total (3823 keys/locale), `Person.language` + selector en
  `/perfil/datos` que persiste entre dispositivos, formatters por
  locale, alternates SEO por idioma.
- **Consola admin**: nav drawer-only, facturación (`/admin/finanzas`
  transacciones + suscripciones), fichas, snapshots de segmento,
  `/admin/usuarios` paginado, CRUD de catálogos en páginas dedicadas,
  `/academia/nueva` para owners multi-academia.
- **Consola de analítica** (`analytics-query-engine`): `/analitica` con
  catálogo por lente, filtros data-driven, paginación `page/pageSize`
  en `POST /query/run` y consultas guardadas.
- **Tests**: spec de `academy-review.ts` (checklist + auto-promoción).

### Changed

- `/pro` conserva solo el intent contacto; las landings `/para-*`
  invitan a registro directo (sin lead form).
- Preventa por academias (spec academy-presale-commission) queda
  verificada E2E en dev.

## [1.0.3] - 2026-10-18

### Fixed

- **`/admin/datos` RangeError "Invalid time value"**: al cambiar de
  entidad el render intermedio formateaba rows de la entidad anterior
  con el `renderRow` de la nueva. El resultado ahora viaja etiquetado
  con su entidad y solo renderiza si coincide.
- **Proxy /api en dev**: `API_PROXY_TARGET` por defecto `localhost:4000`
  resolvía a veces `::1` en Windows mientras el API escucha solo IPv4 →
  `ECONNREFUSED` intermitente (~1 de N requests, incluido login).
  Default ahora `127.0.0.1`.
- Orden de hooks en `BottomNav` (reglas de hooks violadas).

### Added

- **Pirámide QA**: eslint flat config web (0 errores), Vitest +
  testing-library para componentes, Playwright e2e (chromium + mobile
  WebKit) con setup de sesión por rol y 4 specs smoke (descubrimiento,
  checkout stub, entity-switch admin, lifecycle productor). Workflow
  `qa.yml` (typecheck + lint + unit en push/PR). Inventario vivo de
  flujos en `docs/qa-flows-inventory.md`.

## [1.0.2] - 2026-10-17

### Fixed

- Selects/inputs de fecha (pares "desde/hasta", "inicio/termino") se
  solapaban en grillas y flex: `input[type=date|datetime-local]`
  tiene min-content intrinseco (~160-190px). Regla global
  `min-width: 0` en `globals.css` cubre FilterBar, form de evento del
  productor, enrollment, finanzas admin y toda la app.

## [1.0.1] - 2026-10-16

### Fixed

- **Crash "Application error" en `/inicio` (lente academia)**:
  `formatDelta` (KPIs del dashboard) llamaba `useNumFmt` dentro de un
  helper condicional → violación de reglas de hooks (React #310).
  Reproducido en prod con la cuenta muvet.
- Hidratación: `useViewMode`/`useActiveRole`/`useSidebarState` leían
  `localStorage` en render → mismatch SSR/cliente (React #418); ahora
  `useSyncExternalStore` con server snapshot (patrón de `theme.ts`).
- Misma clase de bug corregida en `relativeTime` (/notificaciones) y en
  el skeleton de `/perfil`.

## [1.0.0] - 2026-10-16

Primer release mayor: plataforma multi-locale, CRM completo para
productores y academias, y stack actualizado con auditoría de
seguridad en cero.

### Added

- **i18n multi-locale completo**: `es-CL` default + `en` + `fr` +
  `pt-PT`. Todo el árbol bajo `app/[locale]/`, middleware next-intl
  (prefijo → cookie → Accept-Language), catálogos con paridad exacta
  (3414 keys por locale), formatters de fecha/número por locale.
- **Preferencia de idioma persistida**: `Person.language` + `PATCH
  /me`, selector en `/perfil/datos`; la preferencia viaja entre
  dispositivos.
- **SEO internacional**: canonical auto-referencial + `hreflang` por
  locale con `x-default`, `og:image` por locale, sitemap con
  alternates.
- **CRM avanzado**: sección propia en drawer/sidebar con personas,
  segmentos dinámicos, operación de campañas con canales, y triggers
  con alcance por actor.
- **Scores por componentes**: score de alumno (academy) y de asistente
  (producer) descompuestos, con consola admin.
- **Tours de onboarding** para los 7 roles, con cobertura de las
  consolas nuevas.
- Versión de la app visible al pie del perfil.

### Changed

- **Stack**: Next 15.5 + React 19 + NestJS 11 — `pnpm audit` en cero.
- Landings estáticas; gate anónimo resuelto en middleware; locales
  inválidos responden 404.
- Item de analítica renombrado a "Consultas" en la navegación.
- Vocabulario propio: "crew" → "tu gente" (es-CL) / "your people" (en)
  en tours y spec.
- CRM sin tabs internas: la navegación de secciones vive en el sidebar;
  auditoría UX/a11y de layout, estados y touch targets.

### Fixed

- Hardening tras auditoría OWASP.
- Confirmaciones destructivas unificadas con `ConfirmSheet` en todo el
  repo.
- `opengraph-image`/`twitter-image` bajo `[locale]` con `metadataBase`
  heredado — warnings de metadata a cero.
- Hallazgos de auditoría Lighthouse (a11y + SEO + i18n).
- Provider raíz con `commonMessages` (Spinner/PageLoadingHost).
- Selector de actor del CRM oculto cuando hay uno solo.

### Removed

- Código muerto y dependencias sin uso.

### Datos

- Migraciones: `relationship_score_breakdown`, `crm_dynamic_segments`,
  `campaign_scheduled_at`, `person_language`.

## [0.8.5] - 2026-10-14

### Added

- **OTP de 6 dígitos junto al magic link**: el correo de login incluye
  un código para que la PWA instalada verifique dentro de su propio
  origen, sin depender de que el link abra el browser externo.
- **Preventa por academias** (canal atribuido): las academias emiten
  códigos de preventa de entradas; la venta queda atribuida a la
  academia como deuda productor→academia, sin payout de plataforma.
  Emisión de códigos serializada con advisory lock para evitar
  colisiones bajo concurrencia.
- **Nómina de colaboradores del productor**: mantenedor con alta por
  nombre o correo (con invitación y rol `DANCER`), pool de staff
  reutilizable y sección de eventos dentro del grupo del módulo.
- **Consola de productor - ventas y reservas**: comprador y
  referencia en ventas, pagos pendientes primero (viejos → recientes),
  filtros por estado, paginación 5/10/todos con scroll interno,
  reservas de mesa compactas con controles expandibles y tasa efectiva
  de comisión inline en el header del evento.
- **Reservas**: chip "por confirmar" y notificación de cancelación
  con feedback táctil; header completo clickeable con chevron.
- **Jorge Camacho al seed dev** (`jokcar12345@gmail.com`, `DANCER`,
  magic link): alumno real de Erick Baez con plan de 2 clases/semana
  vigente y pagado (PaymentClaim APPROVED + Payment MANUAL, misma forma
  que `claims.approve`), todas las clases de la academia reservadas con
  asistencia en las pasadas, check-ins en 5 sociales, 3 entradas (2
  usadas + próxima Bachatamanía), 7 bailes con ratings, estilos
  autodeclarados y membresía del clique (badges/puntos/rachas se
  computan solos en el bloque de gamificación).
- **`apps/api/prisma/seed-jorge-camacho.sql`**: equivalente SQL directo,
  idempotente y transaccional, para insertar a Jorge en una DB ya
  sembrada sin correr todo el seed.
- README documenta las cuentas reales del piloto (Gabriel, Mónica,
  María, Eduardo, Jorge).
- Favicon multi-size (anillo morado).

### Changed

- **Precio SaaS de academias**: mensual base × meses facturados del
  ciclo, en vez de tarifa plana por ciclo.

### Fixed

- **Checkout de orden $0**: responde `paid=true` inmediato sin redirect
  de retorno (órdenes gratis no debían pasar por el flujo de pasarela).
- **Sidebar**: grupo de tabs sin header duplicado del rol; labels sin
  wrap durante la transición de ancho.

## [0.8.4] - 2026-10-11

### Fixed

- **Compartir por WhatsApp llevaba `localhost:3000`**:
  `NEXT_PUBLIC_WEB_URL` estaba documentada como variable del UI de
  Netlify pero nunca se seteó, así que `metadataBase` caía al fallback
  y todos los `canonical`/`og:url` salían como `http://localhost:3000`
  — lo que WhatsApp/crawlers leen al compartir `/para-academias` u
  otras páginas. La var ahora va pintada en `[build.environment]` de
  `netlify.toml` (las `NEXT_PUBLIC_*` se inlinean en build, a
  diferencia del runtime serverless) y nuevo helper
  `lib/site-url.ts` resuelve con fallback a `URL` (var que Netlify
  inyecta en todo build) antes de caer a localhost. Se corrigen de
  paso `sitemap.xml`, `robots.txt` y el JSON-LD de la landing, que
  también emitían localhost.

## [0.8.3] - 2026-10-10

### Fixed

- **Lente INSTRUCTOR sin privilegios heredados** (spec
  academies/staff-roles): `/academia/alumnos` y la ficha
  `/academia/alumnos/[personId]` resolvían permisos por roles crudos y
  no por la lente activa, así que una persona con ADMIN/owner/staff
  navegando como instructor veía KPIs, Insights (incl. "quienes pagaron
  más este mes"), importación y el editor de estado/fecha del
  enrollment. Ahora la lente INSTRUCTOR degrada a vista de instructor
  puro — su única mutación es marcar asistencia en clases de su
  plantel.
- **Fuga de montos por API**: `GET /academies/:id/students/insights`
  devolvía `topPayersMonth` a cualquier `requireManage`. Ahora exige la
  capacidad `payments` para computarlo — el resto recibe `[]` y ni
  siquiera se consultan los cobros.
- **Filtros desde/hasta desbordados**: el `input[type=date]` impone un
  min-content (~160px) que reventaba la celda del grid y el campo
  cubría a su vecino en móvil. `min-w-0` en labels e inputs del
  `FilterBar` compartido — aplica a todas las consolas (instructor,
  owner, productor, admin, analítica).

### Added

- **Seed - transferencia universal**: toda academia sin método
  TRANSFER recibe uno activo con datos de cuenta generados (banco,
  tipo, número, titular, RUT, email) y todo `Person` con rol PRODUCER
  aprobado recibe `ProducerPaymentMethod` TRANSFER — sus eventos lo
  ofrecen en checkout. Idempotente: métodos existentes solo se
  reactivan si estaban apagados, sin pisar `details` reales.

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
