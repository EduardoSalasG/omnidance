# door-app-checkout — Venta en puerta por la app

## Why

`POST /checkout/ticket` solo vende preventa: rechaza eventos no-PUBLISHED o sin `presalePrice`. Un evento LIVE (la noche en curso) o un PUBLISHED pasado el corte de las 19:00 no se puede comprar desde la app — la spec contempla el canal "puerta app" (cargo +$700, `service_fee.door_app_clp`) pero el checkout no lo implementa.

## What Changes

- `purchaseTicket` resuelve el canal: **PRESALE** (PUBLISHED + presalePrice + antes del corte) o **DOOR** (LIVE, o PUBLISHED post-corte, con `doorPrice`).
- DOOR cobra `doorPrice` + fee `event.doorAppFeeClp → ProducerParams.doorAppFeeClp → service_fee.door_app_clp → SERVICE_FEE.DOOR_APP_CLP`.
- `doorCap` cuenta ventas staff (Checkin MANUAL) + órdenes DOOR pagadas y PENDING recientes.
- `Payment` gana `channel`, `unitListPrice`, `unitServiceFee` — el webhook emite tickets con el precio real de la orden en vez de re-derivar de `event.presalePrice` (null en puerta).
- `PresaleClosedError` solo cuando pasó el corte Y el evento no tiene venta de puerta configurada.

## Capabilities

### Modified Capabilities
- `ticketing-channels`: el checkout de tickets soporta preventa y puerta-app.
