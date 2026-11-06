# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Back link contextual con `?from=`

Las páginas de edición y las fichas abiertas desde otra ficha de la
consola SHALL devolver al origen real, no al listado genérico. El
patrón es el ya existente del roster de clase: el link de origen pasa
`?from=<ruta interna>` y el `ConsoleHeader` del destino la usa como
`backHref` tras sanitizarla (`safeInternalPath`). Casos cubiertos:

- `/academia/planes/nueva?edit=<id>` SHALL volver a
  `/academia/planes/<id>` (la ficha del plan), no al listado.
- `/academia/series/nueva?edit=<id>` SHALL volver a
  `/academia/series/<id>` (la ficha de la serie), no al listado.
- Los links de alumno dentro de la ficha del plan SHALL llevar
  `from=/academia/planes/<id>` y la ficha de alumno
  (`/academia/alumnos/[personId]`) SHALL usarlo como back.
- Los links de clase dentro de la ficha del profesor
  (`/academia/equipo/profesor/[id]`) SHALL llevar
  `from=/academia/equipo/profesor/<id>` y el roster
  (`/academia/clases/[id]`) SHALL preferirlo sobre su padre canónico.

Un `from` ausente, vacío o no interno SHALL degradar al padre
canónico de cada página sin error.

#### Scenario: editar plan vuelve a su ficha

- **GIVEN** el owner en `/academia/planes/nueva?edit=abc`
- **WHEN** presiona el back del header
- **THEN** navega a `/academia/planes/abc`

#### Scenario: alumno abierto desde un plan

- **GIVEN** el owner en la ficha del plan `abc`
- **WHEN** toca un alumno de la lista "Alumnos con este plan" y luego
  el back de la ficha de alumno
- **THEN** vuelve a `/academia/planes/abc`

#### Scenario: clase abierta desde la ficha del profesor

- **GIVEN** el owner en `/academia/equipo/profesor/xyz`
- **WHEN** toca una próxima clase y luego el back del roster
- **THEN** vuelve a `/academia/equipo/profesor/xyz`

#### Scenario: `from` inválido

- **WHEN** el owner abre `/academia/alumnos/p1?from=https://evil.test`
- **THEN** el back va al padre canónico `/academia/alumnos`

### Requirement: Copy de consola sin tecnicismos

El copy visible para el owner SHALL usar lenguaje de negocio, no
nombres de campo, flags ni enums crudos. En particular: el hint de la
KPI "Planes activos" SHALL describir que son los planes comprables
ahora (no `active=true`); el hint de las KPI por plan SHALL describir
"alumnos con ese plan vigente"; el pie del card "Niveles y cupos"
SHALL reflejar la regla vigente de un nivel por tipo (sin disclaimers
de doble conteo); los tipos de plan del form SHALL tener labels
claros y una ayuda breve por tipo, y con tipo `SINGLE` el input de
clases SHALL ocultarse enviando `classCount=1` implícito.

#### Scenario: hints de KPI legibles

- **WHEN** el owner abre `/academia/planes`
- **THEN** las leyendas de las KPI cards no contienen `active=true`
  ni describen un ranking: la primera explica "planes comprables" y
  las de plan, "alumnos con ese plan vigente"

#### Scenario: clase única sin input de clases

- **WHEN** el owner crea un plan y elige el tipo "Clase única"
- **THEN** el input de clases no se muestra y el POST envía
  `classCount: 1`

### Requirement: Listado de series ignora respuestas fuera de orden

El fetch del listado `/academia/series` SHALL aplicar solo el
resultado del request más reciente: una respuesta (éxito o error)
que llega después de un request más nuevo SHALL descartarse, para
que una falla tardía no pise datos ya cargados ni un éxito viejo
pise filtros más recientes.

#### Scenario: falla tardía no pisa la lista

- **GIVEN** dos requests del listado en vuelo (doble efecto en dev o
  cambio rápido de filtros)
- **WHEN** el request más nuevo resuelve OK y luego el viejo falla
- **THEN** la lista cargada se conserva sin banner de error
