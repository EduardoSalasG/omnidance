# Design: BYO collections para academias

## Flujo resultante

```
alumno compra plan/taller/particular
  → checkout resuelve AcademyGatewayAccount de la academia
  → cobro por SU adaptador (Flow/MP/…) con credenciales cifradas
  → plata directa a la cuenta de la academia (nunca a Omnidance)
  → Payment gateway-PAID registrado con academyId decodificado del refId
  → devengado: take = amount × academy_fee.net_pct
fin de mes → factura a la academia: SaaS + Σ take neto + IVA
  → paga → todo sigue; no paga → collectionsBlockedAt
  → checkout BYO de sus alumnos rechaza gateway-orders (solo claim manual)
```

## Piezas

- **Credenciales**: generalizar `ProducerGatewayAccount` a actor-scope
  (o `AcademyGatewayAccount` espejo): mismo cifrado, mismo
  `GatewayRegistry`, mismo routing de webhook `?account=<id>`. Consola
  de la academia: alta/edición + probe.
- **Resolución en checkout**: las órdenes MEMBERSHIP/WORKSHOP/PRIVATE
  de una academia con cuenta BYO activa cobran por su adaptador;
  sin cuenta → solo claim MANUAL. El path our-Flow deja de emitir
  órdenes nuevas para academias.
- **Devengado del take**: en el settle (o en el cierre del período),
  cada Payment gateway-PAID de academia genera su devengado
  (amount × `academy_fee.net_pct`, congelado por orden — campo nuevo
  en Payment o línea consolidada en la factura; preferir congelado
  por orden como `academyCommissionClp`/`platformFee*` existentes).
- **Factura mes vencido**: `PlatformSubscription` de la academia
  agrega la línea "cobranza automatizada del período" (Σ devengado
  neto) sobre su cargo SaaS — o documento propio `AcademyInvoice` si
  el ciclo SaaS no calza con el natural de liquidación; decidir en
  implementación (preferir unificar en la sub si existe). IVA sobre
  neto (19%).
- **Bloqueo por impago**: reconcile de invoices marca
  `Academy.collectionsBlockedAt` (o equivalente) pasada la gracia;
  el checkout de sus alumnos responde error honesto para órdenes por
  gateway y solo permite claim manual; al liquidar, se libera solo.
  La mora SaaS completa (`billingBlockedAt`) sigue igual — son dos
  flags con distinto scope.
- **Liquidación mensual**: `GET /academies/:id/statements?period=YYYY-MM`
  → estado de cuenta (operaciones, take por orden, totales neto/IVA);
  export PDF vía `buildTablePdf` (KPIs: recaudado, take, neto a pagar)
  y CSV; también en `/admin/finanzas`.
- **Deprecación**: el cálculo de payout de academia
  (`GATEWAY_FEE_PASSTHROUGH`, `ACADEMY_COBROS_TAKE`) queda solo para
  períodos históricos; `academy_cobros.take_multiplier` se retira del
  modelo nuevo (el take flat lo reemplaza).
- **Precios**: cotización neta + IVA en planes SaaS y take (convención
  B2B del fee productor). Decisión pendiente de pricing: si los params
  `academy_tier.*_monthly_clp` vigentes se reinterpretan como neto
  (encarece ~19% el sticker) o se mantienen como final y solo el take
  va neto+IVA — documentar lo que decida el owner.
  **PENDING OWNER (implementado 2026-11-27)**: el design es ambiguo y
  no asienta la opción neta; por instrucción explícita del usuario se
  mantuvieron los `academy_tier.*_monthly_clp` como **precio final**
  (sin cambio de sticker ni de `platform-tiers.ts`). Lo que SÍ va
  neto + IVA es el take BYO: `Payment.academyTakeClp` se calcula neto
  y el `AcademyCollectionsStatement` agrega IVA 19% (`tax.iva_pct`)
  sobre ese neto al total cobrado. Si el owner confirma precios netos
  para el SaaS, el cambio es solo de interpretación de params +
  desglose visual en la factura de la sub - no requiere migración.

## Proyecciones (1% neto, supuestos del change doc)

GMV $2,5M/academia/mes, ~60% por pasarela → ~$15k take/academia/mes:
Piloto +$0,03M/mes, Tracción +$0,12M, Captura +$0,23M. Actualizar
`omni-dance.md` §10 (fila "Acad. take") + estrategia-comercial §6
(mapa de monetización: usage/cobranza pasa a take flat BYO).

## Riesgos / decisiones abiertas

- **AR vs deducción**: el take es cuenta por cobrar, no retención —
  riesgo de mora mitigado por el bloqueo BYO.
- **Academias sin pasarela propia**: solo claim manual (gratis). Las
  informales no pueden tener pasarela → canal natural sin cambios.
- **Fuga a manual**: claims siguen gratis por diseño; el take bajo
  (1%) mantiene la conveniencia competitiva.
- **Migración de órdenes en vuelo**: academias vendiendo hoy por
  our-Flow — cutover por fecha; liquidaciones históricas se pagan con
  el motor viejo hasta agotarse.
