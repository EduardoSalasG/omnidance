## ADDED Requirements

### Requirement: Tour guiado de primera visita del productor

En `/inicio` con lente PRODUCER la app SHALL correr un tour de primera
visita (`onboarding["productor"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre las secciones del dashboard
(KPIs del mes, cobros por revisar, tops de eventos), el destino
Eventos y un paso de navegación acorde al chrome visible: la
hamburguesa/drawer en `<lg` y la sidebar en `≥lg`. Los pasos cuyo
target no exista (cola de cobros vacía, tops vacíos, destino no
visible en el viewport) SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el dashboard del productor

- **GIVEN** un productor que nunca vio el tour
- **WHEN** abre `/inicio` con lente PRODUCER
- **THEN** el tour recorre los KPIs, las secciones visibles del
  dashboard, el destino Eventos y la navegación del chrome, y al
  cerrarse marca `onboarding["productor"]`

#### Scenario: secciones vacías no bloquean

- **GIVEN** un productor sin comprobantes pendientes ni tops
- **WHEN** corre el tour
- **THEN** los pasos de cobros por revisar y tops se omiten y el tour
  completa el resto
