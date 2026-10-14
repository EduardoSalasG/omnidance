# Handoff 2026-10-14 — Preventa por códigos de academia (canal efectivo)

## Completado (commit `520fbb6` en `dev`)

Change OpenSpec `academy-presale-codes` implementado y archivado
(`openspec/changes/archive/2026-10-14-academy-presale-codes/`). La preventa
por academias ahora tiene **dos canales coexistiendo** sobre el mismo
`AcademySaleAgreement`:

1. **Link `?a=`** (existente): el comprador paga por la app → el productor
   le debe la comisión a la academia.
2. **Código `ACADEMY_PRESALE`** (nuevo): la academia cobra en efectivo
   fuera de la app y emite un código 100% off de un solo uso por venta
   (`SLUG-15NOV-XXXX`). El comprador lo redime en checkout → orden $0
   `FREE`, ticket emitido, `soldByAcademyId` + `academyCommissionClp`
   congelados. La academia le debe `precioLista − comisión` al productor.

El **saldo del acuerdo es neto signed** (`debtFor`): Σ comisión link −
Σ receivable códigos − Σ settlements. `markPaid` registra monto firmado
(positivo = productor pagó; negativo = academia pagó); saldo 0 → 409.

### Piezas clave

- Schema: `DiscountCodeType.ACADEMY_PRESALE`,
  `DiscountCode.academySaleAgreementId` (+índice), `Payment.methodLabel`
  (snapshot del método propio en órdenes MANUAL). Migración
  `20261105000000_academy_presale_codes` aplicada local.
- `AcademySalesService.createPresaleCode` / `listPresaleCodes`
  (POST/GET `/api/academy-deals/:id/codes`): staff academia con
  capability `payments`; el productor dueño/admin también audita.
  `ACADEMY_PRESALE` NO está en `DISCOUNT_CODE_TYPES` — solo se crea por
  esta ruta, no por el CRUD genérico.
- Checkout: código de academia requiere `channel=PRESALE`, `quantity=1`,
  acuerdo ACTIVE (`InvalidDiscountError` PRESALE_ONLY / SINGLE_TICKET /
  DISABLED). El vínculo código→acuerdo manda sobre la atribución `?a=`.
- `payment-settlement.service.ts`: consumo **atómico** del uso para
  `ACADEMY_PRESALE` (`updateMany` condicional `usedCount < maxUses` dentro
  de la tx) — cierra la carrera check→settle en órdenes $0. El perdedor
  revierte todo (orden FREE queda PENDING sin ticket).
- Proyección `withContextNames`: `personName`, `methodLabel`,
  `discountCodeType`, `soldByAcademyName`. Front deriva el medio vía
  `paymentMedium()` en `components/payments/shared.ts` (methodLabel →
  "Preventa academia" → gatewayMedia → "App").
- Fichas: academia emite/copia códigos y ve redenciones
  (`/academia/preventas/[id]`); productor ve códigos emitidos +
  comprador + saldo bidireccional
  (`/productor/eventos/[id]/academias/[agreementId]`).
- Docs: `omni-dance.md` §preventa-academias reescrita (dos canales),
  `flows.md` con sequence diagram del canal código, `architecture.md`
  endpoints, openapi/postman regenerados (288 paths).

## Verificación

- `vitest run src/payments src/discounts`: **506/506** (checkout 112,
  academy-sales service 25, controller 9, settlement 25, webhook 28).
- `tsc --noEmit` api + web: limpio. i18n audit `ALL_KEYS_OK`.
- `openspec validate --changes`: 3/3.
- `prisma migrate status`: up to date (37 migraciones).

### ⚠️ Detalle a saber

La migración `20261105000000` ya estaba aplicada cuando se corrigió el
mojibake de sus comentarios → el checksum en `_prisma_migrations` se
actualizó a mano (`726a2b56…`). En otros ambientes el archivo ya sale con
el contenido correcto, no requiere acción.

## Deuda conocida / próximo slice

- Carrera leve en emisión de códigos: check de cupo + create no es
  transaccional (dos POST concurrentes del mismo staff podrían pasar el
  cupo por 1). Aceptado: emisión manual por un actor; si se quiere
  cerrar, envolver en `$transaction` Serializable con retry P2034.
- `resolveAttribution` (canal link) ya descuenta códigos emitidos del
  cupo — consistente con la regla "código emitido = cupo reservado".
- La vista de ventas no etiqueta aún el canal link vs código en la misma
  columna Medio (ambos muestran academia vendedora como subtítulo cuando
  aplica); código muestra "Preventa academia".
- El comprador que redime código de academia no ve nada especial en
  "Mis pagos" — solo $0.
