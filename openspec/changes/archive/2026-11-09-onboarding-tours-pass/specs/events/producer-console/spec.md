## ADDED Requirements

### Requirement: Tour de primera visita del listado de eventos

En `/productor/eventos` la app SHALL correr un tour de primera visita
(`onboarding["productor-eventos"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre el filtro del listado, la lista
de eventos (cada card navega a su ficha) y la acción de crear evento.
Los pasos cuyo target no exista SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el listado

- **GIVEN** un productor que nunca vio el tour del listado
- **WHEN** abre `/productor/eventos` con eventos agendados
- **THEN** el tour recorre el filtro, la lista y el botón de crear, y
  al cerrarse marca `onboarding["productor-eventos"]`

#### Scenario: listado vacío

- **GIVEN** un productor sin eventos
- **WHEN** corre el tour
- **THEN** el paso de la lista se omite y el tour continúa con filtro y
  crear
