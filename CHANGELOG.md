# Changelog

Todos los cambios notables del proyecto se documentan aquí, siguiendo
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y SemVer.

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

[0.1.0]: https://github.com/EduardoSalasG/omnidance/releases/tag/v0.1.0
