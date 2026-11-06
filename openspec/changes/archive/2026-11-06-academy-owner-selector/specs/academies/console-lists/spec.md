# Delta: academies/console-lists

## MODIFIED Requirements

### Requirement: crear otra academia desde la consola

El owner con rol ACADEMY_OWNER (APPROVED o SANDBOX) SHALL ver un CTA
"Nueva academia" en su consola aunque ya tenga una o más academias;
junto al selector de academia cuando hay varias, solo cuando hay una.
La consola del owner es `/inicio` (AcademyDashboard embebido en
HomeHub): el selector y el CTA SHALL renderizarse ahí. El hub
`/academia`, consola de staff/instructor/ADMIN, SHALL conservar el
mismo selector para quienes tienen membresía en más de una academia.
El CTA navega a una página dedicada `/academia/nueva` (crear = página,
no form inline en el listado). Tras crear, la academia nueva queda
seleccionada (`omnidance:academy-id`) y la navegación vuelve al home.

#### Scenario: owner con una academia crea la segunda

- **WHEN** un owner con una academia abre su home `/inicio`, toca
  "Nueva academia" dentro del selector, completa el nombre y confirma
- **THEN** `POST /academies` crea la fila, la selección persiste la
  nueva y la consola muestra el selector con dos opciones y la nueva
  activa

#### Scenario: owner multi-academia cambia de academia

- **GIVEN** un owner con dos o más academias propias
- **WHEN** abre `/inicio` y elige otra academia en el selector
- **THEN** la selección persiste en `omnidance:academy-id`, el
  dashboard y los módulos de la consola muestran la academia elegida

#### Scenario: staff multi-academia en el hub

- **GIVEN** un staff con membresía en dos academias (ninguna propia)
- **WHEN** abre `/academia`
- **THEN** el selector sigue disponible en el hub y la grilla de
  módulos refleja la academia elegida

#### Scenario: deep-link sin permiso

- **WHEN** una persona sin rol ACADEMY_OWNER entra a `/academia/nueva`
- **THEN** ve el estado "sin acceso" con CTA de salida; el form no se
  monta

#### Scenario: CTA oculto para no-owner

- **WHEN** un instructor o staff (sin ACADEMY_OWNER) entra a la
  consola
- **THEN** no ve el CTA "Nueva academia"
