# academies/public-profile — delta de plan-tag-y-seed

## ADDED Requirements

### Requirement: Tipo de plan como tag y nombre como categoría

En la sección Planes de la ficha pública `/academias/:id`, el tipo del plan
(Mensual / Trimestral / Semestral / Clase única / Pack / De prueba / Por
periodo) SHALL renderizarse como tag acentuado (`Badge variant="neon"`), no
como texto secundario. El nombre del plan SHALL ser un nombre de categoría
propio de la academia (p. ej. Básico, Plata, Oro, Premium, VIP, Diamante)
que no repite el periodo ni el conteo de clases semanales — esos ya los
comunican el tag y la línea de metadata del card (N clases · N/semana).

#### Scenario: plan por periodo

- **GIVEN** un plan `MONTHLY` con `weeklyClasses: 2` llamado "Oro"
- **WHEN** se renderiza la sección Planes
- **THEN** se muestra el nombre "Oro", el tag verde "Mensual" y la
  metadata "2 clases/semana" — el nombre no contiene "Mensual" ni el
  conteo semanal

#### Scenario: seed sin redundancia en nombres

- **WHEN** corre el seed de desarrollo
- **THEN** ningún `MembershipPlan` seedeado incluye "Mensual",
  "Trimestral", "Semestral" ni "clase(s) semanal(es)" en el nombre
- **AND** toda academia seedeada ofrece al menos un plan `TRIAL`
  ("Clase de prueba") y un plan `SINGLE` ("Clase suelta")

#### Scenario: renombre idempotente

- **GIVEN** una BD ya seedeada con un plan llamado "Mensual ilimitado"
- **WHEN** corre el seed nuevamente
- **THEN** el plan se renombra in-place a su nombre de categoría (no se
  crea un duplicado) y cualquier resto con el nombre antiguo queda
  `active: false`
