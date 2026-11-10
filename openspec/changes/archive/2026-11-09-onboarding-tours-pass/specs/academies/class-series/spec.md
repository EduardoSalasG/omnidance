## ADDED Requirements

### Requirement: Tour de primera visita del listado de series

En `/academia/series` la app SHALL correr un tour de primera visita
(`onboarding["academia-series"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre el filtro del listado, la lista
de series (cada card navega a su ficha) y la acción de crear serie.
Los pasos cuyo target no exista SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el listado

- **GIVEN** una persona con acceso de gestión que nunca vio el tour
- **WHEN** abre `/academia/series` con series existentes
- **THEN** el tour recorre el filtro, la lista y el botón de crear, y
  al cerrarse marca `onboarding["academia-series"]`

#### Scenario: listado vacío

- **GIVEN** una academia sin series
- **WHEN** corre el tour
- **THEN** el paso de la lista se omite y el tour continúa con filtro y
  crear
