# Proposal; order-ref-45-limit

## Why

Smoke real contra Flow sandbox: `payment/create` responde
`HTTP 400: The commerceOrder can not be longer than 45 characters`.
`Payment.refId` dobla como `commerceOrder` y los formatos actuales
(`tkt_<eventId>_<codeId>_<uuid>` ≈ 67-92 chars con ids cuid) exceden
el límite en los 5 tipos de orden one-off. El stub nunca validó la
restricción, así que el bug solo aparece con la pasarela real.

## What Changes

- Sufijo de unicidad: `uuid` (36) → `shortUid()` de 8 chars base36
  (~2,8e12; `Payment.refId` es `@unique`, una colisión falla el
  insert sin cruzar correlaciones).
- `tkt_`: el `codeId` sale del ref; `Payment.discountCodeId` ya es la
  fuente de verdad. `decodeTicketOrderRef` decodifica ambos formatos
  (nuevo de 3 partes, legacy ≥4).
- Guard `fits()` local: un formato que exceda 45 explota con error
  claro en vez de un 400 de la pasarela.
- `platsub_*` sin cambios: nunca pasa por `payment/create` (lo genera
  el motor de suscripciones de Flow).

Formatos resultantes (con cuid de 25): `tkt_<ev>_<uid>` 38 ·
`sp_<series>_<YYYY-MM>_<uid>` 45 · `mem|wks|pvt_<id>_<uid>` 38.

## Out of scope

- Cobros sueltos plataforma→actor vía `payment.create` (backlog).
- Reintentos ante colisión de `shortUid` (volumen real hace la
  probabilidad despreciable; el error de unique ya aborta limpio).
