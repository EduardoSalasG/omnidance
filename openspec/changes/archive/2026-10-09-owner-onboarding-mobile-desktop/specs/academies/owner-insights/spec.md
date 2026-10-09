## MODIFIED Requirements

### Requirement: Checklist de activación de academia

Mientras falte algún paso de puesta en marcha, la consola SHALL mostrar
una checklist "Primeros pasos" con las acciones marcadas según el estado
real: serie y horario creados (`weeklyClasses > 0`), plan comprable
(`plansCount > 0`), método de pago publicado (`methodsCount > 0`),
equipo invitado (`teamCount > 0`) y primer alumno (`totalStudents > 0`).
Cada paso SHALL enlazar a su módulo y el header SHALL indicar el
progreso "N de M". Con todos los pasos completos la checklist MUST NOT
renderizarse.

#### Scenario: academia recién creada

- **GIVEN** una academia sin alumnos ni series ni planes ni métodos de
  pago ni equipo
- **WHEN** el owner abre /inicio
- **THEN** ve la checklist con todos los pasos sin marcar, cada uno
  enlazando a su módulo

#### Scenario: checklist persiste con alumnos pero setup incompleto

- **GIVEN** una academia con 1 alumno pero 0 métodos de pago activos
- **WHEN** el owner abre /inicio
- **THEN** la checklist sigue visible con el paso "método de pago" sin
  marcar

#### Scenario: checklist completa desaparece

- **GIVEN** una academia con serie, plan, método de pago, equipo y
  alumnos
- **WHEN** el owner abre /inicio
- **THEN** la checklist no se renderiza

## ADDED Requirements

### Requirement: Métodos de pago activos en el dashboard

`GET /academies/:id/dashboard` SHALL incluir `methodsCount`: cantidad de
`AcademyPaymentMethod` con `active = true` de la academia (insumo del
paso "método de pago" del checklist de activación).

#### Scenario: academia con un medio activo

- **GIVEN** una academia con 1 medio de pago activo y 1 inactivo
- **WHEN** se consulta el dashboard
- **THEN** `methodsCount` es 1

### Requirement: Tour guiado de primera visita del owner

En `/inicio` con lente ACADEMY_OWNER la app SHALL correr un tour de
primera visita (`onboarding["academia-owner"]`, marcado una vez por
persona vía `POST /me/onboarding`) con pasos sobre las secciones del
dashboard (KPIs del mes, checklist de activación, clases de hoy,
alertas/retención) y un paso de navegación acorde al chrome visible:
la hamburguesa/drawer en `<lg` y la sidebar en `≥lg`. Los pasos cuyo
target no exista (checklist ya completada, sección vacía) SHALL omitirse
sin bloquear el tour.

#### Scenario: tour en mobile

- **GIVEN** un owner que nunca vio el tour, en viewport `<lg`
- **WHEN** abre /inicio
- **THEN** el tour recorre las secciones visibles y el paso de
  navegación apunta a la hamburguesa

#### Scenario: tour en desktop

- **GIVEN** un owner que nunca vio el tour, en viewport `≥lg`
- **WHEN** abre /inicio
- **THEN** el tour recorre las secciones visibles y el paso de
  navegación apunta a la sidebar

#### Scenario: checklist completada omite su paso

- **GIVEN** una academia con la checklist completa
- **WHEN** corre el tour del owner
- **THEN** el paso del checklist se omite y el tour continúa
