# Delta: people-profile

## ADDED Requirements

### Requirement: Perfil simplificado para lentes de gestión y docencia

Las secciones de gamificación y consumo del bailarín MUST NOT
renderizarse en `/perfil` bajo lentes que no las usan:

- Racha ("semanas seguidas") y contadores sociales: ocultos para
  `ADMIN` e `INSTRUCTOR`.
- Insignias: ocultas para `ADMIN` e `INSTRUCTOR`.
- "Mis pagos": oculto para `ACADEMY_OWNER` e `INSTRUCTOR`.

Los datos siguen existiendo bajo la lente DANCER de la misma persona —
la ocultación es por lente activa, no por usuario.

#### Scenario: instructor abre su perfil

- **GIVEN** una persona navegando con lente INSTRUCTOR
- **WHEN** abre `/perfil`
- **THEN** ve identidad + "Interactuar como" + cuenta, sin racha,
  insignias ni "Mis pagos"
