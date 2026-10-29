# Change: academy-tier-cobros

## Why

La reestructura de planes (omni-dance.md §10) crea el tier COBROS
($39.990, señuelo): cobranza pura de membresías con take ~4,8% all-in,
sin clases/asistencia/staff/CRM/analítica/export. Hoy NO hay gating por
tier en academia; todas las features llegan a toda suscripción. Hay que
construir la matriz de entitlements y la UI de gateo reutilizando el
patrón `assertProducerPro`/`pro.required` ya existente.

## What Changes

- **Matriz de entitlements por tier**: `COBROS` (cobro + estado al
  día), `STUDIO` (+clases/series, reservas, asistencia, export CSV,
  check-in, staff), `PRO` (+analítica, CRM, campañas/notificaciones
  marketing, videos, insights, multi-academia). Default de transición:
  cuentas existentes → STUDIO (no degradar a nadie).
- **API**: `assertAcademyTier(academyId, feature)` sobre el patrón
  producer-pro.ts → 403 `{error:"tier.required", upgrade:true,
  requiredTier}`; aplicar a endpoints de módulos gateados (clases,
  asistencia, staff, CRM, analítica, exports, videos, multi-academia).
- **Front**: mapa `tierFeatures` por cuenta (endpoint
  /me/academy/entitlements o incluido en /me); nav academia filtra por
  tier como hace flags; superficies bloqueadas muestran estado
  upgrade con CTA (console-patterns: gate explícito, no blank).
- **Take COBROS**: cobranza por nuestra pasarela a ~1,5× fee real en
  ese tier (spec §10); nuevo feeMode o línea de deducción.
- Params/seed: nuevos `academy_tier.cobros_*` + re-etiqueta de tiers.

## Out of scope

- Cambios en Producer Pro tiers (misma mecánica, change aparte).
- Migración de suscripciones existentes a tier nuevo (default STUDIO).
