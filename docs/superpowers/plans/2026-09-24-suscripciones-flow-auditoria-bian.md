# Suscripciones Flow + Auditoría BIAN - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suscripciones recurrentes a planes de academia vía Flow (motor nativo plans/customer/subscription) + capa de auditoría BIAN (GatewayTransaction append-only + PaymentEvent hash-chain + verdad monetaria persistida) aplicada a TODAS las transacciones de dinero.

**Architecture:** Flow cobra automático (interval=3 mensual, interval_count 1/3/6). Reconciliación por cron diario sobre `subscription/get` (invoices) + webhook de plan como fast-path. Auditoría: wrapper `call()` en FlowGateway persiste cada request/response; `emitPaymentEvent` escribe el ledger con cadena SHA-256 dentro de la tx de negocio.

**Tech Stack:** NestJS + Prisma, node-cron (patrón `crm-triggers.scheduler`), vitest, Next.js + next-intl.

**Spec:** `docs/superpowers/specs/2026-09-24-suscripciones-flow-auditoria-bian-design.md`

## Global Constraints

- Sin `any`/`@ts-ignore`. i18n solo `es-CL` vía parts (`apps/web/src/i18n/parts/<ns>.json` + registro en `src/i18n/messages.ts`).
- Commits sin co-autoría ni firma. Git: `"C:\Program Files\Git\cmd\git.exe"`.
- Jamás persistir/loggear `FLOW_SECRET_KEY` ni firma `s` en claro (payload sanitizado).
- Sandbox-only: `FLOW_BASE_URL` debe ser `https://sandbox.flow.cl/api` (fail-fast ya implementado en `resolveGateway`).
- `prisma db push` requiere detener el watch de la API (lock del query engine).
- Suscripciones solo para `PlanType` recurrente: MONTHLY(×1)/QUARTERLY(×3)/SEMIANNUAL(×6) con `interval=3`.
- Cancelación siempre `at_period_end=1`. Cobro fallido → sin grace, expira en `endsAt`.
- Tests: `cd apps/api && npx vitest run src/payments`. tsc: `npx tsc --noEmit` en apps/api y apps/web.

---

### Task 1: Schema - GatewayTransaction + PaymentEvent + MembershipSubscription + campos

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (MembershipPlan ~line 690, Payment ~968, Person ~26)
- Create: `apps/api/scripts/backfill-payment-events.cjs`

**Interfaces:**
- Produces: modelos `GatewayTransaction`, `PaymentEvent`, `MembershipSubscription`; campos `MembershipPlan.flowPlanId`, `Person.flowCustomerId`, `Payment.{gatewayFeeClp,gatewayReportedAmount,gatewayMedia,gatewayPaidAt,gatewayRaw}`; relaciones `MembershipSubscription.plan`, `MembershipPlan.subscriptions`.

- [ ] **Step 1: Schema changes**

En `schema.prisma`:

```prisma
// después de MembershipPlan.enrollments:
  subscriptions MembershipSubscription[]
  // plan espejo en Flow (lazy create al primer subscribe - interval 3 mensual,
  // interval_count según tipo). null = aún no sincronizado.
  flowPlanId    String?

// modelos nuevos al final del archivo:

/// Cada request/response contra la pasarela (append-only, nunca update/delete).
/// Evidencia primaria ante disputas con Flow.
model GatewayTransaction {
  id            String   @id @default(cuid())
  provider      String   // "FLOW"
  direction     String   // OUTBOUND | INBOUND_WEBHOOK
  endpoint      String   // "payment/create", "subscription/get", ...
  correlationId String   // uuid por operación de negocio
  requestBody   Json?    // params sanitizados (firma "s" → sha256 truncado)
  responseBody  Json?
  httpStatus    Int?
  durationMs    Int?
  ok            Boolean
  error         String?
  paymentId     String?
  createdAt     DateTime @default(now())

  @@index([correlationId])
  @@index([paymentId])
  @@index([createdAt])
}

/// Ledger de dominio append-only con hash-chain por payment:
/// payloadHash = sha256(prevHash + canonical({paymentId,seq,type,actor,payload})).
/// Editar una fila rompe la cadena en el siguiente evento → tamper-evident.
model PaymentEvent {
  id          String   @id @default(cuid())
  paymentId   String
  seq         Int
  type        String   // ORDER_CREATED | GATEWAY_REQUEST | WEBHOOK_RECEIVED | STATUS_CONFIRMED | SETTLED | FAILED | RENEWAL_SETTLED | SUBSCRIPTION_CREATED | SUBSCRIPTION_CANCELED | AMOUNT_MISMATCH | IMPORTED
  actor       String   // system | webhook | polling | admin | cron | migration
  prevHash    String
  payloadHash String
  payload     Json
  createdAt   DateTime @default(now())

  @@unique([paymentId, seq])
  @@index([paymentId])
}

/// Suscripción recurrente a un plan de academia (motor Flow).
model MembershipSubscription {
  id                 String         @id @default(cuid())
  personId           String
  plan               MembershipPlan @relation(fields: [planId], references: [id])
  planId             String
  academyId          String
  flowSubscriptionId String?        @unique
  // PENDING_CARD → ACTIVE → CANCEL_PENDING → CANCELED (+ FAILED_CARD)
  status             String         @default("PENDING_CARD")
  nextInvoiceAt      DateTime?      // de Flow next_invoice_date - alimenta el reminder
  lastInvoiceId      String?        // dedup de renovaciones ya liquidadas
  reminderSentFor    DateTime?      // nextInvoiceAt ya recordado (dedup alerta)
  createdAt          DateTime       @default(now())
  canceledAt         DateTime?

  @@index([personId])
  @@index([academyId])
  @@index([status, nextInvoiceAt])
}
```

En `Person`: `flowCustomerId String?` (customerId en Flow - se crea on-demand al suscribirse).

En `Payment` (tras `gatewayRef`):

```prisma
  // Verdad monetaria reportada por la pasarela al confirmar PAID - auditable
  // contra la tarifa esperada (~3.19% tarjeta) y contra Payment.amount.
  gatewayFeeClp         Int?
  gatewayReportedAmount Int?
  gatewayMedia          String?
  gatewayPaidAt         DateTime?
  gatewayRaw            Json?   // getStatus completo (evidencia)
```

- [ ] **Step 2: db push + generate**

```bash
# detener watch de API primero (lock engine)
cd apps/api && npx prisma db push && npx prisma generate
```
Expected: schema sincronizado, client regenerado.

- [ ] **Step 3: Backfill IMPORTED**

`apps/api/scripts/backfill-payment-events.cjs` - itera `Payment` sin `PaymentEvent` e inserta seq 1 `{type:"IMPORTED", actor:"migration", prevHash:"GENESIS", payloadHash=sha256("GENESIS"+canonical), payload:{status,amount,orderType,refId,gateway,createdAt}}`:

```js
const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
const prisma = new PrismaClient();
(async () => {
  const payments = await prisma.payment.findMany({
    where: { events: { none: {} } }, // requiere relation Payment.events
  });
  // NOTA: agregar `events PaymentEvent[]` al model Payment para el where
  let n = 0;
  for (const p of payments) {
    const payload = { status: p.status, amount: p.amount, orderType: p.orderType, refId: p.refId, gateway: p.gateway, createdAt: p.createdAt };
    const canonical = JSON.stringify({ paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", payload });
    await prisma.paymentEvent.create({
      data: { paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", prevHash: "GENESIS", payloadHash: createHash("sha256").update("GENESIS" + canonical).digest("hex"), payload },
    });
    n++;
  }
  console.log(`backfill: ${n} PaymentEvent IMPORTED`);
  await prisma.$disconnect();
})();
```

Agregar `events PaymentEvent[]` al model `Payment` en el schema (relación implícita por paymentId - declarar `payment Payment @relation(fields:[paymentId]...)` en PaymentEvent + `events PaymentEvent[]` en Payment). Run: `node apps/api/scripts/backfill-payment-events.cjs`.

- [ ] **Step 4: Commit**

```bash
"C:\Program Files\Git\cmd\git.exe" add apps/api/prisma/schema.prisma apps/api/scripts/backfill-payment-events.cjs
"C:\Program Files\Git\cmd\git.exe" commit -m "schema: auditoría BIAN (GatewayTransaction, PaymentEvent, MembershipSubscription) + campos gateway en Payment"
```

---

### Task 2: Ledger domain - emitPaymentEvent + verifyPaymentChain

**Files:**
- Create: `apps/api/src/payments/domain/payment-ledger.ts`
- Test: `apps/api/src/payments/domain/payment-ledger.spec.ts`

**Interfaces:**
- Produces:
  - `emitPaymentEvent(tx: Prisma.TransactionClient, paymentId: string, type: string, actor: string, payload: Prisma.InputJsonValue): Promise<void>` - corre dentro de la tx de negocio.
  - `verifyPaymentChain(prisma: PrismaService, paymentId: string): Promise<{ ok: boolean; events: number; firstBadSeq?: number }>`

- [ ] **Step 1: Spec (failing)**

```ts
// payment-ledger.spec.ts - prisma fake con findFirst/create/findMany
import { describe, expect, it } from "vitest";
import { emitPaymentEvent, verifyPaymentChain } from "./payment-ledger";

// fake mínimo: events[] in-memory con la API que usa el ledger
function makeFake() {
  const events: any[] = [];
  const tx = {
    paymentEvent: {
      findFirst: async ({ where, orderBy }: any) =>
        events.filter((e) => e.paymentId === where.paymentId).sort((a, b) => b.seq - a.seq)[0] ?? null,
      create: async ({ data }: any) => { events.push(data); return data; },
      findMany: async ({ where, orderBy }: any) =>
        events.filter((e) => e.paymentId === where.paymentId).sort((a, b) => a.seq - b.seq),
    },
  };
  return { tx, events };
}

describe("emitPaymentEvent", () => {
  it("primer evento: seq 1, prevHash GENESIS", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "ORDER_CREATED", "system", { amount: 100 });
    expect(events[0].seq).toBe(1);
    expect(events[0].prevHash).toBe("GENESIS");
    expect(events[0].payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("segundo evento encadena el hash del primero", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "ORDER_CREATED", "system", { a: 1 });
    await emitPaymentEvent(tx as any, "p1", "SETTLED", "webhook", { b: 2 });
    expect(events[1].prevHash).toBe(events[0].payloadHash);
  });
});

describe("verifyPaymentChain", () => {
  it("cadena intacta → ok", async () => {
    const { tx } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "A", "system", {});
    await emitPaymentEvent(tx as any, "p1", "B", "webhook", {});
    const r = await verifyPaymentChain(tx as any, "p1");
    expect(r).toEqual({ ok: true, events: 2 });
  });

  it("payload adulterado → detecta el seq", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "A", "system", { amount: 100 });
    await emitPaymentEvent(tx as any, "p1", "B", "webhook", {});
    events[0].payload = { amount: 999999 }; // adulteración
    const r = await verifyPaymentChain(tx as any, "p1");
    expect(r.ok).toBe(false);
    expect(r.firstBadSeq).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/payments/domain/payment-ledger.spec.ts`)

- [ ] **Step 3: Implement**

```ts
// payment-ledger.ts
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Ledger BIAN: append-only, hash-chain por payment.
 * payloadHash = sha256(prevHash + canonical({paymentId,seq,type,actor,payload}))
 * Debe llamarse DENTRO de la tx de negocio (el caller pasa el tx client).
 */
export async function emitPaymentEvent(
  tx: Prisma.TransactionClient,
  paymentId: string,
  type: string,
  actor: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const last = await tx.paymentEvent.findFirst({
    where: { paymentId },
    orderBy: { seq: "desc" },
    select: { seq: true, payloadHash: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.payloadHash ?? "GENESIS";
  const canonical = JSON.stringify({ paymentId, seq, type, actor, payload });
  const payloadHash = createHash("sha256")
    .update(prevHash + canonical)
    .digest("hex");
  await tx.paymentEvent.create({
    data: { paymentId, seq, type, actor, prevHash, payloadHash, payload },
  });
}

/** Re-calcula la cadena completa de un payment y reporta integridad. */
export async function verifyPaymentChain(
  prisma: {
    paymentEvent: {
      findMany(a: {
        where: { paymentId: string };
        orderBy: { seq: "asc" };
      }): Promise<
        Array<{
          seq: number;
          type: string;
          actor: string;
          prevHash: string;
          payloadHash: string;
          payload: unknown;
        }>
      >;
    };
  },
  paymentId: string,
): Promise<{ ok: boolean; events: number; firstBadSeq?: number }> {
  const events = await prisma.paymentEvent.findMany({
    where: { paymentId },
    orderBy: { seq: "asc" },
  });
  let prevHash = "GENESIS";
  for (const e of events) {
    const canonical = JSON.stringify({
      paymentId,
      seq: e.seq,
      type: e.type,
      actor: e.actor,
      payload: e.payload,
    });
    const expected = createHash("sha256")
      .update(prevHash + canonical)
      .digest("hex");
    if (e.prevHash !== prevHash || e.payloadHash !== expected) {
      return { ok: false, events: events.length, firstBadSeq: e.seq };
    }
    prevHash = e.payloadHash;
  }
  return { ok: true, events: events.length };
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit** - `"payments: ledger PaymentEvent con hash-chain (emit + verify)"`

---

### Task 3: GatewayTransaction writer + FlowGateway refactor `call()`

**Files:**
- Create: `apps/api/src/payments/infrastructure/gateway-transactions.service.ts`
- Modify: `apps/api/src/payments/infrastructure/flow.gateway.ts` (wrap all fetch calls)
- Modify: `apps/api/src/payments/payments.module.ts` (inject writer)
- Test: extend `apps/api/src/payments/infrastructure/flow.gateway.spec.ts`

**Interfaces:**
- Consumes: PrismaService.
- Produces:
  - `GatewayTransactionsService.record(entry: GatewayTxEntry): Promise<void>` - sanitiza `s` → `"sha256:"+hash[:16]`, nunca lanza (best-effort: log a Logger si la escritura falla - la auditoría no puede romper el pago).
  - `type GatewayTxEntry = { provider: string; direction: "OUTBOUND" | "INBOUND_WEBHOOK"; endpoint: string; correlationId: string; requestBody?: unknown; responseBody?: unknown; httpStatus?: number; durationMs?: number; ok: boolean; error?: string; paymentId?: string }`
  - `FlowGateway` constructor +5th param `onTx?: (e: GatewayTxEntry) => Promise<void>`.
  - `sanitizeGatewayPayload(body: unknown): unknown` - exportada para tests.

- [ ] **Step 1: Spec additions (failing)**

En `flow.gateway.spec.ts` - nuevo describe: cada `createOrder`/`verifyWebhook`/`refreshStatus` emite exactamente 1 `GatewayTxEntry` con endpoint correcto, `requestBody.s` sanitizado (`sha256:` prefix, nunca la firma), `ok` según HTTP, `durationMs` >= 0. Fake `onTx` collector.

```ts
it("registra GatewayTransaction por cada call, firma sanitizada", async () => {
  const txLog: GatewayTxEntry[] = [];
  mockFetch({ url: "u", token: "t", flowOrder: 1 });
  const gw = new FlowGateway(KEY, SECRET, BASE, CONFIRM, async (e) => {
    txLog.push(e);
  });
  await gw.createOrder({ refId: "tkt_a_b", amount: 1, email: "e", returnUrl: "r" });
  expect(txLog).toHaveLength(1);
  expect(txLog[0].endpoint).toBe("payment/create");
  expect(txLog[0].direction).toBe("OUTBOUND");
  expect(txLog[0].ok).toBe(true);
  const req = txLog[0].requestBody as Record<string, string>;
  expect(req.s).toMatch(/^sha256:/);
  expect(req.s).not.toHaveLength(64); // nunca la firma completa
});
```

- [ ] **Step 2: Implement `GatewayTransactionsService`**

```ts
// gateway-transactions.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma.service";
import type { Prisma } from "@prisma/client";

export interface GatewayTxEntry {
  provider: string;
  direction: "OUTBOUND" | "INBOUND_WEBHOOK";
  endpoint: string;
  correlationId: string;
  requestBody?: unknown;
  responseBody?: unknown;
  httpStatus?: number;
  durationMs?: number;
  ok: boolean;
  error?: string;
  paymentId?: string;
}

/** "s" (firma) → huella sha256 truncada; secret nunca llega (no es un param). */
export function sanitizeGatewayPayload(body: unknown): unknown {
  if (!body || typeof body !== "object") return body ?? null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    clean[k] =
      k === "s" && typeof v === "string"
        ? `sha256:${createHash("sha256").update(v).digest("hex").slice(0, 16)}`
        : v;
  }
  return clean;
}

@Injectable()
export class GatewayTransactionsService {
  private readonly logger = new Logger(GatewayTransactionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort: un fallo de escritura nunca rompe el pago. */
  async record(entry: GatewayTxEntry): Promise<void> {
    try {
      await this.prisma.gatewayTransaction.create({
        data: {
          provider: entry.provider,
          direction: entry.direction,
          endpoint: entry.endpoint,
          correlationId: entry.correlationId,
          requestBody: sanitizeGatewayPayload(entry.requestBody) as Prisma.InputJsonValue,
          responseBody: (entry.responseBody ?? null) as Prisma.InputJsonValue,
          httpStatus: entry.httpStatus,
          durationMs: entry.durationMs,
          ok: entry.ok,
          error: entry.error,
          paymentId: entry.paymentId,
        },
      });
    } catch (e) {
      this.logger.error(`gateway tx log falló: ${e instanceof Error ? e.message : e}`);
    }
  }
}
```

- [ ] **Step 3: Refactor FlowGateway - wrapper `call()`**

Constructor: `constructor(apiKey, secret, baseUrl = "https://sandbox.flow.cl/api", confirmationUrl = "", private readonly onTx?: (e: GatewayTxEntry) => Promise<void>)`.

```ts
private async call<T>(
  endpoint: string,
  params: Record<string, string>,
  opts: { method?: "GET" | "POST"; correlationId?: string; paymentId?: string } = {},
): Promise<T> {
  const correlationId = opts.correlationId ?? randomUUID();
  const signed = this.signedParams(params);
  const paramsWithS: Record<string, string> = { ...params, s: signed.get("s")! };
  const started = Date.now();
  let httpStatus: number | undefined;
  let responseBody: unknown;
  let ok = false;
  let error: string | undefined;
  try {
    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: opts.method ?? (opts.method === "GET" ? "GET" : "POST"),
      headers:
        (opts.method ?? "POST") === "POST"
          ? { "content-type": "application/x-www-form-urlencoded" }
          : undefined,
      body: (opts.method ?? "POST") === "POST" ? signed : undefined,
      signal: AbortSignal.timeout(15_000),
      // GET: la query va en la URL
      ...( (opts.method === "GET") ? {} : {} ),
    });
    httpStatus = res.status;
    const text = await res.text();
    try { responseBody = JSON.parse(text); } catch { responseBody = text; }
    ok = res.ok;
    if (!res.ok) {
      const detail = (responseBody as {code?:number;message?:string})?.message;
      throw new Error(`flow ${endpoint} HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return responseBody as T;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    await this.onTx?.({
      provider: "FLOW",
      direction: "OUTBOUND",
      endpoint,
      correlationId,
      requestBody: paramsWithS,
      responseBody,
      httpStatus,
      durationMs: Date.now() - started,
      ok,
      error,
      paymentId: opts.paymentId,
    });
  }
}
```

Reescribir `createOrder`/`verifyWebhook`/`refreshStatus` para usar `call` (GET lleva params en query: para GET usar `call` con `method:"GET"` y URL `endpoint?${signed}`).

Para GETs: `call` con method GET construye `${baseUrl}/${endpoint}?${signed.toString()}`.

- [ ] **Step 4: Module wiring**

`payments.module.ts` - `resolveGateway` gana 2º param `onTx?: (e: GatewayTxEntry) => Promise<void>`; el provider usa `inject: [PrismaService]`:

```ts
{
  provide: PAYMENT_GATEWAY,
  useFactory: (prisma: PrismaService): PaymentGateway => {
    const txWriter = new GatewayTransactionsService(prisma);
    return resolveGateway(process.env, (e) => txWriter.record(e));
  },
  inject: [PrismaService],
},
```

`resolveGateway` pasa `onTx` al ctor de FlowGateway. Agregar `GatewayTransactionsService` a providers + exports.

- [ ] **Step 5: Run specs → PASS** (`npx vitest run src/payments`)

- [ ] **Step 6: Commit** - `"payments: GatewayTransaction append-only en cada call Flow + refactor call()"`

---

### Task 4: FlowGateway - métodos de suscripción/customer/plans

**Files:**
- Modify: `apps/api/src/payments/infrastructure/flow.gateway.ts`
- Modify: `apps/api/src/payments/domain/ports.ts` - nuevo port `SubscriptionProvider` (opcional, solo Flow lo implementa)
- Test: extend `flow.gateway.spec.ts`

**Interfaces:**
- Produces en `FlowGateway`:
```ts
ensurePlan(p: { planId: string; name: string; amount: number; intervalCount: number }): Promise<void>
createCustomer(p: { email: string; name: string; externalId: string }): Promise<{ customerId: string }>
getCustomer(customerId: string): Promise<{ creditCardType?: string; status?: number }>
registerCustomerCard(p: { customerId: string; returnUrl: string }): Promise<{ registerUrl: string }>
getRegisterStatus(token: string): Promise<{ status: number; customerId?: string }>
createSubscription(p: { planId: string; customerId: string; subscriptionStart: string }): Promise<FlowSubscription>
getSubscription(subscriptionId: string): Promise<FlowSubscription>
cancelSubscription(subscriptionId: string): Promise<void>

export interface FlowInvoice {
  id: number; status: number; amount: number;
  period_start?: string; period_end?: string;
  payment?: { status?: number; flowOrder?: number; paymentData?: { amount?: number; fee?: number; media?: string; date?: string; transferDate?: string } };
}
export interface FlowSubscription {
  subscriptionId: string; planId: string; status: number;
  next_invoice_date?: string; morose?: number; cancel_at_period_end?: number;
  invoices?: FlowInvoice[];
}
```

- [ ] **Step 1: Specs (failing)** - para cada método: endpoint correcto, params firmados, parseo de respuesta. Ejemplos clave:

```ts
it("createSubscription POST subscription/create con planId+customerId+start", async () => {
  const spy = mockFetch({ subscriptionId: "sus_1", status: 1, next_invoice_date: "2026-10-24 00:00:00" });
  const out = await makeGateway().createSubscription({ planId: "pl_1", customerId: "cus_1", subscriptionStart: "2026-09-24" });
  const [url, init] = spy.mock.calls[0];
  expect(url).toBe(`${BASE}/subscription/create`);
  const body = init.body as URLSearchParams;
  expect(body.get("planId")).toBe("pl_1");
  expect(body.get("customerId")).toBe("cus_1");
  expect(body.get("subscription_start")).toBe("2026-09-24");
  expect(out.subscriptionId).toBe("sus_1");
});

it("registerCustomerCard POST customer/register → registerUrl = url?token=", async () => {
  mockFetch({ url: "https://sandbox.flow.cl/app/customer/disclaimer.php", token: "tokR" });
  const out = await makeGateway().registerCustomerCard({ customerId: "cus_1", returnUrl: "https://api/cb" });
  expect(out.registerUrl).toBe("https://sandbox.flow.cl/app/customer/disclaimer.php?token=tokR");
});

it("cancelSubscription → at_period_end=1", async () => {
  const spy = mockFetch({ subscriptionId: "sus_1" });
  await makeGateway().cancelSubscription("sus_1");
  const body = (spy.mock.calls[0][1] as RequestInit).body as URLSearchParams;
  expect(body.get("subscriptionId")).toBe("sus_1");
  expect(body.get("at_period_end")).toBe("1");
});

it("ensurePlan: plans/get 404/error → plans/create; ya existe → no duplica", async () => {
  // plans/get devuelve error → create
  const spy = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("{}"), json: () => Promise.resolve({ planId: "pl_1" }) });
  vi.stubGlobal("fetch", spy);
  await makeGateway().ensurePlan({ planId: "pl_1", name: "Plan", amount: 100, intervalCount: 1 });
  expect(spy).toHaveBeenCalledTimes(2);
  expect((spy.mock.calls[1][0] as string)).toContain("plans/create");
});
```

- [ ] **Step 2: Implement** - todos vía `call()` (GET para get*, POST para el resto). Mapping interval: `interval=3` fijo, `intervalCount` = 1|3|6 según PlanType. `ensurePlan`: `plans/get` → si error → `plans/create` (planId, name, amount, currency CLP, interval 3, interval_count, urlCallback = `${apiUrl}/api/payments/subscription-webhook`, charges_retries_number 3). El callbackUrl necesita inyección - agregar `subscriptionCallbackUrl` como 6º param del ctor (module lo arma igual que confirmationUrl).

- [ ] **Step 3: Run → PASS, Commit** - `"payments: métodos Flow plans/customer/subscription"`

---

### Task 5: PaymentSettlementService - extraer settle + emitir eventos

**Files:**
- Create: `apps/api/src/payments/application/payment-settlement.service.ts`
- Modify: `apps/api/src/payments/infrastructure/webhook.controller.ts` (delegar)
- Modify: `apps/api/src/payments/payments.module.ts` (provider)
- Test: `apps/api/src/payments/application/payment-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `emitPaymentEvent` (Task 2), PrismaService, NotificationsService, ParamsService.
- Produces: `settle(payment: Payment, status: "PAID"|"FAILED", meta: { actor: string; gatewayData?: unknown }): Promise<{ ok: boolean; status: string; duplicated?: boolean }>` - reemplaza el `private settle` del controller; emite `STATUS_CONFIRMED`/`SETTLED`/`FAILED`/`RENEWAL_SETTLED` + persiste `gatewayFeeClp`/`gatewayReportedAmount`/`gatewayMedia`/`gatewayPaidAt`/`gatewayRaw` desde `meta.gatewayData` cuando sea PAID. También `settleMembership(payment, tx)` queda accesible para el reconcile de suscripciones.

- [ ] **Step 1: Mover métodos** - `settle`, `settleSeriesPass`, `settleMembership` y el path de tickets salen del controller al service (copia textual, `this.prisma`/`this.notifications`/`this.params` inyectados). Controller queda delegando.

- [ ] **Step 2: Instrumentar** - en `settle`: `ORDER_CREATED` ya no aplica (payment existe); emitir `STATUS_CONFIRMED` (payload: `{remoteStatus, gatewayRef}`), al PAID persistir los 5 campos gateway desde `meta.gatewayData` (`paymentData.fee` → `gatewayFeeClp`, `amount` → `gatewayReportedAmount` + comparar vs `payment.amount` → si difieren emitir `AMOUNT_MISMATCH` + `notifySafe` a ADMIN), `SETTLED`/`RENEWAL_SETTLED` según orderType, `FAILED`. Todo dentro de las tx existentes.

- [ ] **Step 3: webhook.controller** - `webhook()` pasa `meta: {actor:"webhook", gatewayData: result.gatewayData}`; `getPayment` polling pasa `{actor:"polling"}`. El `verifyWebhook` de FlowGateway debe devolver el getStatus completo: cambiar su return a `{refId, status, gatewayData}` (extender el tipo del port con `gatewayData?: unknown`).

- [ ] **Step 4: Spec** - fake prisma: settle MEMBERSHIP PAID emite secuencia de eventos + persiste gatewayFeeClp. Run `npx vitest run src/payments` → PASS.

- [ ] **Step 5: Commit** - `"payments: PaymentSettlementService + eventos ledger en settle + verdad monetaria Flow"`

---

### Task 6: Subscriptions - service + controller + endpoints Flow-callback

**Files:**
- Create: `apps/api/src/payments/application/subscriptions.service.ts`
- Create: `apps/api/src/payments/infrastructure/subscriptions.controller.ts`
- Modify: `apps/api/src/payments/infrastructure/webhook.controller.ts` (+`subscription-webhook`, +`flow/customer-return`)
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/src/payments/application/subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: FlowGateway métodos Task 4, `emitPaymentEvent`, `PaymentSettlementService.settleMembership`.
- Produces endpoints:
  - `POST /checkout/membership-subscription {planId, acceptRecurring:true}` → `{kind:"needs_card", registerUrl}` | `{kind:"subscribed", subscriptionId}`
  - `POST /payments/flow/customer-return {token}` (público - Flow redirige el browser) → `303 → ${WEB_URL}/academias/{academyId}?sub=ok|error`
  - `POST /payments/subscription-webhook {token}` (público) → registra GatewayTransaction INBOUND + `reconcileAll()`
  - `GET /subscriptions/mine` (SessionGuard) → subs del usuario con plan+academy
  - `GET /subscriptions/:id` (owner) → refresh activo vía `getSubscription` + settle invoice pagado
  - `POST /subscriptions/:id/cancel` (owner) → `at_period_end=1` → `CANCEL_PENDING`

- [ ] **Step 1: Spec service (failing)** - fake FlowGateway + fake prisma:

```ts
it("plan no recurrente → 400", async () => {
  await expect(svc.subscribe("p1", planSingle, true)).rejects.toThrow("recurrente");
});
it("sin tarjeta → needs_card + sub PENDING_CARD", async () => {
  // flow.getCustomer → {creditCardType: null}; registerCustomerCard → url
  const r = await svc.subscribe("p1", planMonthly, true);
  expect(r.kind).toBe("needs_card");
  expect(prismaFake.membershipSubscription[0].status).toBe("PENDING_CARD");
});
it("con tarjeta → subscription/create + ACTIVE + nextInvoiceAt", async () => {…});
it("acceptRecurring false → 400", async () => {…});
```

- [ ] **Step 2: Implement `SubscriptionsService`**

```ts
const INTERVAL_COUNT: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6 };

async subscribe(personId: string, planId: string, acceptRecurring: boolean) {
  if (!acceptRecurring) throw new BadRequestException("debes aceptar el cobro recurrente");
  const plan = await this.prisma.membershipPlan.findUnique({ where: { id: planId }, include: { academy: true } });
  if (!plan?.active || !plan.academy.active) throw new NotFoundException("plan no disponible");
  const intervalCount = INTERVAL_COUNT[plan.type];
  if (!intervalCount) throw new BadRequestException("este plan no es suscribible");

  const flow = this.flow(); // FlowGateway o error si gateway != FLOW
  // lazy: Flow plan
  let flowPlanId = plan.flowPlanId;
  if (!flowPlanId) {
    flowPlanId = `omni_${plan.id}`;
    const fee = await this.params.getNumber("service_fee.membership_clp", 500);
    await flow.ensurePlan({ planId: flowPlanId, name: `${plan.academy.name} - ${plan.name}`, amount: plan.price + fee, intervalCount });
    await this.prisma.membershipPlan.update({ where: { id: plan.id }, data: { flowPlanId } });
  }
  // lazy: Flow customer
  const person = await this.prisma.person.findUniqueOrThrow({ where: { id: personId } });
  let customerId = person.flowCustomerId;
  if (!customerId) {
    const c = await flow.createCustomer({ email: person.email!, name: person.name, externalId: personId });
    customerId = c.customerId;
    await this.prisma.person.update({ where: { id: personId }, data: { flowCustomerId: customerId } });
  }
  // ¿tiene tarjeta registrada?
  const customer = await flow.getCustomer(customerId);
  const sub = await this.prisma.membershipSubscription.create({
    data: { personId, planId, academyId: plan.academyId },
  });
  if (!customer.creditCardType) {
    const { registerUrl } = await flow.registerCustomerCard({
      customerId,
      returnUrl: `${this.apiUrl}/api/payments/flow/customer-return`,
    });
    return { kind: "needs_card" as const, registerUrl, subscriptionId: sub.id };
  }
  const fs = await flow.createSubscription({
    planId: flowPlanId, customerId,
    subscriptionStart: new Date().toISOString().slice(0, 10),
  });
  await this.prisma.membershipSubscription.update({
    where: { id: sub.id },
    data: { flowSubscriptionId: fs.subscriptionId, status: "ACTIVE",
            nextInvoiceAt: fs.next_invoice_date ? new Date(fs.next_invoice_date) : null },
  });
  return { kind: "subscribed" as const, subscriptionId: sub.id };
}
```

`customer-return` (en webhook.controller, público): `getRegisterStatus(token)` → status 1 + customerId → `person.flowCustomerId` → sub `PENDING_CARD` del person → `createSubscription` → status ACTIVE → `res.redirect(303, WEB_URL + "/academias/" + academyId + "?sub=ok")`. Siempre registrar GatewayTransaction INBOUND.

`subscription-webhook`: registra INBOUND + dispara `subscriptionsService.reconcileAll()` sin await (fire-and-forget, catch interno).

`GET /subscriptions/:id`: owner check → si `flowSubscriptionId` → `flow.getSubscription` → reconcile invoices (Task 8 comparte `reconcileSubscription(sub, fs)`) → devuelve sub + estado fresco.

`cancel`: owner → `cancelSubscription(flowSubscriptionId)` → status CANCEL_PENDING + canceledAt + PaymentEvent SUBSCRIPTION_CANCELED (si hay payment asociado) + notify `membership.subscription_canceled`.

- [ ] **Step 3: Run specs + tsc → PASS. Commit** - `"payments: suscripciones Flow - subscribe/cancel/customer-return/webhook"`

---

### Task 7: Scheduler - reconcile + reminder diario

**Files:**
- Create: `apps/api/src/payments/infrastructure/subscriptions.scheduler.ts`
- Modify: `subscriptions.service.ts` (+`reconcileSubscription`, +`reconcileAll`, reminder)
- Modify: `payments.module.ts`
- Test: spec del reconcile (fake prisma + fake FlowGateway)

**Interfaces:**
- `reconcileAll(): Promise<{checked:number; settled:number}>` - público para el webhook fast-path.
- `reconcileSubscription(sub: MembershipSubscription, fs: FlowSubscription)` - usado por GET /subscriptions/:id.

- [ ] **Step 1: Spec (failing)** - sub ACTIVE con invoice nuevo pagado → crea Payment `mem_<planId>_<invoiceId>` + settle + `lastInvoiceId` actualizado; invoice ya procesado → no duplica; `nextInvoiceAt` mañana + `reminderSentFor` null → notify `membership.renewal_reminder` y marca; `morose=1` → notify `membership.renewal_failed`.

- [ ] **Step 2: Implement**

```ts
async reconcileSubscription(sub, fs) {
  for (const inv of fs.invoices ?? []) {
    const paid = inv.status === 1 || inv.payment?.status === 2;
    const invId = String(inv.id);
    if (!paid || invId === sub.lastInvoiceId) continue;
    const refId = `mem_${sub.planId}_${invId}`;
    const exists = await this.prisma.payment.findUnique({ where: { refId } });
    if (exists) { await this.markInvoice(sub.id, invId); continue; }
    const payment = await this.prisma.payment.create({
      data: { refId, orderType: "MEMBERSHIP", personId: sub.personId,
        amount: inv.payment?.paymentData?.amount ?? inv.amount,
        fee: 0, net: inv.amount, gateway: "FLOW",
        gatewayRef: inv.payment?.flowOrder ? String(inv.payment.flowOrder) : null,
        gatewayFeeClp: inv.payment?.paymentData?.fee ?? null,
        gatewayPaidAt: inv.payment?.paymentData?.date ? new Date(...) : null,
        gatewayRaw: inv as object },
    });
    await emitPaymentEvent(this.prisma as any, payment.id, "ORDER_CREATED", "cron", { refId, invoiceId: invId });
    await this.settlement.settleMembership(payment /* tx */);
    await this.markInvoice(sub.id, invId); // lastInvoiceId = invId
  }
  // sync nextInvoiceAt + morose + reminder…
}
```

Scheduler: `@Injectable() onModuleInit` → `schedule("0 9 * * *")` (patrón crm-triggers, skip si NODE_ENV=test) → `reconcileAll()`.

Reminder: `sub.nextInvoiceAt` dentro de próximas 24h y `reminderSentFor !== nextInvoiceAt` → `notifySafe(personId, {category:"TRANSACTIONAL", type:"membership.renewal_reminder", title, body, data:{subscriptionId, nextInvoiceAt, planName}})` + `reminderSentFor = nextInvoiceAt`.

- [ ] **Step 3: Run → PASS. Commit** - `"payments: cron reconcile suscripciones + reminder día previo al cobro"`

---

### Task 8: Vistas de auditoría - endpoints + admin/browse

**Files:**
- Modify: `webhook.controller.ts` - `GET /payments/mine`, `GET /payments/by-event/:eventId`, `GET /payments/by-academy/:academyId`, `GET /payments/:id/events`
- Create o modify: admin verify-chain en `browse.controller.ts` o nuevo `payment-audit.controller.ts` (`GET /admin/payments/:id/verify-chain` - admin.access)
- Modify: `browse.controller.ts` - entities `payment-events`, `gateway-transactions`, `membership-subscriptions`
- Test: spec de autorización (owner vs ajeno vs admin)

**Interfaces:**
- Respuesta común payment row: `{id, orderType, refId, amount, fee, net, status, createdAt, gatewayFeeClp, gatewayReportedAmount, gatewayMedia, gatewayPaidAt}` + `eventCount`.

- [ ] **Step 1: `GET /payments/mine`** - `findMany({where:{personId}, orderBy:{createdAt:"desc"}, take:100})` + `_count.events`. Retorna también `academyName`/`eventName` resueltos (decode refId → lookup plan/event/series).

- [ ] **Step 2: `GET /payments/by-event/:eventId`** - `roleKeysHavePermission(prisma, req.person.roles, ["events.manage"])` + owner check del evento (producerId === personId) o admin. `findMany({where:{eventId}})`.

- [ ] **Step 3: `GET /payments/by-academy/:academyId`** - payments `orderType:MEMBERSHIP` cuyo refId decodifica a plan de la academia (mismo patrón que payouts.controller - reusar el decode + belongs). Autorización: academy ownerId === personId o `academies.manage`.

- [ ] **Step 4: `GET /payments/:id/events`** - owner o admin → lista PaymentEvent ordenada por seq (sin payloadHash? incluirlo - es la evidencia).

- [ ] **Step 5: `GET /admin/payments/:id/verify-chain`** → `verifyPaymentChain` → `{ok, events, firstBadSeq?}`.

- [ ] **Step 6: admin/browse** - cases nuevos en el switch (`payment-events`, `gateway-transactions`, `membership-subscriptions`) con filtros por paymentId/endpoint/status.

- [ ] **Step 7: specs + Commit** - `"payments: endpoints de auditoría por actor + verify-chain admin"`

---

### Task 9: Web - UX de suscripción (elección + consentimiento + cancelar)

**Files:**
- Modify: `apps/web/src/components/academy/plan-purchase-cta.tsx` (elección recurrente + consent)
- Create: `apps/web/src/components/academy/subscription-manage.tsx` (badge + cancelar)
- Modify: `apps/web/src/app/(app)/academias/page.tsx` + `academias/[id]/page.tsx` (integrar manage)
- Modify: `apps/web/src/app/(app)/checkout/return/page.tsx` (caso sub=ok)
- Create: `apps/web/src/i18n/parts/subscriptions.json`; registrar en `src/i18n/messages.ts`

**Interfaces:**
- Consumes: endpoints Task 6. `PlanPurchaseCta` gana props `{planType: string}` - si recurrente muestra dos opciones.

- [ ] **Step 1: Elección + consent** - En la card del plan con tipo recurrente: botón "Comprar" (pago único, flujo actual intacto) + opción "Suscribirme" que despliega el aviso legal + checkbox + CTA:

```
"Suscripción: se te cobrará automáticamente $X cada {mes|trimestre|semestre}
hasta que lo canceles. Te avisaremos un día antes de cada cobro."
[ ] Entiendo y acepto el cobro automático recurrente
[Suscribirme - deshabilitado hasta check]
```

`buy("subscription")` → `POST /checkout/membership-subscription` → `needs_card` → `window.location.href = registerUrl` · `subscribed` → polling `GET /subscriptions/:id` (mismo patrón POLL_INTERVAL) hasta ACTIVE + primer invoice → `router.refresh()`.

- [ ] **Step 2: `SubscriptionManage`** - si `mySubscription` ACTIVE → badge "Suscripción activa - próximo cobro {nextInvoiceAt}" + botón ghost "Cancelar suscripción" (confirm dialog nativo o inline 2-step) → POST cancel → refresh. Si CANCEL_PENDING → "Se cancela el {endsAt}" sin botón.

- [ ] **Step 3: `/checkout/return`** - param `?sub=ok` → mensaje "Suscripción activada - el primer cobro se está procesando" + link a Mis academias.

- [ ] **Step 4: Badge en Mis academias** - `MyAcademyCard`: si hay sub activa → "Suscripción" junto a "Plan activo"; si CANCEL_PENDING → "Se cancela el …".

- [ ] **Step 5: i18n** - `subscriptions.json`: `choose`, `oneTime`, `subscribe`, `consent`, `consentCheck`, `activeBadge`, `nextCharge`, `cancel`, `cancelPending`, `cancelConfirm`, `subOk`… + registro en messages.ts.

- [ ] **Step 6: tsc web + i18n-audit + detector. Commit** - `"web: compra como suscripción con consentimiento + gestión/cancelación"`

---

### Task 10: Web - 3 vistas de auditoría

**Files:**
- Create: `apps/web/src/app/(app)/perfil/pagos/page.tsx` (Mis pagos - dancer)
- Modify: `apps/web/src/app/(app)/productor/eventos/[id]/page.tsx` (+sección Pagos)
- Modify: consola `/academia` (sección Cobros - componente `academy-payments.tsx`)
- Modify: `apps/web/src/app/(app)/perfil/page.tsx` (link a /perfil/pagos)
- Modify: `admin/datos/page.tsx` (entities nuevas en selector)
- Create: `apps/web/src/i18n/parts/payments.json`

- [ ] **Step 1: `/perfil/pagos`** - tabla/lista de `GET /payments/mine`: qué compró (decode orderType → "Entrada/Pase/Plan"), monto, fee Flow, fecha real de cobro (`gatewayPaidAt ?? createdAt`), badge estado. Link desde /perfil.

- [ ] **Step 2: Productor** - sección "Pagos" en `/productor/eventos/[id]`: `GET /payments/by-event/:id` → tabla (comprador via lookup? endpoint ya devuelve personId - mostrar monto/estado/fecha/fee).

- [ ] **Step 3: Academia** - sección "Cobros" en consola: `GET /payments/by-academy/:id`.

- [ ] **Step 4: admin/datos** - agregar entities al selector existente.

- [ ] **Step 5: i18n `payments.json`** + tsc + detector. **Commit** - `"web: vistas de auditoría de pagos (dancer/productor/academia/admin)"`

---

### Task 11: Docs + openapi + smoke + verificación final

- [ ] **Step 1:** `docs/architecture.md` - modelos nuevos, endpoints, cron, scheduler; `docs/flows.md` - secuencia suscripción (mermaid) + nota ledger.
- [ ] **Step 2:** `node apps/api/scripts/export-api-docs.cjs` (API viva) → openapi + postman.
- [ ] **Step 3:** Smoke vivo `scripts/smoke-subscription.cjs` - flujo completo contra sandbox Flow (requiere credenciales del usuario en .env) o stub si no hay. Documentar resultado real.
- [ ] **Step 4:** Suite completa `npx vitest run` en api + `tsc --noEmit` api/web + i18n-audit + detector.
- [ ] **Step 5:** Commit final + resumen al usuario con gaps declarados.

---

## Self-review notes

- Spec coverage: §2.1 GatewayTransaction→Task3, §2.2 ledger→Task2+5, §2.3 campos→Task1+5, §2.4 backfill→Task1, §2.5 vistas→Task8+10, §3.1 modelo→Task1, §3.2 flujo→Task6+9, §3.3 reconcile/cron→Task7, §3.4 cancel→Task6+9, §3.5 notifs→Task6+7.
- `Payment.events` relation requerida por backfill (`events: { none: {} }`) - incluida en Task 1.
- `resolveGateway` signature crece con `onTx` - Task 3 lo define; Task 6 tests lo usan.
- FlowGateway 6º ctor param `subscriptionCallbackUrl` - Task 4; module wiring en Task 3 debe anticiparlo (o Task 4 ajusta).
