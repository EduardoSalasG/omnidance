# Proposal - event-presale-cutoff

## Por qué

La preventa cierra a una hora fija global (`presale.cutoff_hour`,
default 19:00 del día del evento). Eso no representa eventos reales:
"Bachata con Salsa" de DJ Krrera tiene entrada liberada hasta las
23:45 y después cobra $5.000 en puerta — la ventana gratuita ES una
preventa ($0) con su propio corte. Además:

- El corte hoy solo se parametriza a nivel plataforma; ni el evento ni
  el productor pueden ajustarlo.
- Una entrada de preventa $0 igual pasa por la pasarela: `pricing.quote`
  ya exime el fee cuando net=0, pero el checkout crea la orden Flow con
  amount 0 y el usuario termina en una pantalla de pago por $0.

## Qué cambia

- **Corte de preventa en 3 niveles** (cadena: evento → productor →
  global, igual que los fees):
  - `Event.presaleCutoffMinutes Int?` - minutos desde medianoche del día
    del evento (0–2879; >1439 = post-medianoche del día siguiente).
    Lo setea el productor al crear/editar (mismo nivel que `presaleCap`).
  - `ProducerParams.presaleCutoffMinutes Int?` - default del productor,
    editable vía `PUT /admin/producers/:id/fee-params` (mismo controller
    que los defaults de fees, con vista `effective` resuelta).
  - Fallback actual intacto: `presale.cutoff_hour` (default 19) × 60.
  - La resolución vive en un helper puro compartido
    (`src/common/presale-cutoff.ts`) y la usan los 3 sitios que hoy
    calculan el corte: `purchaseTicket`, `discountQuote` y el
    `presaleEndsAt` del detalle de evento.
- **Preventa gratis real**: si `orderTotal === 0` (precio $0 o
  descuento que deja la orden en $0), el checkout NO llama a la
  pasarela: crea el Payment con `gateway: "FREE"` y lo liquida al
  instante por `PaymentSettlementService.settle(..., "PAID", {actor:
  "checkout"})` — mismo camino del webhook: tickets emitidos, mesa
  materializada, redención de código auditada, ledger y notificación.
  La respuesta devuelve `paymentUrl` apuntando a
  `/checkout/return?paymentId=…`, así el front redirige a la pantalla
  de retorno que ya muestra el éxito — sin cambios en el flujo del
  cliente.
- **UI productor**: `event-form.tsx` gana el campo "Preventa hasta"
  (`input type="time"` → minutos); vacío = hereda.
- **Seed**: "Bachata con Salsa" queda con `presaleCutoffMinutes: 1425`
  (23:45) - la ventana gratuita deja de ser solo texto del `program`.

## Alcance / no-objetivos

- No cambia la semántica de canal: `PRESALE` antes del corte, `DOOR`
  después (si hay `doorPrice`), `PresaleClosedError` si no hay puerta.
- No se agrega configuración por serie (`EventSeries`): el override
  vive en el evento; el default en el productor.
- El producer no-edita su propio default (igual que los fees hoy: lo
  fija el admin en `/admin/producers/:id/fee-params`).
