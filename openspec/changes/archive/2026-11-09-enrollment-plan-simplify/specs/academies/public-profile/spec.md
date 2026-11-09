# Delta: public-profile

## MODIFIED Requirements

### Requirement: Tipo de plan como tag y nombre como categoría

En la sección Planes del perfil público, el nombre del plan SHALL
mostrarse tal cual lo configuró la academia (sin el tipo embebido) y el
tipo SHALL viajar como tag/badge separado. La metadata de cuota
(`classCount`/`weeklyClasses`) SHALL mostrarse como línea secundaria.

#### Scenario: plan por periodo

- **GIVEN** un plan `MONTHLY` con `weeklyClasses: 2` llamado "Oro"
- **WHEN** se renderiza la sección Planes
- **THEN** se muestra el nombre "Oro", el tag verde "Mensual" y la
  metadata "2 clases/semana" - el nombre no contiene "Mensual" ni el
  conteo semanal

#### Scenario: seed sin redundancia en nombres

- **WHEN** corre el seed de desarrollo
- **THEN** ningún `MembershipPlan` seedeado incluye "Mensual",
  "Trimestral", "Semestral" ni "clase(s) semanal(es)" en el nombre
- **AND** toda academia seedeada ofrece una "Clase de prueba" como
  `CLASS_PACK` con `classCount: 1` y un plan `SINGLE` ("Clase suelta")

#### Scenario: renombre idempotente

- **GIVEN** una BD ya seedeada con un plan llamado "Mensual ilimitado"
- **WHEN** corre el seed nuevamente
- **THEN** el plan se renombra in-place a su nombre de categoría (no se
  crea un duplicado) y cualquier resto con el nombre antiguo queda
  `active: false`
