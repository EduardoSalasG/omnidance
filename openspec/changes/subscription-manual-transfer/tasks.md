# Tasks; subscription-manual-transfer

- [ ] Schema: status PENDING_PAYMENT (ambos modelos) + campo método de
      pago elegido en la sub + migración.
- [ ] Params `platform_billing.transfer.*` + sección /admin/params.
- [ ] API subscribe paymentMethod=TRANSFER (membresía + plataforma):
      sub PENDING_PAYMENT + Payment PENDING claim-elegible + datos
      bancarios en respuesta.
- [ ] Web checkout membresía + academy-billing: opción transferencia
      con datos bancarios + OwnMethodClaim reutilizado.
- [ ] Claim approved → settle + activación (membresía y plataforma),
      rechazo → re-subida.
- [ ] Consolas de revisión: academia (membresías) + admin plataforma
      (PLATFORM_SUB).
- [ ] Scheduler renovación manual: Payment PENDING por ciclo +
      notificación + gracia/suspensión.
- [ ] Specs/tests suites payments + auth, typecheck, qa-flows-inventory.
