# Delta spec - admin-finance/console

## ADDED Requirements

### Requirement: Consola de facturación admin

El sistema SHALL exponer a `admin.access` una consola
`/admin/finanzas` con KPIs del período y la trazabilidad completa
de la monetización: cobros por segmento, liquidaciones operables,
devengado no liquidado por actor y MRR SaaS.

#### Scenario: KPIs del período

- **WHEN** el admin abre `/admin/finanzas`
- **THEN** `GET /admin/finance/summary` devuelve GMV segmentado
  (social/academia/SaaS/métodos-propios), ingreso plataforma
  (neto + IVA + SaaS), costo real de pasarela y la cola de payouts
  PENDING/APPROVED con neto

#### Scenario: Sin permiso

- **WHEN** un actor sin `admin.access` llama `/admin/finance/*`
- **THEN** 401/403 según sesión

### Requirement: Devengado no liquidado por actor

El sistema SHALL reportar por actor los pagos PAID **sin
`PayoutLine`** atribuidos con las mismas reglas del settlement:
gross, deducción estimada y neto estimado; las comisiones
`OWN_METHOD_*` devengadas se reportan como receivable (el actor debe
a la plataforma), no como payable.

#### Scenario: Ticket sin liquidar

- **WHEN** un `Payment` PAID MANAGED de un evento del productor no
  tiene `PayoutLine`
- **THEN** aparece en el accrual del productor con
  `estimatedNet = producerNetClp` proyectado por la misma lógica
  que `computeSettlement`

#### Scenario: Orden ya liquidada no repite

- **WHEN** el pago ya tiene `PayoutLine` en un payout generado
- **THEN** no aparece en el accrual

#### Scenario: Método propio del actor

- **WHEN** el pago es `OWN_METHOD`/`OWN_GATEWAY` sin liquidar
- **THEN** no suma a `gross` ni `estimatedNet`; su comisión
  (`platformFeeNetClp+VatClp`) suma a `ownMethodReceivable`

### Requirement: Operación del ciclo de payout desde UI

El admin SHALL poder generar (actor + período), aprobar y marcar
pagado (con `evidenceUrl`) un payout desde la consola, usando los
endpoints existentes; cada línea del payout es visible agrupada por
tipo.

#### Scenario: Flujo completo

- **WHEN** el admin genera el payout de un actor desde "Por liberar"
- **THEN** queda PENDING con `lines[]`; al aprobarlo pasa a APPROVED;
  al marcar pagado con evidencia pasa a PAID con `paidAt`

### Requirement: MRR de suscripciones de plataforma

El sistema SHALL calcular MRR = Σ `monthlyAmount` de
`PlatformSubscription` ACTIVE donde `monthlyAmount = precio del tier
(PlatformParam) / meses del ciclo`; ENTERPRISE/PRO_BIG sin precio en
param se reportan como `customContracts` fuera del MRR.

#### Scenario: Normalización por ciclo

- **WHEN** una academia tiene sub ACTIVE anual de $239.760
- **THEN** su `monthlyAmount` es $19.980 y suma al MRR
