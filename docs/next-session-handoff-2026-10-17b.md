# Handoff 2026-10-17b — slice `producer-own-methods`

## Completado

Slice 5/5 del programa de pagos — **medios de cobro propios del productor**
(transferencia / link de pago / efectivo) con comprobante del comprador y
validación por el productor (feeMode `OWN_METHOD`).

### Backend (`apps/api`)

- **Schema**: `ProducerPaymentMethod` (producerId, type
  TRANSFER/PAYMENT_LINK/CASH, label, details, order, active) +
  `TicketClaim` (paymentId, personId, producerId, receiptKey, snapshots
  methodType/methodLabel, status PENDING/APPROVED/REJECTED +
  reviewedById/reviewedAt/reviewNote) + `Payment.ticketClaims`.
  Migración `20261018000000_producer_own_methods` (SQL escrita a mano,
  aplicada con `prisma migrate deploy` — `migrate dev` quedó bloqueado
  por el dev server).
- **`ProducerClaimsService`** (`payments/infrastructure/`): CRUD de
  métodos (orden por `order`+`createdAt`, `includeInactive`), claims del
  comprador (dueño + orden `MANUAL` `PENDING` + imagen/PDF ≤5MB en
  `claims/<producerId>/` via puerto `STORAGE`), cola del productor,
  receipt autenticado (comprador dueño / productor / admin), **approve =
  flip atómico `updateMany(status:PENDING)` + el mismo
  `settlement.settle(payment,"PAID",{actor:"person"})` del webhook**
  → ticket/pase/mesa/código/ledger/notificación, idempotente ante doble
  aprobación; reject exige motivo, la orden sigue PENDING y admite
  re-intento. Notifica productor (claim nuevo) y comprador (resolución).
- **Checkout**: `methodId` opcional en `CheckoutTicketDto` y
  `CheckoutSeriesPassDto`. Precedencia: `methodId` válido → PENDING
  `gateway:"MANUAL"` `feeMode:"OWN_METHOD"` desglose congelado
  (`ownMethodBreakdown`), **sin pasarela ni cuenta propia** (ni siquiera
  consulta `activeForProducer`), respuesta `paymentUrl:null` +
  `{method:{type,label,details}}`; inválido/inactivo/ajeno →
  `OwnMethodUnavailableError` → 400 sin crear orden. Sin `methodId` →
  ruta previa (cuenta propia ACTIVE → `OWN_GATEWAY` → default MANAGED;
  $0 → FREE + settle inmediato - verificado con código 100%).
- **Endpoints**: `GET|POST /producer/payment-methods`,
  `PATCH|DELETE /producer/payment-methods/:id`,
  `GET /events/:id/payment-methods` (activos del productor del evento),
  `POST|GET /payments/:id/claims` (comprador), `GET /producer/claims`,
  `POST /producer/claims/:id/approve|reject`,
  `GET /producer/claims/:id/receipt`.
- **`PaymentsModule` ahora importa `StorageModule` explícitamente**
  (igual que `AcademiesModule`): el módulo global no basta en testing
  modules parciales — el fix recuperó 215 tests e2e que se saltaban por
  `beforeAll` fallido en 8 archivos (admin, admin-intel, checkout,
  gap-crm, gap-events, gap-payments, social-endpoints, leads).

### Frontend (`apps/web`)

- `components/checkout/own-method-picker.tsx` — selector de método en el
  checkout (radio cards).
- `components/checkout/own-method-details.tsx` — instrucciones del
  método (banco/cuenta/RUT, link, efectivo) con copiar.
- `components/checkout/own-method-claim.tsx` — upload de comprobante +
  estado del claim.
- `checkout-client.tsx` + `series-pass-cta.tsx` — fase `manual`:
  fetch `GET /events/:id/payment-methods`, picker, y tras la compra
  instrucciones + claim en vez de redirect.
- `components/producer/payment-methods-section.tsx` — CRUD en
  `/productor/parametros`.
- `components/producer/claims-queue-section.tsx` + ruta
  **`/productor/comprobantes`** — cola PENDING/history, aprobar,
  rechazar con motivo, ver comprobante. Card "Comprobantes" en el hub
  `/productor`.
- i18n: `checkout.*` (ownMethod, claim, labels de detalle) +
  `producer.ownMethods.*` + `producer.modules.claims`. Auditoría
  `ALL_KEYS_OK`.

### Docs

`architecture.md` (bullet de medios propios + filas de modelo +
endpoints en fila payments), `omni-dance.md` (flujo en la fila "Métodos
propios" de la tabla de cobro), OpenSpec `producer-own-methods`
(proposal/tasks/specs, `openspec validate` verde), exports API
regenerados: **228 paths**.

## Verificación

- `pnpm exec vitest run` (apps/api): **1636/1636 tests, 77 archivos —
  todo verde** (incluye los 215 e2e recuperados por el fix de
  StorageModule).
- `pnpm build` (apps/web): 68/68 páginas, incluye
  `/productor/comprobantes`. Typecheck web limpio.
- `impeccable detect --json` sobre la UI nueva: `[]`.
- i18n audit: `ALL_KEYS_OK`.
- `openspec validate producer-own-methods`: válido.
- API docs regeneradas desde la API viva: 228 paths (incluye las 8
  rutas nuevas de métodos/claims).

## Estado del programa de pagos

Los 5 slices completos y commiteados en `dev`:

1. `admin-finance-console` → `04a9e00`
2. `gateway-port-normalization` → `e184b14`
3. `subscription-port-generic` → `9572991`
4. `producer-gateway-accounts` → `71c319e`
5. `producer-own-methods` → (este commit)

## Gaps conocidos / próximos pasos

- **E2E real del flujo manual en sandbox** (comprar con método propio,
  subir comprobante, aprobar → ticket emitido) queda pendiente — los
  specs cubren service/controller pero no hay e2e del claim completo.
- Revisión de UX en browser real (320px/mobile/desktop) pendiente del
  picker + cola de comprobantes (detector impeccable limpio, pero sin
  QA visual).
- Roadmap propuesto tras pagos: módulo de facturación admin (diseño
  aprobado?), wallet passes + QR day-of, offline check-in staff,
  adaptador Fintoc (A2A 1,35%+IVA — evaluación hecha, decisión
  pendiente).
