## ADDED Requirements

### Requirement: Tour de primera visita del inicio admin

En `/inicio` con lente ADMIN la app SHALL correr un tour de primera
visita (`onboarding["admin"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre las secciones del home (KPIs
agrupados de la plataforma, la cola "Leads por revisar" cuando existe)
y la navegación del chrome visible: la hamburguesa/drawer en `<lg` y la
sidebar en `≥lg`, además de la campana. Los pasos cuyo target no exista
(cola de leads vacía) SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el home del admin

- **GIVEN** un admin que nunca vio el tour
- **WHEN** abre `/inicio` con lente ADMIN
- **THEN** el tour recorre los KPIs, la cola de leads si hay pendientes,
  la navegación del chrome y la campana, y al cerrarse marca
  `onboarding["admin"]`

#### Scenario: sin leads pendientes

- **GIVEN** un admin sin leads en status NEW
- **WHEN** corre el tour
- **THEN** el paso de la cola de leads se omite y el tour completa el
  resto
