# Handoff; taller único + cancel por instancia + fixes ficha horario

**Rama**: `dev` · **Commits**: `10f7a486` (fixes) + `c6484592` (feature)
**Change OpenSpec**: `workshop-one-off-class` archivado → spec canónica
`openspec/specs/academies/class-series` actualizada (+3 requirements).

## Qué quedó hecho

### Fixes (commit 10f7a486)
- Keys de roster mal anidadas: `instructor.*` → `academySeries.*` ×4
  locales (label mostraba key cruda).
- Ficha horario 404: usaba `params.id` (seriesId) como academyId; ahora
  `academy.id` del AcademyGate + key remount.
- `updateSlot` propagaba plantel solo al slot: ahora reescribe
  `ClassInstructor` + `Class.instructorId` de clases futuras vigentes.
- Cambio de `weekday`: cancela clases del día viejo (refund bookings) y
  rematerializa el día nuevo (antes quedaban huérfanas).
- Drift spec reparado: `class.count` en fake + expectativa soft-delete
  de `deleteSlot` + test hard delete sin clases.

### Feature taller + cancel instancia (commit c6484592)
- Migración `20261029150000_slot_oneoff_class_cancelled_at`:
  `ClassSlot.oneOffDate`, `Class.cancelledAt` (ya aplicada en dev).
- Slots con `date` (YYYY-MM-DD) materializan solo esa fecha; `weekday`
  queda derivado informativo. `date` > `weekday` en payload.
- Reprogramar fecha = misma cascada que cambio de weekday (cancel
  stale + refund + materialize + sync plantel). `date` inválida o
  pasada → 400 (create, addSlots y PATCH).
- `POST /academies/:id/classes/:classId/cancel`: baja individual
  (cancelled+cancelledAt), reservas refunded, idempotente, 404 ajena/
  pasada. `cancelledAt` distingue baja manual de cascada: materialize
  solo revive `cancelledAt IS NULL`.
- Web: selector Serie semanal|Taller en `series-form` (radio chips),
  fila taller con fecha + Badge, cancel por instancia en "Próximas"
  (ConfirmSheet), ficha horario con `input[type=date]` en taller.
- i18n ×4: keys nuevas bajo `academySeries` (kindLabel, kindRecurring,
  kindOneOff, slotsOneOff, dateLabel, workshopBadge, cancelClass,
  cancelClassDesc).

## Verificación (G3)

- `class-series.controller.spec.ts` 17/17 + `materialize.spec.ts` 7/7
- `tsc --noEmit` api y web: limpio
- `i18n-audit` ALL_KEYS_OK · `i18n-parity` missing 0
- Suite academies: 286/288 (2 fallos `calendarIcs` PRE-EXISTENTES:
  spec espera `SUMMARY:X; Academia`, código emite ` - `; drift del
  barrido de puntuación, pendiente decidir cuál es el formato correcto)

## Notas / pendientes

- **Smoke manual hecho (2026-10-29)**: owner creó academia + datos +
  publicación + serie + horario + taller; dancer se inscribió al plan y
  agendó clase. Quedan por probar manualmente: reprogramar fecha de
  taller (cascada refund+rematerialize) y cancel por instancia en serie
  recurrente (feriado).
- `addSlots` en ficha de serie solo ofrece weekday (un taller puede
  recibir slot recurrente; modelo lo permite, UI no ofrece fecha ahí).
- Sin "descancelar" instancia ni traspaso de reservas al reprogramar
  (documentado fuera de scope en el change archivado).
- Mini-form agregar horario no soporta `date` (decisión consciente).

## TRABAJO EN CURSO (retomar aquí)

**Mover cancel por instancia del listado a la ficha de clase** (pedido
del usuario: "el botón debe estar dentro del detalle, no en el listado").

- QUITAR de `apps/web/src/app/[locale]/(app)/academia/series/[id]/page.tsx`:
  fn `cancelClass` (~l.318), botón X por fila (~l.600), `confirm.kind==="class"`
  del state y sus entradas en ConfirmSheet (~l.690-708), comentario l.110.
- AGREGAR a `apps/web/src/app/[locale]/(app)/academia/clases/[id]/page.tsx`
  (componente `RosterDetail`): zona roja Card `border-red-500/30` al pie +
  ConfirmSheet → `POST /academies/{academyId}/classes/{classId}/cancel`.
  AcademyId: revisar type `ClassRoster` en `components/academy/shared.ts`
  (roster.class probablemente trae academyId; si no, agregar al endpoint
  GET /classes/:id/roster). Labels: reuse `useTranslations("academySeries")`
  → `cancelClass`/`cancelClassDesc` (keys ya existen ×4). Mostrar solo si
  la clase no está cancelada y es futura; gatear por cap manage (revisar
  si ClassRoster expone canManage; si solo canMark=instructor, el POST
  igual falla por cap schedule → ocultar o dejar que 403 falle limpio).
- Verificar: `pnpm exec tsc --noEmit` web + `i18n-audit`/parity; commit.

**QA del usuario ya hecho**: cancel instancia borró la del 4/11 OK;
reprogramación de taller al 8 funcionó (cascada OK).

### Hallazgos para el move (ya investigado)

- `GET /classes/:id/roster` (classes.controller.ts ~l.1231): `class`
  ya devuelve `academyId` (l.1328). Falta: `cls.cancelled` en select y
  flag `canCancel` = try/catch de `requireCapabilityWrite(academyId,
  person, "schedule","classes")` (academy-access.service.ts l.206).
- Web `ClassRoster` (shared.ts l.407): agregar `academyId: string`,
  `cancelled: boolean`, `canCancel: boolean` en `class`/top.
- `RosterDetail` (academia/clases/[id]/page.tsx): zona roja cuando
  `roster.canCancel && !roster.class.cancelled`; tras cancel → `load()`
  del parent (pasar callback) o `location.reload()`. i18n:
  `useTranslations("academySeries")` → cancelClass/cancelClassDesc ya
  existen.

## CIERRE (2026-10-29)

Todo lo de "TRABAJO EN CURSO" quedó hecho y commiteado:

- `990d99da` refactor: cancel por instancia vive en ficha de clase
  (zona roja, roster expone canCancel+cancelled+academyId); quitado
  del listado de próximas de la serie.
- `3e246759` + `24b323a2`: notificación `class.booking.released` al
  alumno en las 4 cascadas (cancel instancia, delete slot,
  reprogramar, desactivar serie). Helper `releaseBookings` (in-tx,
  idempotente) + `notifyReleasedBookings` (post-commit, notifySafe:
  in-app + WS + web push). 19/19 spec, tsc limpio, change archivado.
- `58e7601a`: card dancer marca taller (oneOff → título serie + chip).
- `88536e7c`, `1fbec322`: botón "Crear" y éxito contextual en el form.

Pendiente conocido: 2 tests `calendarIcs` fallan por drift de formato
(`;` vs ` - ` en SUMMARY) - decidir formato correcto y alinear.

## EN CURSO: verificación Playwright de unified-action-notice

Stack vivo (pnpm dev en bg). Commits ya hechos: `4c852be1`
(migración 3 fases, 114 archivos) + `25c1ea02` (archivo change).
Resta: smoke e2e del toast + commit final.

Login e2e: password `omnidance123`, emails `rol@omnidance.dev`
(dancer|carlos=producer|muvet=academy|admin|staff|soporte); storageState
en `e2e/.auth/<rol>.json` via `e2e/auth.setup.ts` (proyecto "setup").
`playwright.config.ts` testDir ./e2e, baseURL :3000, locale es-CL.

Toast a verificar: `[role="status"]`/`[role="alert"]` fijo bottom
(ActionNotice). Global: showActionNotice sobrevive navegación.

## EN CURSO: Flow para pagos a Omnidance (usuario lo definió)

Decisión del usuario: Flow.cl = pasarela para TODO lo que se cobra
hacia la plataforma (PLATFORM_SUB: suscripciones academia + producer Pro).
Existe `apps/api/src/payments/infrastructure/flow.gateway.ts` + spec.
Revisar qué implementa (create/webhook/return) y qué falta por definir:
credenciales env, suscripción nativa Flow vs cargos mensuales,
webhook firmado, return/cancel urls, mapeo a PLATFORM_SUB, CLP-only
(tensión multipaís). Pagos registrados: PLATFORM_SUB 4 PAID (¿por qué
canal hoy? claims manual probablemente).

## EN CURSO: 2 frentes abiertos

### A) Flow para TODO cobro a Omnidance (confirmado)
Usuario: "utilizaremos flow para todo lo relacionado a pagos a
omnidance" → scope TOTAL (suscripciones PLATFORM_SUB + cobros sueltos
a academias). Flow ya integrado para PLATFORM_SUB
(flow.gateway.ts + platform-subscriptions.service.ts). Falta revisar
param `payments.subscription_gateway` en /admin, credenciales env
(FLOW_API_KEY/SECRET/BASE_URL), claims manuales a academias por Flow
(payment.create puntual), CLP-only vs multipaís. Sin implementar aún.

### B) BUG checkout: botón pagar sube al card de método
File: apps/web/src/app/[locale]/(app)/eventos/[id]/checkout/checkout-client.tsx
Síntoma: al elegir medio de pago ≠ flow (Tarjeta/transferencia/Webpay),
el botón pagar aparece dentro del card "Con qué medio pagas" en vez de
al final. Investigado: OwnMethodPicker Card ~l.840-847; phase "manual"
renderiza OwnMethodClaim ~l.965 (components/checkout/own-method-claim.tsx,
botón submit l.165); submit principal l.986-992 se oculta cuando
phase.kind==="manual". Revisar si OwnMethodPicker/Claim renderiza su
botón dentro del card del método o si la estructura del form mueve el
botón; el requisito: botón pagar SIEMPRE al final del checkout.
Verificar con tsc + playwright notice-smoke pattern si hace falta.

## UPDATE: bug checkout resuelto (commit bfe98465)

`OwnMethodClaim` se renderizaba antes del botón pagar (a media altura
del form en `/eventos/[id]/checkout`); ahora va al FINAL, después del
submit. tsc limpio.

## PENDIENTE: Flow para todo cobro a Omnidance

Confirmado por el usuario: scope TOTAL. Flow ya cubre PLATFORM_SUB
(flow.gateway.ts + platform-subscriptions.service.ts). Falta revisar/
implementar: (1) param `payments.subscription_gateway` = flow en
/admin; (2) credenciales env FLOW_API_KEY/SECRET/BASE_URL + sandbox;
(3) cobros sueltos a academias vía Flow (payment.create puntual, hoy
claims manuales por comprobante); (4) CLP-only vs multipaís.

## EN CURSO: claim checkout - toast + redirect + bug botón atrás

Pedido: tras adjuntar comprobante → showActionNotice (estado) +
redirect a la página anterior (ficha evento o academia). Bug: botón
atrás del navegador "rehizo" acciones (suscripción → pago único).

Archivo: components/checkout/own-method-claim.tsx (submit ~l.78-105,
msg inline l.157-164, claimSent key ya existe). Callers:
checkout-client.tsx (OwnMethodClaim al final tras fix bfe98465,
onPaid→onClaimPaid) y series-pass-cta.tsx (~l.260). Plan: prop
`returnHref` en OwnMethodClaim; tras submit OK → showActionNotice +
router.replace(returnHref) (replace para que atrás no vuelva al
checkout con estado stale). i18n: claimSent ya existe.

## EN CURSO: bug real del botón pagar en checkout academia

El botón que sube es el de `manual-pay-panel.tsx`
(`apps/web/src/app/[locale]/(app)/academias/[id]/checkout/manual-pay-panel.tsx`,
checkout de SUSCRIPCIÓN a academia - el copy "¿Con qué medio pagas?" es
`academyPay.chooseMethod`, NO el OwnMethodPicker de eventos).

Estructura (415 líneas): todo el panel es UNA Card titulada
chooseMethod (l.222). Dentro:
- `!claim` (l.332-402): radiogroup pasarela+métodos propios; al elegir
  método aparece Button "continueMethod" (l.389-401) DENTRO del card.
- `claim?.status==="AWAITING"` (l.237-328): instrucciones + upload +
  Button sendReceipt (l.310) + cancelIntent.
- `claim?.status==="PENDING"` (l.227-234): aviso en cola.

Requisito del usuario: el botón de acción (continuar/pagar) debe quedar
SIEMPRE al final del checkout, no dentro del card de método. Verificar
qué renderiza la page padre (academias/[id]/checkout/page.tsx u otro
componente que envuelve ManualPayPanel + el CTA de pasarela) y decidir:
sacar el CTA del card (renderizar el botón fuera/abajo del panel) o
mover la rama AWAITING al final. tsc + commit. Ya verificado: tsc web
limpio en commits previos 786cd0b0 y bfe98465 (esos fueron eventos,
NO este archivo).
