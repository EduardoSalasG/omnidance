# academy-presale-codes

## Why

El canal `?a=` (link atribuido) cubre la preventa cobrada por la app, pero
la forma real en que las academias venden es **cobrando ellas mismas** en
efectivo/transferencia a sus alumnos. El modelo nuevo: la academia emite
un **código 100% off por cada venta** que ya cobró; el comprador lo
redime en el checkout, recibe su ticket $0, y la plataforma registra la
**cuenta por cobrar** academia→productor (lo recaudado menos su
comisión). Ambas partes saldan por fuera; la plataforma solo computa.

## What Changes

- **Códigos de preventa por academia**: `POST /academy-deals/:id/codes`
  genera un `DiscountCode` tipo `ACADEMY_PRESALE`; 100% off, un solo uso,
  scope al evento/serie del acuerdo, código legible (`MUVET-15NOV-7K4F`).
  `AcademySaleAgreement.maxTickets` (si existe) limita los códigos
  emitidos; el cupo se cumple en origen, no post-hoc.
- **Atribución por código**: en el checkout, un código `ACADEMY_PRESALE`
  marca `Payment.soldByAcademyId` y congela `academyCommissionClp` igual
  que el link; la orden queda asociada a la transacción vía
  `Payment.discountCodeId` + `DiscountRedemption` (ya existe).
- **Deuda bidireccional**: ventas por link → productor debe comisión a la
  academia (como hoy); ventas por código → la academia cobró el efectivo
  y le debe `precioLista − comisión` al productor. El saldo del acuerdo
  es el neto; `AcademySaleSettlement.amountDue` pasa a ser firmado
  (positivo = productor pagó; negativo = academia pagó).
- **Medio de pago visible**: `Payment.methodLabel` (snapshot) para órdenes
  por método propio ("Transferencia") y la vista de ventas muestra
  "Preventa {academia}" en órdenes redimidas por código.
- **Listados**: `GET /academy-deals/:id/codes`; códigos emitidos con su
  redemption (quién la usó, cuándo) para productor y academia.

## Impact

- `AcademySalesService`: generación/listado de códigos, deuda neta.
- `CheckoutService`: atribución por `discountCodeId` (además del `?a=`).
- Schema: enum `DiscountCodeType.ACADEMY_PRESALE`,
  `DiscountCode.academySaleAgreementId`, `Payment.methodLabel`.
- Front: consola academia (emitir/copiar código, lista), ficha del acuerdo
  del productor (códigos + comprador), columna Medio en Ventas.
