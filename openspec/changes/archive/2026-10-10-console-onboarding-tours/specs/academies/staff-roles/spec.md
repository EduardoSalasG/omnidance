## ADDED Requirements

### Requirement: Tour guiado de primera visita del instructor

En `/inicio` con lente INSTRUCTOR la app SHALL correr un tour de
primera visita (`onboarding["instructor"]`, marcado una vez por
persona vía `POST /me/onboarding`) con pasos sobre su home (KPIs de la
semana, próximas clases que dicta), sus tabs (Mis clases, Alumnos) y
la campana de notificaciones. Los pasos cuyo target no exista (sin
clases próximas, tab no visible) SHALL omitirse sin bloquear el tour.

#### Scenario: tour del instructor

- **GIVEN** un instructor que nunca vio el tour
- **WHEN** abre `/inicio` con lente INSTRUCTOR
- **THEN** el tour recorre sus KPIs, la sección de próximas clases,
  los tabs Mis clases y Alumnos, la campana y el perfil, y al cerrarse
  marca `onboarding["instructor"]`
