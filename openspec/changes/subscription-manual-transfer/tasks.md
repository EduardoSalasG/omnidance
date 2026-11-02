# Tasks; subscription-manual-transfer

- [x] Schema: status PENDING_PAYMENT (ambos modelos) + campo método de
      pago elegido en la sub + migración. (slice 1: paymentMethod
      CARD|TRANSFER + currentPeriodEnd; TicketClaim domain/academyId)
- [~] Params `platform_billing.transfer.*` + sección /admin/params.
      (slice 1: params sembrados en seed + lectura en subscribe; la
      sección /admin/params usa el editor genérico existente)
- [x] API subscribe paymentMethod=TRANSFER (membresía + plataforma):
      sub PENDING_PAYMENT + Payment PENDING claim-elegible + datos
      bancarios en respuesta. (slice 1)
- [x] Web checkout membresía + academy-billing: opción transferencia
      con datos bancarios + OwnMethodClaim reutilizado. (slice 2: también
      producer pro + badges PENDING_PAYMENT; falta scheduler renovación)
- [x] Claim approved → settle + activación (membresía y plataforma),
      rechazo → re-subida. (slice 1: settle activa sub +
      currentPeriodEnd; endpoints /academies/:id/order-claims y
      /admin/payment-claims)
- [x] Consolas de revisión: academia (membresías) + admin plataforma
      (PLATFORM_SUB). (slice 2: OrderClaimsQueue en /academia/cobros +
      ficha /academia/cobros/orden/[id]; /admin/facturacion/comprobantes)
- [ ] Scheduler renovación manual: Payment PENDING por ciclo +
      notificación + gracia/suspensión. (slice 2+)
- [~] Specs/tests suites payments + auth, typecheck, qa-flows-inventory.
      (slice 1: claims por dominio testeados; falta cobertura de
      subscribeTransfer y de los hooks del settle)
