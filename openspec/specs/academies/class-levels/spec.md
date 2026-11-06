# academies/class-levels Specification

## Purpose
TBD - created by archiving change academia-gaps-cierre. Update Purpose after archive.

## Requirements

### Requirement: Línea de niveles propia o herencia global

La academia SHALL definir su propia línea de niveles (`ClassLevel` con
`academyId`) o heredar la línea global (`academyId: null`, la que usan
los sociales y edita el negocio en /admin/catalogos). Sin filas propias
la academia usa la global (`usingGlobal: true`); con una o más filas
propias su línea reemplaza a la global solo para esa academia. El
mantenedor (`GET/POST/PATCH/DELETE /academies/:id/class-levels`)
requiere la capability `schedule` (lectura) o su escritura
(`requireCapabilityWrite`) **y la feature de tier `classes`** - una
academia sin clases (COBROS) recibe 403 `tier.required` en todo el
mantenedor, no solo en la consola.

#### Scenario: Herencia por defecto

- **WHEN** una academia no tiene niveles custom
- **THEN** `GET /academies/:id/class-levels` responde
  `usingGlobal: true` y el insight/agenda numeran la línea global

#### Scenario: COBROS no mantiene niveles

- **GIVEN** una academia tier COBROS (sin feature `classes`)
- **WHEN** el owner llama cualquier endpoint de `class-levels`
- **THEN** la API responde 403 `tier.required` (feature `classes`,
  requiredTier STUDIO)

#### Scenario: Borrado de nivel en uso rechazado

- **WHEN** se intenta `DELETE /academies/:id/class-levels/:levelId`
  sobre un nivel referenciado por series o `EnrollmentLevel`
- **THEN** la API responde 409 y el nivel queda intacto

### Requirement: Reset a la línea global

`DELETE /academies/:id/class-levels` SHALL borrar todos los niveles
custom de la academia en una sola operación (vuelta a la línea
global), con la misma capability de escritura que el resto del
mantenedor. Si algún nivel custom está en uso (series o
`EnrollmentLevel`), la API SHALL responder 409 sin borrar nada, con
los nombres de los niveles bloqueados en el mensaje. La consola SHALL
ofrecer la acción "Volver a la línea global" con confirmación previa.

#### Scenario: Reset limpio

- **GIVEN** una academia con 3 niveles custom sin uso
- **WHEN** el owner confirma "Volver a la línea global"
- **THEN** se borran los 3 en una sola llamada y
  `usingGlobal` vuelve a `true`

#### Scenario: Reset bloqueado por uso

- **GIVEN** el nivel custom "Pro" referenciado por una serie
- **WHEN** se intenta el reset
- **THEN** la API responde 409 nombrando "Pro", no borra ningún nivel
  y la UI muestra el motivo

### Requirement: Línea efectiva en catálogos y selects

`GET /classes/catalogs` SHALL aceptar `academyId` opcional. Sin el
parámetro devuelve solo la línea global (`academyId: null`); con él
devuelve la línea efectiva de esa academia (sus niveles custom si
tiene al menos uno, la global si no) - nunca la mezcla de ambas ni
customs de otras academias. Todo select/filtro de nivel de la consola
de academia (formulario de serie, filtro del listado de clases,
editor de niveles del alumno) SHALL poblar sus opciones desde esa
línea efectiva, no del catálogo completo.

#### Scenario: Academia con línea custom

- **GIVEN** Mambo Madness con 5 niveles custom
- **WHEN** la consola pide `GET /classes/catalogs?academyId=<mambo>`
- **THEN** `levels` trae solo sus 5 customs y el select de nivel de la
  serie no muestra "Básico" duplicado

#### Scenario: Academia sin línea custom

- **GIVEN** una academia sin niveles propios
- **WHEN** pide `GET /classes/catalogs?academyId=<id>`
- **THEN** `levels` trae la línea global

#### Scenario: Catálogo público sin academia

- **WHEN** un cliente pide `GET /classes/catalogs` sin `academyId`
- **THEN** `levels` trae solo la línea global, sin customs de ninguna
  academia

### Requirement: Ubicación del mantenedor en Configuración

El mantenedor de la línea de niveles SHALL vivir en la sección
Configuración de la consola de academia
(`/academia/configuracion/niveles`), no entre los módulos operativos
del drawer: es una configuración de una vez, al mismo nivel que los
valores por defecto de clases, los métodos de pago o el perfil
público. El item del drawer SHALL listarse dentro del grupo
`navGroups.config` y conservar el gate `academyFeature: "classes"`.
La ruta anterior `/academia/niveles` SHALL redirigir a la nueva para
no romper deep-links existentes.

#### Scenario: Drawer de la consola owner

- **WHEN** el owner abre el drawer de su consola
- **THEN** "Niveles" aparece dentro del grupo Configuración y ya no en
  el grupo Enseñanza

#### Scenario: Deep-link viejo

- **WHEN** se navega a `/academia/niveles`
- **THEN** se redirige a `/academia/configuracion/niveles` y el
  mantenedor funciona igual

### Requirement: Personalizar copia la línea global como propia

El botón "Personalizar niveles" (en
`/academia/configuracion/niveles` y en `/niveles/nuevo` cuando la
academia aún hereda la global) SHALL crear un nivel propio por cada
nivel global visible, enviando `{name, order}` con
`Content-Type: application/json` igual que el alta manual: la
operación SHALL completar sin errores de validación y dejar a la
academia en modo custom con la línea copiada.

#### Scenario: copiar la línea global

- **GIVEN** una academia sin niveles propios y la línea global con
  4 niveles nombrados
- **WHEN** el owner presiona "Personalizar niveles"
- **THEN** se crean 4 niveles propios con los mismos nombres y orden,
  el aviso de éxito se muestra y el listado pasa a modo custom
