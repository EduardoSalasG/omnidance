# Tasks — platform-polish-gaps

## Schema

- [x] `Person.mailOptOutAt DateTime?`
- [x] `MailCampaignRecipient.dedupKey String @default("")` + unique
  `(runId, personId, dedupKey)` (migra datos: dedupKey='' a existentes)
- [x] Migración `platform_polish_gaps`

## Opt-out

- [x] `GET /api/mail/unsubscribe?p=&t=` público — HMAC-SHA256(personId,
  JWT_SECRET) hex[0:32], HTML de confirmación, firma inválida → 400
- [x] Footer automático con link en sendRun y testSend
- [x] Filtrar `mailOptOutAt: null` en TODAS las resoluciones + re-chequeo
  por destinatario en el loop

## Recipient por contexto

- [x] createMany con `dedupKey` de la entrada; map de entries por
  `personId + dedupKey`
- [x] Specs: 2 enrollments → 2 mails con ctx propio; ALL sigue 1/persona

## Claim atómico

- [x] `execute()` → `updateMany(id, runningRunId:null)`; count 0 →
  borrar run + skip/409
- [x] Spec: segunda instancia pierde el claim

## Audiencia CLAIMS_PENDING

- [x] Resolver owners con claims PENDING > days; vars academy+count;
  dedupKey diario
- [x] Opción en el front + i18n + hint de vars

## Selector de eventos

- [x] Input de búsqueda `q` sin filtro de status; label con fecha+status

## E2e manual claim flow

- [x] intent → AWAITING idempotente → receipt → PENDING → approve
  (payment+enrollment) + cancel + /claims/mine resume

## Verificación

- [x] Specs nuevas verdes, suite completa, tsc api+web, build web,
  i18n audit, openspec validate, openapi/postman regen
- [x] Handoff actualizado
