# Tasks

- [x] Schema: Payment.channel + unitListPrice + unitServiceFee → db push
- [x] checkout.service: resolución de canal, cap de puerta, fee de puerta, columnas nuevas
- [x] checkout.controller: DoorSoldOutError → 409
- [x] webhook: tickets emitidos con precios unitarios de la orden
- [x] Tests de dominio: canal DOOR (LIVE y post-corte), cap, fee chain, channel persistido — 48/48
- [x] checkout-client: nota de canal correcta (preventa vs puerta)
- [x] tsc + tests + verificación E2E contra la API (compra LIVE → PAID → ticket ACTIVE con listPrice 7000 / fee 700)
