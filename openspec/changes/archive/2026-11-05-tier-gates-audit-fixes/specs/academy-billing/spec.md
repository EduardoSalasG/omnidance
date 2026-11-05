# Delta: academy-billing

## ADDED Requirements

### Requirement: Paywall consistente en superficies gated de academia

Toda página de la consola de academia detrás de una feature de tier
SHALL mostrar `TierPaywall` (no un 403 genérico) en dos caminos:
proactivo (`AcademyTierGate` por `academy.tier`) y reactivo (403
`tier.required` del endpoint mapeado por `isTierRequired`). Las fichas
del equipo (`/academia/equipo/[id]` y sus ediciones, incluido
`equipo/profesor/[id]`) SHALL gatear `staff` igual que la lista y el
alta; el roster `/academia/clases/[id]` SHALL mapear el 403
`tier.required` a `TierPaywall` (feature `attendance`); las páginas de
configuración `clases` y `niveles*` SHALL gatear `classes`.

#### Scenario: COBROS abre ficha de colaborador

- **GIVEN** staff de una academia COBROS
- **WHEN** navega a `/academia/equipo/<id>`
- **THEN** ve `TierPaywall` (feature staff, CTA a suscripción), no un
  error genérico

#### Scenario: Roster de clase en academia sin asistencia

- **GIVEN** una academia cuyo tier no cubre `attendance`
- **WHEN** alguien con acceso abre `/academia/clases/<id>`
- **THEN** el 403 `tier.required` del roster muestra `TierPaywall`
