# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Tamaño de página por viewport

Las listas pesadas de la consola SHALL paginar 20 ítems por página en
desktop (viewport ≥ lg = 1024px) y 10 en mobile. La regla aplica por
igual a listados server-side (`pageSize` del query) y a listas
client-side ya descargadas (slice + `Pager` solo cuando exceden el
tamaño): roster de clase (reservados y lista de espera), listado de
clases particulares y próximas clases de la ficha de profesor. El
hook compartido `useConsolePageSize` (lib) SHALL resolver el valor
con `useSyncExternalStore` + `matchMedia`, y un cambio de viewport
SHALL volver a la primera página.

#### Scenario: roster largo en mobile

- **GIVEN** una clase con 24 reservados en un teléfono
- **WHEN** se abre `/academia/clases/[id]`
- **THEN** se ven 10 filas por página con `Pager`, y la numeración de
  la lista de espera conserva el offset de página

#### Scenario: mismo listado en desktop

- **GIVEN** el mismo roster en desktop ≥1024px
- **WHEN** se abre la ficha
- **THEN** caben 20 filas por página

#### Scenario: próximas clases del profesor

- **GIVEN** un profesor con 30 clases próximas
- **WHEN** se abre `/academia/equipo/profesor/[id]`
- **THEN** la lista se pagina 20/10 con `Pager` dentro de la card
