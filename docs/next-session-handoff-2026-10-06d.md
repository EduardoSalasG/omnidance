# Handoff — release v0.3.0 promovido a prod (2026-10-06d)

## Estado: `main` y `dev` sincronizados en `951dbc8` (tag `v0.3.0`)

Release MINOR v0.3.0 — 39 commits desde v0.2.1. Promoción fast-forward
`dev → main`, deploy verificado en producción.

### Evidencia de release

- Tag anotado `v0.3.0` en `951dbc8cfdd55a956542f2379fabd1c12f2eeefa`
  (commit exacto de `main` desplegado — objetivo de rollback).
- GitHub Actions `Deploy omnidance API` run `37547321800`: **success
  en 5m46s** — tests, build, imagen GHCR, deploy Oracle VM y verify de
  nginx todos verdes. Las migraciones nuevas (claims AWAITING,
  mail campaigns, opt-out, billing, wallet, etc.) corrieron en el
  contenedor de migrate del deploy.
- Health checks post-deploy:
  - `GET https://api.omnidance.eduardosalasg.dev/api/health` → `ok`
  - `GET /api/me` sin sesión → `401`
  - `GET /api/mail/unsubscribe?p=x&t=y` → `400` (endpoint nuevo vivo,
    firma inválida rechazada)
  - `https://omnidance.netlify.app` → `200`
- `dev` mergeado de vuelta desde `main` (ff, mismo SHA) — no quedarse
  parado en `main`.

### Qué salió en v0.3.0 (ver CHANGELOG.md)

- Consola admin: `/admin/jobs` (ScheduledJob+JobRun, claim atómico
  multi-instancia, catch-up, America/Santiago) y `/admin/campanas`
  (audiencias con contexto, variables `{{var}}`, dedup por ciclo,
  opt-out firmado, CLAIMS_PENDING para owners con comprobantes).
- Pagos directos: medios propios de academia (en checkout, claim
  AWAITING persistente, comprobante) y de productor (OWN_METHOD +
  OWN_GATEWAY con credenciales cifradas).
- Puertos multi-proveedor: GatewayRegistry + webhook `:provider`,
  adaptadores MercadoPago y Fintoc, SubscriptionProvider normalizado.
- Comisión todo incluido al productor; consola `/admin/finanzas` +
  BillingDocument.
- Check-in offline (IndexedDB + sync batch), push day-of + Google
  Wallet, bulk-import CSV, staff por capacidad, renewal reminders,
  insights de retención, preventa cutoff, landings pro separadas.

## Pendientes (no bloquean)

- **Internacionalización**: solo `es-CL`; strings ya catalogados en
  next-intl. Falta decidir locales, traducir parts y auditar strings
  hardcodeados/datos seed.
- Credenciales sin ejercitar en prod: `GOOGLE_WALLET_*`, `FINTOC_*`
  (mocks OK). `RESEND_API_KEY` y `VAPID_*` ya están cargados —
  test-send real desde `/admin/campanas` es la prueba natural.
- Flake conocido: `test/gap-crm.e2e.spec.ts` puede fallar en teardown
  si el dev server corre contra la misma DB (JobsRunner crea
  Notification sobre persona de test). Aislar DB de test o mockear el
  runner en e2e si se repite.
- QA visual en prod de `/admin/jobs`, `/admin/campanas` y checkout
  manual (ya QA'd en local).
- Job de sistema `academies.renewal_reminders` sigue activo: si se
  crean campañas equivalentes, pausarlo desde `/admin/jobs`.
