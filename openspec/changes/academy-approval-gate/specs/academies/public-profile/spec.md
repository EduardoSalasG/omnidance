# academies/public-profile — delta academy-approval-gate

## MODIFIED Requirements

### Requirement: Sitio web de la academia

El sistema SHALL persistir `Academy.website` (nullable), editable vía
`PATCH /academies/:id/settings` (owner/ADMIN) y expuesto en
`GET /academies/:id/profile`. El backend normaliza: trim; "" o null
limpian el campo; sin esquema se asume `https://`; el resultado debe ser
una URL http(s) válida o se rechaza con 400. La ficha pública muestra el
link solo cuando hay website (muestra el host como etiqueta).

La ficha pública (`GET /academies/:id/profile`) SHALL además exigir que
la academia sea visible (`reviewStatus` APPROVED o checklist completo)
para viewers sin privilegios de gestión — ver academies/approval-gate.

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
