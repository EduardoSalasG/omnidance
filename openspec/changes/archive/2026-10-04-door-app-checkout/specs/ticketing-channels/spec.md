# ticketing-channels

## ADDED Requirements

### Requirement: Checkout de tickets soporta canal puerta-app

`POST /checkout/ticket` SHALL resolver el canal de venta por estado del evento: PRESALE mientras el evento esté PUBLISHED y antes del corte (`presale.cutoff_hour`, default 19:00 del día del evento); DOOR cuando el evento esté LIVE o ya pasó el corte, siempre que tenga `doorPrice`. Una orden DOOR cobra `doorPrice` por ticket + el fee de puerta app (evento → productor → `service_fee.door_app_clp`) y persiste `channel="DOOR"` con el precio unitario desnormalizado.

#### Scenario: Compra durante el evento

- WHEN un usuario compra entrada para un evento LIVE con doorPrice
- THEN se crea la orden PENDING con channel DOOR, listPrice=doorPrice y fee de puerta app

#### Scenario: Cap de puerta

- WHEN las ventas de puerta (checkins MANUAL + órdenes DOOR) alcanzan doorCap
- THEN el checkout rechaza con 409 de puerta agotada

#### Scenario: Preventa cerrada sin puerta

- WHEN un evento PUBLISHED pasó el corte y no tiene doorPrice
- THEN el checkout rechaza con PresaleClosedError (comportamiento previo)
