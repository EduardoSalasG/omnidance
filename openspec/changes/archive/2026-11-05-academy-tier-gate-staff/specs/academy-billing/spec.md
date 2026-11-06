# academy-billing Spec Deltas

## MODIFIED Requirements

### Requirement: Entitlements por tier de academia

Cada módulo de la consola SHALL mapear a un tier mínimo: COBROS =
cobranza + estado de alumnos solamente; STUDIO = operación completa
(clases, reservas, asistencia, staff, exports, check-in); PRO =
analítica, CRM, campañas, videos, insights, multi-academia. Un request
a módulo sin tier SHALL responder 403 `{error:"tier.required",
upgrade:true, requiredTier}`. Admins y alumnos nunca se gatean. Cuentas
existentes migran a STUDIO por defecto.

El gate client-side de la consola (`AcademyTierGate`) SHALL derivar la
feature del `tier` de la academia seleccionada, que viaja en
`GET /academies/mine` para owner, staff e instructor por igual - el
mismo criterio para cualquier miembro del equipo, no solo para el
owner. El paywall es comunicación de upsell al owner; para staff e
instructor la restricción real la impone el 403 del API.

#### Scenario: COBROS sin clases

- **WHEN** una academia COBROS llama a crear clase o marcar asistencia
- **THEN** recibe 403 tier.required con requiredTier STUDIO

#### Scenario: Staff de academia STUDIO abre series

- **GIVEN** una academia con tier STUDIO y un staff con cap `schedule`
- **WHEN** el staff abre `/academia/series`
- **THEN** el gate client-side no muestra paywall y el contenido carga

#### Scenario: Staff de academia COBROS abre series

- **GIVEN** una academia con tier COBROS y un staff con cap `schedule`
- **WHEN** el staff abre `/academia/series`
- **THEN** ve el paywall "parte del plan STUDIO" (y el API respondería
  403 tier.required si lo intentara por otra vía)

#### Scenario: Nav filtrado por tier

- **WHEN** la consola academia carga con tier COBROS
- **THEN** solo se listan cobros/membresías/alumnos; el resto no se
  enlaza ni responde
