## MODIFIED Requirements

### Requirement: /clases separa "mis academias" de "explorar"

La página `/clases` SHALL tener scopes `s=mias | explorar | historial` (con layout `v=list | calendar` en mias/explorar). `mias` SHALL mostrar solo clases de academias con inscripción vigente (`browse?scope=enrolled`); `explorar` SHALL mostrar todas las academias (`browse` sin scope). `historial` SHALL seguir incluyendo todas las clases pasadas del alumno, esté inscrito actualmente o no. El scope `explorar` SHALL existir solo cuando el flag `academy_explore` está ON; con el flag OFF la página opera con `mias | historial` (ver "Descubrimiento de academias detrás del flag academy_explore").

#### Scenario: Lista por defecto acotada

- WHEN un alumno inscrito abre /clases
- THEN la lista muestra solo clases de sus academias, agrupadas por día/hora

#### Scenario: Explorar sin inscripción en una academia

- WHEN un alumno abre s=explorar y una clase es de una academia sin inscripción vigente
- THEN la card muestra un estado "requiere inscripción" en vez del botón Reservar

#### Scenario: Sin inscripciones vigentes

- WHEN un alumno sin inscripciones vigentes abre /clases (list o calendar)
- THEN ve un empty state con CTA hacia explorar

#### Scenario: Explorar apagado por flag

- WHEN el flag `academy_explore` está OFF y un alumno abre /clases
- THEN la pill Explorar no se renderiza, un deep link `s=explorar` o `view=explore` legado normaliza a `mias` y ningún empty state invita a explorar

## ADDED Requirements

### Requirement: Descubrimiento de academias detrás del flag academy_explore

Los listados de descubrimiento del bailarín — scope `explorar` de `/academias` (directorio del resto de la escena, búsqueda por nombre) y scope `explorar` de `/clases` (clases de todas las academias con filtro por academia) — SHALL estar gateados por el flag `academy_explore` del mapa público `GET /features` (fail-closed: flag ausente = OFF). Con el flag OFF: la opción/pill explorar SHALL NOT renderizarse, los parámetros `s=explorar`, `v=explorar` y `view=explore` legado SHALL normalizar a `mias`, los CTAs que apuntan a explorar SHALL NOT mostrarse y los empty states SHALL NOT invitar a explorar. Con el flag OFF las fichas `/academias/:id` y `/clases/:id` SHALL seguir accesibles por link directo (son la vía de reclutamiento de cada academia) y los endpoints del API SHALL NOT cambiar: el gate es de superficie.

#### Scenario: Flag OFF oculta el scope explorar

- **WHEN** el flag `academy_explore` está OFF y un bailarín abre `/academias` o `/clases`
- **THEN** no aparece la opción Explorar ni los filtros exclusivos de ese scope (búsqueda por nombre, filtro por academia)

#### Scenario: Deep link a explorar con flag OFF

- **WHEN** el flag está OFF y un bailarín abre `/academias?s=explorar` o `/clases?s=explorar`
- **THEN** la página muestra el scope `mias`

#### Scenario: Bailarín sin inscripciones con flag OFF

- **GIVEN** un bailarín sin enrollments **WHEN** abre `/academias` con el flag OFF
- **THEN** cae en el scope `mias` con su empty state, sin CTA que apunte a explorar

#### Scenario: Ficha viva por link directo

- **GIVEN** el flag OFF **WHEN** un bailarín abre `/academias/:id` o `/clases/:id` por link directo
- **THEN** la ficha renderiza con normalidad; en la ficha de academia el link "Explorar más clases" no se muestra

#### Scenario: Flag ON conserva el comportamiento actual

- **WHEN** el flag `academy_explore` está ON (default del seed)
- **THEN** los scopes `mias | explorar | historial` de `/clases` y `mias | explorar` de `/academias` funcionan como antes
