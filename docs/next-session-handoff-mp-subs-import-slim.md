# Handoff: mercadopago-subscriptions + academy-import-slim-fields + gateway-in-methods-form EN CURSO

Sesión 2026-11-10 (tarde-noche). Tres tracks en background con
subagentes implementadores; este handoff se escribe ANTES de su
integración por margen de contexto.

## Estado de los commits previos (ya en dev)

- `90576d25` fix: take en runs de jobs + fixtures gap-crm mes civil +
  paridad i18n en/fr/pt-PT (198 keys) + flake dancer-eventos mobile.
- `0502a335` feat: `academy-card-subs-byo` IMPLEMENTADO Y ARCHIVADO
  (subs CARD por pasarela propia; providerFor; take en renovaciones).
- `90f24156` docs: handoff anterior.
- `academy-byo-collections` ARCHIVADO por decisión del owner
  (`openspec archive academy-byo-collections --yes`, lock stale
  limpiado antes). Delta aplicado a `openspec/specs/payments/spec.md`.
  El archivo del change quedó sin commitear todavía? -> VERIFICAR
  `git status` al retomar: el archive mueve el dir a
  `openspec/changes/archive/2026-11-10-academy-byo-collections/` y
  modifica la spec canónica - si no está commiteado, hacerlo.

## Track 1 — mercadopago-subscriptions (subagent `dc39631a`)

Change creado y validado (openspec/changes/mercadopago-subscriptions,
3/3 verde). Decisiones de diseño ya tomadas (leer design.md):

- Contrato MP `preapproval` WITHOUT-PLAN PENDING: `init_point` hosted
  de MP = registerUrl; `external_reference = subId`; back_url GET con
  verificación de status remoto real antes de activar.
- `getCustomer.hasCard` = siempre false (cada preapproval exige
  autorización hosted).
- Webhooks MP son APP-LEVEL (panel del vendedor, topics
  `subscription_preapproval`/`subscription_authorized_payment`); la
  academia pega su `webhookUrl?account=` en el panel. reconcileAll
  cubre si no configura.
- Credenciales TEST del owner en `apps/api/.env` (gitignored):
  `MP_SMOKE_ACCESS_TOKEN` y `MP_SMOKE_PUBLIC_KEY`. Academia demo sin
  BYO para el alta: Academia Tumbao `cmua3gao7003buas59g9fyxn5`
  (plan MONTHLY "Normal" $40.000 `cmua3garn003puas5a917tpia`).
- El smoke del init_point requiere humano; lo automatizable llega
  hasta preapproval pending creado en MP.

Al terminar: revisar diff, suite verde, archivar el change, commitear
feat + docs, actualizar este apartado.

## Track 2 — academy-import-slim-fields CERRADO

Implementado, verificado (135 archivos/2587 tests, e2e 9/9 con
spec .xlsx real), migracion 20261128000000 aplicada a dev, ARCHIVADO
(delta ~3 en academies/bulk-import) y commiteado (codigo en e521213f,
archive en 4ae845b5).

Change creado y validado (openspec/changes/academy-import-slim-fields).
Scope: import de alumnos exige solo `email`+`nombre`; `plan` pasa a
opcional (Enrollment.planId ya es nullable); nuevas opcionales
`rut`/`dni`/`documento` → `Person.nationalId` (campo NUEVO, migración
versionada requerida, sin unique), `fecha_nacimiento` → birthDate,
`sexo` → Gender (M/F/OTHER + alias); archivo `.xls`/`.xlsx` además de
`.csv` (dep `xlsx` pineada ≥7 días). Front `/academia/configuracion/
importar` actualiza template+copy. NO tocar import de horario.

Al terminar: revisar diff, verificar migración aplicada a dev, suite
+ typecheck verdes, archivar change, commitear.

## Track 3 — gateway-in-methods-form (subagent `c50f9711`)

Change creado y validado (4/4 verde). UX pedida por el owner: la alta
de pasarela BYO va DENTRO del flujo "Agregar método" de métodos de
pago (no sección aparte). `/nuevo` elige tipo manual vs pasarela;
cuenta configurada aparece como card en la misma lista (badge, mask,
webhookUrl); se elimina `AcademyGatewaySection`/
`ProducerGatewaySection` de las páginas. Espejo en
`/productor/medios-pago`. Sin cambios de API.

Al terminar: revisar diff, typecheck/lint/tests web, archivar el
change, commitear.

## Operativo

- API :4000 corre `node dist/main.js` (shell `1e6af6`, build con
  card-subs-byo); web dev limpio en :3000 (shell `3f2c2c`); puede
  quedar otro dev en :3001. Postgres/Redis healthy.
- Verificado vivo en la sesión: sub CARD dancer→Muvet STUB BYO →
  ACTIVE, Payment 30.000 con academyTakeClp=300 devengado en
  statement 2026-11; Tumbao sin cuenta → `academy.no_gateway` +
  TRANSFER OK; `runs?take=5` → 200 (antes 400).
- `.env` raíz: `API_URL` apunta a devtunnel `hvr4lkk3-4000...` que
  estaba caído (000) - para webhooks MP reales levantar túnel o
  depender de polling.

## Pendientes generales

- Integración de los 2 tracks (arriba).
- multipais-foundation tasks 10/11/13 (slices grandes).
- Migración de subs legacy our-Flow → BYO: decisión operativa.
