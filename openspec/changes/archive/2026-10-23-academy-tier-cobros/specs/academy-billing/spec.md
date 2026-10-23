# Delta: academy-billing (academy-tier-cobros)

## ADDED Requirements

### Requirement: Entitlements por tier de academia

Cada módulo de la consola SHALL mapear a un tier mínimo: COBROS =
cobranza + estado de alumnos solamente; STUDIO = operación completa
(clases, reservas, asistencia, staff, exports, check-in); PRO =
analítica, CRM, campañas, videos, insights, multi-academia. Un request
a módulo sin tier SHALL responder 403 `{error:"tier.required",
upgrade:true, requiredTier}`. Admins y alumnos nunca se gatean. Cuentas
existentes migran a STUDIO por defecto.

#### Scenario: COBROS sin clases

- **WHEN** una academia COBROS llama a crear clase o marcar asistencia
- **THEN** recibe 403 tier.required con requiredTier STUDIO

#### Scenario: Nav filtrado por tier

- **WHEN** la consola academia carga con tier COBROS
- **THEN** solo se listan cobros/membresías/alumnos; el resto no se
  enlaza ni responde
