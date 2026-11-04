## ADDED Requirements

### Requirement: Hub /academia para instructor puro

El instructor puro (registro `AcademyInstructor` sin `AcademyStaff`,
sin ser owner ni ADMIN de plataforma) que abre `/academia` MUST NOT
recibir el dashboard del owner (KPIs y colas staff-gated por
`requireStaff` en `GET /academies/:id/dashboard`): la consola muestra
la grilla de módulos operativos sin bloque de error. Owner, staff y
ADMIN sí ven el dashboard.

#### Scenario: instructor puro abre /academia

- **GIVEN** un instructor puro de la academia
- **WHEN** abre `/academia`
- **THEN** ve la grilla de módulos y ningún estado de error+retry por
  el dashboard (la API seguiría respondiendo 403)
