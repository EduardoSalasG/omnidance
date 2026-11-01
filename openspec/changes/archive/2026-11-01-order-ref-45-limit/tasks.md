# Tasks; order-ref-45-limit

- [x] 1. Spec `order-ref.spec.ts`: longitud ≤45 con ids cuid para los 5
  encoders + round-trip decode nuevo + compat legacy de ticket (RED
  verificado: 4 fallos esperados)
- [x] 2. `shortUid()` (8 base36, `randomInt`) + guard `fits(≤45)` en
  `order-ref.ts`
- [x] 3. `tkt_<eventId>_<uid>` sin codeId; `decodeTicketOrderRef`
  acepta formato corto y legacy
- [x] 4. `sp|mem|wks|pvt` encoders a `shortUid()` + `fits()`
- [x] 5. Caller `checkout.service.ts` sin `code?.id` + spec ajustado
  (`codeId` assert a la columna)
- [x] 6. Verificación: suite `src/payments` 656/656 + `tsc --noEmit`
  limpio
- [x] 7. Smoke sandbox Flow: `payment/create` aceptado → redirect a
  checkout Flow
