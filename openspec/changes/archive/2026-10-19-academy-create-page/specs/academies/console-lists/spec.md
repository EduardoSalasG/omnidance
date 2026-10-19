# academies/console-lists — delta academy-create-page

## ADDED Requirements

### Requirement: crear otra academia desde la consola

El owner con rol ACADEMY_OWNER (APPROVED o SANDBOX) SHALL ver un CTA
"Nueva academia" en la consola `/academia` aunque ya tenga una o más
academias — junto al selector cuando hay varias, solo cuando hay una.
El CTA navega a una página dedicada `/academia/nueva` (crear = página,
no form inline en el listado) con `ConsoleHeader` de vuelta a
`/academia`. Tras crear, la academia nueva queda seleccionada
(`omnidance:academy-id`) y la navegación vuelve al hub.

#### Scenario: owner con una academia crea la segunda

- **WHEN** un owner con una academia toca "Nueva academia", completa el
  nombre y confirma
- **THEN** `POST /academies` crea la fila, la selección persiste la
  nueva y la consola muestra el selector con dos opciones y la nueva
  activa

#### Scenario: deep-link sin permiso

- **WHEN** una persona sin rol ACADEMY_OWNER entra a `/academia/nueva`
- **THEN** ve el estado "sin acceso" con CTA de salida — el form no se
  renderiza (el backend igual rechaza sin `academies.create`)

#### Scenario: CTA oculto para no-owner

- **WHEN** un instructor o staff (sin ACADEMY_OWNER) entra a la
  consola
- **THEN** no ve el CTA "Nueva academia"
