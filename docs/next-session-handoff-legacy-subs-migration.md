# Handoff: legacy-subs-byo-migration + admin-user-payment-methods + landings costTable + tours

Sesión 2026-11-10 (tarde). Cuatro tracks en paralelo (3 subagentes +
orquestador). Todo commiteado en `dev`, working tree limpio.

## Commits

- `2cc3d181` feat(payments): migración subs legacy our-Flow → BYO +
  seed MP TEST. ARCHIVADO (`2026-11-10-legacy-subs-byo-migration`,
  delta aplicado a `payments/subscriptions`).
- `65a44d3c` feat(admin): métodos de pago de academias en ficha de
  usuario. ARCHIVADO (`2026-11-10-admin-user-payment-methods`,
  delta a `admin`).
- `52245837` feat(web): tabla costo automatización en landings +
  docs BYO/MP (omni-dance.md, architecture, flows).
- `dc81a99c` fix(i18n): step desfasado tour academy-owner.

## legacy-subs-byo-migration (decisión del owner)

"Nuestro Flow queda solo para cosas de la plataforma (suscripciones)".
Implementado: `POST /admin/subscriptions/migrate-legacy`
`{academyId?, dryRun?}` (dryRun default true). Barre
MembershipSubscription ACTIVE|FAILED_CARD + CARD + gatewayAccountId
null + flowSubscriptionId non-null → cancel remoto `at_period_end` en
Flow de plataforma + `CANCEL_PENDING` local + ledger actor `system`
razón `legacy_byo_migration` + notif `membership.subscription_migration`
alumno + `academy.legacy_subs_migrated` resumen al owner (ramifica si
tiene BYO ACTIVE). Idempotente, fallo remoto por ítem sin abortar,
audit `LEGACY_SUBS_MIGRATE`. PlatformSubscription fuera del barrido.

Smoke verificado: dry-run 200 scanned=22 en dev; scoped a Tumbao el
cancel remoto golpeó Flow sandbox real → `sus_enrich_* not found`
(los flowSubscriptionId del seed son ficticios) → outcome `failed`,
sub intacta. Ruta de fallo por ítem OK end-to-end. **La ejecución
global en prod queda para ops: dry-run primero.**

Seed dev: `seed-dev.ts` siembra `ActorGatewayAccount` MERCADOPAGO
ACTIVE para Academia Tumbao con `MP_SMOKE_ACCESS_TOKEN` (idempotente
por keyMask; sin env no siembra; keyMask distinto = rota y recrea).
Verificado: recorrer seed con cuenta DISABLED la recreó ACTIVE.

## admin-user-payment-methods

`GET /admin/users/:personId/payment-methods` (admin.access) → por cada
academia del owner: gatewayAccounts (provider, keyMask, status,
lastError, verifiedAt, webhookUrl; nunca credentialsEnc) +
manualMethods. Sección "Métodos de pago" en
`/admin/usuarios/[personId]` (una card por academia, se oculta sin
academias). Smoke real verificado contra :4100 por el implementador.

## Landings + docs

`costTable` nueva sección en `Landing.tsx` (tras PricingSection):
academia (comprobante $0 vs tu pasarela $119+gateway por $10.000) y
productor ($914 gestionada / $595 propios / $0 puerta; nota tiers).
Framing "costo de automatizar el trabajo manual" (no "cuánto te
queda"). Números: academy_fee.net_pct 1,0% → $119 bruto c/IVA;
fees.managed_allin_pct 9,14% → $914; ownMethod 5,95% → $595.
i18n paridad 4827 keys 0 drift. Render verificado por curl
(`/para-academias` 200, contiene la tabla).

## Tours

Solo `academiaOwner.s2` estaba desfasado (checklist ya no pide medio
de pago): corregido en los 4 catálogos. Ninguna página refactorizada
monta tour ni tiene anchors rotos.

## Hallazgo pendiente: import masivo ≠ invitación

Pregunta del owner respondida: el import crea `Enrollment.ACTIVE`
SIEMPRE; `planId:null` = cuota ILIMITADA (reserva gratis, cuenta en
dashboard/KPIs/tier limit/sociales internos/videos). La plata no se
falsea (solo Payments/claims reales). Brechas: re-import sin plan
borra planId; findFirst sin filtro status; pagado_hasta sin plan sin
reminders. El modelo del owner YA existe como `AcademyInvite`
individual (sin enrollment hasta compra). **Decisión pendiente**:
(a) enrollment INACTIVE cuando fila sin plan (claim/settle ya
re-activan), o (b) patrón AcademyInvite en bulk. Análisis completo
en el reporte de la sesión (evidencia con refs).

## Operativo

- API :4000 corre `node dist/main.js` build nuevo (PID ~25590, shell
  `7f3649`); web dev sano en :3000 (el :3001 duplicado se mató);
  Postgres/Redis healthy. Dev server :3000 ya no es zombie.
- Lock stale de openspec archive reapareció (mismo issue que sesión
  anterior): `rm openspec/changes/archive/.openspec-archive.lock`
  antes de archivar.
- `MP_SMOKE_ACCESS_TOKEN`/`MP_SMOKE_PUBLIC_KEY` siguen en
  `apps/api/.env`; devtunnel API_URL sigue caído (webhooks MP reales
  necesitan túnel o polling).

## Pendientes generales

- Decisión del owner: modelo del import (a/b arriba).
- Ejecutar migración legacy en prod cuando toque (dry-run → scoped →
  global).
- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Smoke manual BYO/MP con humano: alta sub por registerUrl/init_point
  hosted → retorno → ACTIVE (script `smoke-mp-subscription.cjs` usa
  :4001, ajustar a :4000).
