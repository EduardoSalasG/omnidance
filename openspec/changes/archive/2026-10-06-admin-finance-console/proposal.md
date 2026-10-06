# Proposal - admin-finance-console

## Por qué

El admin opera la monetización nueva (comisión all-in al actor,
trazabilidad BIAN) sin superficie: los endpoints de payouts existen
pero no tienen UI, no hay KPIs (GMV/ingreso/pasarela), ni visión del
devengado no liquidado ("qué le debo a cada actor") ni del MRR SaaS.
La administración financiera hoy exige leer la DB.

## Qué cambia

- Nuevo `/admin/finanzas`: consola de facturación con KPIs del
  período y tabs **Liquidaciones** (payouts + operar el ciclo
  generar/aprobar/pagar con evidencia), **Por liberar** (devengado no
  liquidado por actor + cola PENDING/APPROVED), **Pagos** (browse con
  desglose congelado por orden) y **SaaS** (MRR por tier + subs
  activas).
- `AdminFinanceController` (`admin.access`):
  - `GET /admin/finance/summary?from&to` — GMV por segmento
    (social/academia/SaaS/métodos-propios), ingreso plataforma
    (neto+IVA+SaaS), costo de pasarela, cola de payouts.
  - `GET /admin/finance/accrual` — pagos PAID **sin `PayoutLine`**
    atribuidos por actor con las mismas reglas del settlement
    (`unliquidatedOnly`), con neto estimado y receivable OWN_METHOD
    (lo que el actor nos debe, reportado aparte).
  - `GET /admin/finance/mrr` — `PlatformSubscription` ACTIVE por
    kind+tier con monto mensual normalizado por ciclo + funnel de
    estados.
- `computeSettlement` gana flag `unliquidatedOnly`
  (`payoutLines: none`) — misma fuente de verdad que la generación.
- `/admin/browse/payments` expone el desglose congelado
  (`feeMode/platformFeeRate/producerNetClp/gatewayFeeClp`).
- Card "Facturación" en el hub `/admin`.

## Alcance / riesgos

- Read-only sobre pagos (el accrual solo lee); las escrituras son las
  de payouts existentes con sus audits.
- Ajustes manuales (`MANUAL_ADJUSTMENT`) fuera de V1.
- `PayoutLine` no existía antes del modelo nuevo: pagos legacy ya
  liquidados en payouts viejos no tienen líneas → el accrual puede
  mostrarlos como "no liquidados" (se declara en docs; el admin lo
  ve como cola revisable, no como deuda real).
