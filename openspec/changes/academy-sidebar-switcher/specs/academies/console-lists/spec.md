## ADDED Requirements

### Requirement: Selector de academia en la navegación del owner

La lente ACADEMY_OWNER SHALL montar un selector de academia arriba de
los grupos del drawer móvil y de la sidebar desktop cuando el owner
tiene más de una academia propia (`ownerId === me.id`) o alguna
academia propia cubre la feature `multiAcademy` (misma regla de
negocio que `POST /academies`, con bypass de admin de plataforma).
El selector SHALL listar el mismo universo que el del hub
(`/academies/mine` con dedup por id y por nombre normalizado) y la
opción "Nueva academia" SHALL seguir la misma regla del hub (rol
ACADEMY_OWNER en estado APPROVED o PENDING + `multiAcademy` en alguna
propia, o admin de plataforma). La selección SHALL persistir en
`localStorage["omnidance:academy-id"]` y propagarse sin recarga de
página a `AcademyGate` y a los entitlements de la lente mediante un
evento de selección. Owners con una sola academia propia y sin
`multiAcademy` MUST NOT ver el selector: no aporta ninguna acción.

#### Scenario: owner multi-academia cambia desde la sidebar

- **GIVEN** un owner con dos academias propias en lente ACADEMY_OWNER
- **WHEN** elige la otra academia en el selector de la sidebar
  (desktop) o del drawer (mobile)
- **THEN** la selección persiste en `omnidance:academy-id` y la
  página de consola visible y los ítems gateados por feature reflejan
  la academia elegida sin recarga completa

#### Scenario: owner mono-academia sin multiAcademy no ve el selector

- **GIVEN** un owner con una sola academia propia en un tier sin
  `multiAcademy`
- **WHEN** abre el drawer o ve la sidebar
- **THEN** no se renderiza el selector de academia

#### Scenario: tier multiAcademy muestra el selector con una academia

- **GIVEN** un owner con una sola academia propia cuyo tier cubre
  `multiAcademy`
- **WHEN** abre el drawer o ve la sidebar
- **THEN** el selector aparece con su academia y la opción "Nueva
  academia", que navega a `/academia/nueva`

#### Scenario: membresías ajenas no habilitan el selector

- **GIVEN** un owner con una sola academia propia sin `multiAcademy`
  que además es instructor de otra academia
- **WHEN** abre el drawer o ve la sidebar
- **THEN** no se renderiza el selector: la regla de visibilidad mira
  academias propias, no membresías
