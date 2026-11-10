# Delta: academies/console-lists (academy-console-cta-gating)

## ADDED Requirements

### Requirement: CTAs de crear coherentes con el tier

En páginas de consola de academia gateadas por tier
(`AcademyTierGate`), el CTA de crear del `ConsoleHeader` SHALL NO
renderizarse cuando `academy.tier` no cubre la feature de la página
(mismo criterio que el paywall: `academyHasFeature` sobre
`academy.tier`, con trial vigente resolviendo STUDIO y trial
vencido/sin suscripción resolviendo nada). La página de destino del
alta sigue gateada por su cuenta como segunda línea.

#### Scenario: COBROS en listado de series

- **GIVEN** una academia con tier COBROS (sin feature `classes`)
- **WHEN** el owner abre `/academia/series`
- **THEN** ve el paywall del tier y NO ve el botón `+ Nueva` en el
  header

#### Scenario: COBROS en equipo

- **GIVEN** una academia con tier COBROS (sin feature `staff`)
- **WHEN** el owner abre `/academia/equipo`
- **THEN** ve el paywall del tier y NO ve el botón de agregar
  colaborador

### Requirement: un solo CTA de crear por pantalla

En listados de consola SHALL existir exactamente un CTA de crear: el
de `ConsoleHeader.actions`. El empty state del listado SHALL mostrar
solo mensaje (sin botón duplicado en ninguna variante), salvo cuando
la página no tiene header CTA propio.

#### Scenario: empty state de promos

- **GIVEN** una academia sin promos
- **WHEN** el owner abre `/academia/promos`
- **THEN** el empty state muestra el mensaje y el único botón `+
  Nueva promo` es el del header

## MODIFIED Requirements

### Requirement: crear otra academia desde la consola

El owner con rol ACADEMY_OWNER (APPROVED o SANDBOX) SHALL ver un CTA
"Nueva academia" en su consola aunque ya tenga una o más academias
cuando alguna propia cubre `multiAcademy` (o con bypass de admin de
plataforma); junto al selector de academia cuando hay varias, dentro
de él cuando hay una. La consola del owner es `/inicio`
(AcademyDashboard embebido en HomeHub): el selector y el CTA SHALL
renderizarse ahí. El hub `/academia`, consola de
staff/instructor/ADMIN, SHALL conservar el mismo selector para
quienes tienen membresía en más de una academia. **El selector SHALL
NO renderizarse cuando el actor tiene una sola membresía y no puede
agregar academia (`owned.length <= 1 && !canAddAcademy`)**: un
selector de una opción sin acción es ruido. El CTA navega a una
página dedicada `/academia/nueva` (crear = página, no form inline en
el listado). Tras crear, la academia nueva queda seleccionada
(`omnidance:academy-id`) y la navegación vuelve al home.

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

#### Scenario: owner de una sola academia sin multiAcademy

- **GIVEN** un owner con exactamente una academia propia en tier sin
  `multiAcademy` (ej. COBROS)
- **WHEN** abre `/inicio` o `/academia`
- **THEN** el selector NO se renderiza

#### Scenario: deep-link sin permiso

- **WHEN** una persona sin rol ACADEMY_OWNER entra a `/academia/nueva`
- **THEN** ve el estado "sin acceso" con CTA de salida; el form no se
  monta

#### Scenario: CTA oculto para no-owner

- **WHEN** un instructor o staff (sin ACADEMY_OWNER) entra a la
  consola
- **THEN** no ve el CTA "Nueva academia"
