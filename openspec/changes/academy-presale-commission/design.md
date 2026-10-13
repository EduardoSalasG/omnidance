# Design — academy-presale-commission

## Approach

Atribución silenciosa + deuda registrada. La plataforma no mueve la
comisión: la acumula como pasivo productor→academia y el productor la
regulariza por fuera marcándola pagada. Reutiliza el patrón de snapshot
del fee model (`instructor-commission` ya congela % por acuerdo) y los
payouts multi-actor solo como referencia — no se crean Payout a
academia por este canal.

## Modelo de datos

```prisma
model AcademySaleAgreement {
  id            String   @id @default(cuid())
  eventId       String?  // XOR con seriesId
  seriesId      String?
  academyId     String
  commissionPct Int      // 1-90
  maxTickets    Int?
  status        String   @default("INVITED") // INVITED|ACTIVE|DECLINED|DISABLED
  createdById   String   // productor que invita
  respondedAt   DateTime?
  createdAt     DateTime @default(now())
  @@unique([eventId, academyId])
  @@unique([seriesId, academyId])
}

model AcademySaleSettlement {
  id          String    @id @default(cuid())
  agreement   — derivado: (producerId, academyId, periodo) o por evento
  amountDue   Int
  status      String    @default("PENDING") // PENDING|PAID
  evidenceUrl String?   // comprobante opcional (mismo patrón claims)
  paidAt      DateTime?
  createdAt   DateTime  @default(now())
}

model Payment {
  ...
  soldByAcademyId       String?
  academyCommissionClp  Int?
}
```

Decisión de agrupación del settlement: **por evento** en v1 (la deuda se
regulariza post-evento, como hoy) — `AcademySaleSettlement{agreementId,
eventId?}`. Si el acuerdo es por serie, un settlement por evento de la
serie con ventas atribuidas. Alternativa evaluada: settlement mensual
— descartada, el ritual de pago offline es por evento.

## API

- `POST /events/:id/academy-deals` (productor, permiso sobre el evento) —
  crea INVITED; 409 si duplicado.
- `GET /events/:id/academy-deals` — lista con ventas/comisión por acuerdo.
- `PATCH /academy-deals/:id` — productor edita `commissionPct`/
  `maxTickets` (solo afecta órdenes futuras) o desactiva; academia
  acepta/declina (solo sobre acuerdos dirigidos a ella).
- `GET /academies/:id/sale-deals` — vista academia: acuerdos, link,
  ventas, comisión devengada, estado deuda.
- `POST /academy-sale-settlements/:id/mark-paid` (+ `evidenceUrl?`) —
  productor marca PAID con `paidAt`.
- Checkout: `POST /checkout/ticket` acepta `academyId?`; el front pasa el
  `?a=` persistido en sessionStorage al abrir la landing del evento.
  Validación: acuerdo ACTIVE para (evento o su serie, academia); sin
  acuerdo → ignorar.
- Settlement materialization: lazy al consultar (suma de comisiones PAID
  del acuerdo no cubiertas por un settlement PAID) o materializado al
  primer mark-paid — preferir materializar al marcar: el PENDING es una
  vista computada.

## Flujo de dinero

Comprador paga lista → fee plataforma sobre bruto (sin cambio) →
`producerNetClp` igual que hoy. La comisión no entra al payout: se acumula
en `Payment.academyCommissionClp` y la deuda se expone por acuerdo/
período. Al marcar pagada se persiste el settlement (monto = suma
computada al momento de marcar — si hubo ventas posteriores, queda un
remanente PENDING nuevo).

## Bordes

- Solo `channel=PRESALE`; DOOR/SERIES_PASS/otros orderTypes ignoran
  `academyId`.
- Academy debe tener rol APPROVED (no SANDBOX/PENDING) para ser invitada.
- Link `?a=` funciona para evento y serie; un acuerdo de serie atribuye
  en todos sus eventos.
- Notificaciones: academy al ser invitada; productor al aceptar/declinar.
- Fiscal: la deuda es data entre partes — omnidance no emite documento
  por ella (diferente a la comisión plataforma que sí genera
  BillingDocument).

## Consolas (patrón console-patterns)

- Productor: sección "Preventa por academias" en `/productor/eventos/[id]`
  — cards de acuerdo (academia, %, estado, link copiable, ventas,
  comisión), + bloque "Deuda por regularizar" con marcar-pagado.
- Academia: `/academia/preventas` (nueva entrada en la nav de academia) —
  lista de acuerdos con link, ventas acumuladas, comisión y estado de
  pago.
