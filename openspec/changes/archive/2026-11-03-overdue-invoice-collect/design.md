# Design; overdue-invoice-collect

## Contrato del puerto

```ts
// ports.ts
export type CollectOutcome = "COLLECTED" | "PENDING" | "FAILED";

export interface CollectResult {
  outcome: CollectOutcome;
  /** id de orden/cobro en el proveedor (Flow flowOrder). */
  flowOrder?: string;
  /** Link de pago cuando el proveedor degradó a cobro por link/email. */
  paymentUrl?: string;
  /** Verdad monetaria normalizada (misma que invoice.payment.data). */
  gatewayData?: NormalizedGatewayData;
}

// SubscriptionInvoice gana:
nextAttemptDate?: string | null;
```

`SubscriptionProvider.collect(p: {customerId; amount; subject;
commerceOrder; returnUrl; currency?}, opts)` es método opcional del
puerto: los consumers verifican `typeof provider.collect ===
"function"` igual que el resto de capabilities opcionales.

## FlowGateway

`customer/collect` por `call()` (firma HMAC + auditoría
GatewayTransaction), params: `apiKey, customerId, amount, subject,
commerceOrder, urlConfirmation` (= `this.confirmationUrl`, el webhook
de payments), `urlReturn` (= `p.returnUrl`). Respuesta Flow:
`{type, commerceOrder, flowOrder, url?, token?, status,
paymenResult?}`:

- `type=1` + `paymenResult.status===1` → `COLLECTED` (gatewayData del
  paymenResult).
- `type=1` rechazado → `FAILED`.
- `type=2` (link) o `type=3` (email) → `PENDING`,
  `paymentUrl = url + "?token=" + token`.

## StubGateway

`collect` devuelve `COLLECTED` siempre (simulación) para tests y dev
sin Flow real.

## Integración en el reconcile

En `reconcileSubscription` de ambos servicios, sobre `fs.invoices`
impagas, ANTES del handler de mora (`handleMorose` /
`membership.renewal_failed`), iterar las elegibles:

```ts
const eligible = !inv.paid &&
  (fs.morose || inv.nextAttemptDate === null);
const refId = encode<...>Ref(subId/planId, invId);
const exists = await prisma.payment.findFirst({ where: { refId } });
if (exists) continue;
```

Por cada elegible sin Payment existente: `provider.collect(...)`.
Error de API → abortar esa invoice y cortar el loop (sin Payment, el
próximo reconcile reintenta). Resultado:

- `COLLECTED` → crear Payment (mismo shape que la invoice-settle:
  orderType, refId, amount, gateway, gatewayRef=flowOrder) +
  ORDER_CREATED + `settle*(payment, {kind:"renewal", gatewayData})` +
  `markInvoice`.
- `PENDING` → crear Payment PENDING con `gatewayRef=flowOrder`; la
  `paymentUrl` se pasa al handler de mora para el `data` de la notif.
- `FAILED` → crear Payment + ORDER_CREATED + evento FAILED.

El settle/webhook existente también puede liquidar el PENDING (el
webhook de payments busca por refId = commerceOrder).

## Dedup e idempotencia

- Payment.refId es @unique: es la llave de dedup natural.
- Invoice remota queda impaga en Flow para siempre: cada reconcile la
  verá impaga pero el Payment existente la descarta de la
  elegibilidad.
- Una invoice pagada luego por Flow (caso borde) llega al loop de
  `paidInvoices` con refId ya existente → solo `markInvoice`, sin
  doble settle.
