# Delta — academies/class-series

## ADDED Requirements

### Requirement: Serie vigente hasta su desactivación

Las series de clases SHALL ser ilimitadas: `month` en
`POST /academies/:id/series` pasa a opcional y deja de ser la vigencia
de la serie. Cuando se omite se persiste el mes actual como etiqueta de
origen (orden del listado); cuando se envía (clientes legacy / import)
se materializa además el resto de ese mes.

La vigencia real la da una **ventana rodante de materialización**: los
`Class` se crean desde hoy UTC hasta el último día del mes siguiente,
en create, al agregar horarios (`addSlots`), al reactivar una serie
inactiva y mediante un job diario `academies.class_materialization`
registrado en `ScheduledJob` (default cron `30 3 * * *`) que materializa
la ventana para todos los slots de series activas. La materialización
SHALL ser idempotente (descancela existentes, crea solo faltantes, sin
duplicar slot+fecha).

La serie solo deja de generar clases cuando `active=false`
(desactivación o eliminación de slot cancelan las clases futuras y
devuelven las reservas — comportamiento existente).

#### Scenario: crear sin mes

- **GIVEN** un owner que crea una serie sin `month`
- **WHEN** el POST se ejecuta
- **THEN** se materializan las clases de sus slots desde hoy hasta fin
  del mes siguiente y la serie queda activa sin vigencia límite

#### Scenario: rollover mensual

- **GIVEN** una serie activa con slot los martes creada en octubre
- **WHEN** corre el job diario en noviembre
- **THEN** existen clases de esa serie hasta fin de diciembre sin
  duplicar las ya creadas

#### Scenario: desactivar detiene la materialización

- **GIVEN** una serie con `active=false`
- **WHEN** corre el job diario
- **THEN** no se materializan clases nuevas para sus slots

### Requirement: Cupos y modalidad a nivel de serie

Los cupos (`quorum`) y las modalidades (`typeIds`) SHALL definirse una
sola vez a nivel serie — `series.quorum` override del
`defaultQuorum` de la academia, `series.types` para las modalidades.
Los horarios semanales (slots) MUST NOT aceptar `capacity` ni `typeIds`
propios en la API ni exponerlos en la UI: un slot define `weekday`,
`startTime`, `endTime` e `instructorId` opcional (override docente del
horario).

Las columnas legacy (`ClassSlot.capacity`, `ClassSlotType`) MAY seguir
existiendo para datos históricos, pero el contrato nuevo no las
escribe — el quórum efectivo se resuelve `slot.capacity ?? series.quorum
?? academy.defaultQuorum` como hoy.

#### Scenario: agregar segundo horario

- **GIVEN** una serie con un horario martes 19:00
- **WHEN** el owner agrega un horario jueves 20:00
- **THEN** el payload solo lleva `weekday`, `startTime`, `endTime` (+
  `instructorId` opcional) y el slot hereda cupos y modalidad de la
  serie

### Requirement: Formulario de nueva serie

El formulario de `/academia/series/nueva` MUST NOT incluir el input de
mes de vigencia ni el botón Cancelar (el regreso lo provee el chrome:
back del appbar/ConsoleHeader). El título contextual de la página SHALL
ser "Nueva serie de clases".

#### Scenario: crear serie

- **GIVEN** el owner en `/academia/series/nueva`
- **WHEN** la página carga
- **THEN** el título dice "Nueva serie de clases", no hay campo de mes,
  los horarios solo piden día/hora/instructor, y no existe botón
  Cancelar
