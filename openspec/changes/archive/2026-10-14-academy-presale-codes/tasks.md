# Tasks

- [x] Schema: `DiscountCodeType.ACADEMY_PRESALE`,
      `DiscountCode.academySaleAgreementId` (índice),
      `Payment.methodLabel`; migración versionada + generate.
- [x] `AcademySalesService.createPresaleCode`/`listPresaleCodes` + generador
      slug-fecha-suffix + cupo (emitidos + link-sales PAID < maxTickets).
- [x] Endpoints `POST/GET /academy-deals/:id/codes` (staff academia
      capability payments; productor dueño o admin también en GET).
- [x] Checkout: código `ACADEMY_PRESALE` → acuerdo ACTIVE requerido,
      `soldByAcademyId` + `academyCommissionClp` congelados, `methodLabel`
      propio en órdenes MANUAL; consumo single-use atómico en la tx de
      settle (carrera check→settle cerrada).
- [x] `debtFor` bidireccional + stats del acuerdo (codesEmitted,
      codeReceivableClp, saldo neto signed); `markPaid` con amountDue firmado.
- [x] `withContextNames`: `soldByAcademyName` + `methodLabel` +
      `discountCodeType` + `personName` en la proyección.
- [x] Front academia: botón "Generar código" (copy) + lista de códigos
      con redemption (quién/cuándo) en la ficha del acuerdo.
- [x] Front productor: en la ficha del acuerdo, códigos emitidos +
      comprador que redimió; saldo con dirección ("le debes" / "te debe").
- [x] Front ventas: columna Medio (methodLabel | Preventa academia |
      gatewayMedia | App) + comprador + Nº transacción.
- [x] i18n + tests + typecheck + audit + docs (openapi/postman).
- [x] `omni-dance.md` §preventa-academias + `docs/architecture.md` /
      `docs/flows.md` si alguna sección quedó inexacta.
