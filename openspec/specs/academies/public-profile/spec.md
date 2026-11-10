# academies/public-profile Specification

## Purpose
La ficha pública de la academia puede mostrar canales de contacto
autodeclarados por el owner (Instagram, WhatsApp, sitio web) - todos
opcionales.

## Requirements

### Requirement: Sitio web de la academia

El sistema SHALL persistir `Academy.website` (nullable), editable vía
`PATCH /academies/:id/settings` (owner/ADMIN) y expuesto en
`GET /academies/:id/profile`. El backend normaliza: trim; "" o null
limpian el campo; sin esquema se asume `https://`; el resultado debe ser
una URL http(s) válida o se rechaza con 400. La ficha pública muestra el
link solo cuando hay website (muestra el host como etiqueta).

La ficha pública (`GET /academies/:id/profile`) SHALL además exigir que
la academia sea visible (`reviewStatus` APPROVED o checklist completo)
para viewers sin privilegios de gestión; ver academies/approval-gate.

#### Scenario: guardar y mostrar

- **GIVEN** el owner edita el perfil con `website: "miacademia.cl"`
- **WHEN** guarda vía `PATCH /academies/:id/settings`
- **THEN** se persiste normalizado a `https://miacademia.cl` y
  `GET /academies/:id/profile` lo devuelve
- **AND** la ficha muestra el chip de sitio web

#### Scenario: validación

- **WHEN** `website` no parsea como URL http(s) → 400
- **WHEN** `website` llega como `""` o `null` → el campo se limpia
- **WHEN** `website` no viene en el body → el campo no se toca

#### Scenario: opcional

- **GIVEN** una academia sin `website`
- **WHEN** se renderiza la ficha pública
- **THEN** no aparece el chip de sitio web (Instagram/WhatsApp siguen
  siendo igual de opcionales)

#### Scenario: ficha de academia no visible

- **GIVEN** una academia con `reviewStatus` PENDING e incompleta
- **WHEN** un usuario sin privilegios de gestión pide
  `GET /academies/:id/profile`
- **THEN** responde como si la academia no existiera

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
