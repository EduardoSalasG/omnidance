# Change: productor-desembolso-page

## Why

La "Cuenta de desembolso" (onboarding Stripe Connect) vive hoy como
sección dentro de `/productor/pagos`, mezclando **configuración**
(dónde me pagan) con **data operativa** (mis liquidaciones). Además
"Mis pagos" quedó colgado en el grupo Configuración del drawer cuando
es una superficie operativa del módulo; el ordenamiento del nav no
refleja la naturaleza de cada destino.

## What Changes

- **Página nueva `/productor/desembolso`**: mueve
  `DisbursementAccountSection` completa (estados gate, empty, PENDING
  "Continuar en Stripe", 503-unavailable) a página propia dentro de la
  sección Configuración del drawer del productor, junto a medios de
  pago; misma familia (dónde/cómo cobro).
- **`/productor/pagos`** queda solo como listado de liquidaciones
  (filtros, líneas, detalle); la sección de desembolso sale de ahí.
- **Nav (BottomNav drawer/sidebar)**: "Mis pagos" (`/productor/pagos`)
  sale del grupo Configuración y entra al grupo de módulos del
  productor junto a Comprobantes; nuevo ítem "Cuenta de desembolso"
  en Configuración.
- i18n: label nuevo `producer.configPages.disbursement` (y par en
  en/fr/pt-PT al completar el catálogo).

## Out of scope

- Cambios al onboarding Connect en sí (endpoints, estados, account
  links quedan idénticos).
- Desembolso manual/admin (`POST /admin/payouts/:id/disburse` sigue
  siendo API-only).
