# Changelog

Todos los cambios notables del proyecto se documentan aquí, siguiendo
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y SemVer.

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
