# academies/bulk-import Specification

## Purpose
TBD - created by archiving change academy-bulk-import. Update Purpose after archive.

## Requirements

### Requirement: Parser CSV

El parser de importación SHALL aceptar `.csv` (UTF-8 con BOM opcional,
separador `,`, campos entrecomillados con escape `""`, saltos
`\r\n`/`\n`, header normalizado a lowercase-trim) y `.xls`/`.xlsx`
(primera hoja, celdas como texto). El formato se detecta por extensión
y/o MIME del upload. Archivos con filas inconsistentes SHALL producir
error de fila, no crash. Límite: 500 filas de datos → 400 si excede.

#### Scenario: campos con comas y comillas

- **WHEN** una fila es `"Pérez, Ana",ana@x.cl` con campo entrecomillado
- **THEN** parsea como 2 campos (`Pérez, Ana` y `ana@x.cl`) sin cortar

#### Scenario: BOM y CRLF

- **WHEN** el texto empieza con BOM UTF-8 y usa `\r\n`
- **THEN** el primer header se lee limpio y cada línea es una fila

#### Scenario: archivo xlsx

- **WHEN** el upload es `.xlsx` con header `email,nombre` y filas de
  datos en la primera hoja
- **THEN** se procesan las mismas filas que el CSV equivalente

### Requirement: Import masivo de alumnos

`POST /academies/:id/import/students` (multipart `file`, capacidad
`students`, csv o xls/xlsx) SHALL procesar el archivo por fila como
**importación masiva de invitaciones**. El import SHALL NOT crear ni
modificar `Enrollment` - la inscripción nace cuando la persona compra
su plan o el staff la liquida (claim/settle), nunca de la planilla.

- Columnas requeridas: `email`, `nombre`. Opcionales: `telefono`,
  `rut`/`dni`/`documento`, `fecha_nacimiento` (DD/MM/YYYY o
  YYYY-MM-DD), `sexo` (m/f/otro + alias comunes). Las columnas legacy
  `plan`/`pagado_hasta` salen del contrato: un archivo que las traiga
  se procesa igual y sus valores se ignoran.
- Person: match por email normalizado; si no existe SHALL crear stub
  `{email, name:nombre, phone?, nationalId?, birthDate?, gender?}`.
  Si existe, solo se sobreescriben los campos presentes en la fila
  (celda vacía conserva el dato previo).
- Invite: cada fila válida SHALL aplicar el patrón `AcademyInvite`
  del alta individual (spec academies/student-invites): invite
  pendiente idempotente por `(academyId,email)` sin `consumedAt`
  (duplicado → reenvío sin nueva fila), correo con magic link 7d
  `next` a la ficha pública de la academia, push "te invitó" cuando
  el email ya tiene cuenta, `invitedById` = quien corre el import.
- Skip: email cuya Person tiene `Enrollment` ACTIVE en la academia →
  fila `skipped` sin invite ni mail (ya es alumno vigente).
  Enrollment INACTIVE o inexistente → invite normal.
- Respuesta: `{total, invited, resent, skipped,
  errors:[{row,message}], results:[{row,email,status,detail}],
  runId}`; `runId` identifica la corrida persistida (ver Historial de
  corridas).

#### Scenario: fila mínima

- **WHEN** la fila solo trae `email` + `nombre` de una persona nueva
- **THEN** se crea la Person stub + AcademyInvite pendiente + mail
  con magic link `next` a la ficha pública; la fila cuenta `invited`
  y NO existe enrollment

#### Scenario: alumno nuevo invitado

- **WHEN** la fila trae un email sin Person registrada
- **THEN** se crea Person stub + AcademyInvite pendiente y se envía
  el correo de invitación; la fila cuenta `invited`

#### Scenario: cuenta existente sin inscripción

- **WHEN** el email ya tiene Person registrada sin enrollment en la
  academia
- **THEN** queda invite + mail + push "te invitó"; la fila cuenta
  `invited`

#### Scenario: alumno existente actualiza vigencia

- **WHEN** el email ya tiene Enrollment ACTIVE en la academia
- **THEN** la fila cuenta `skipped`: no se crea ni reenvía invite, no
  se envía mail y la vigencia no cambia (el import ya no toca
  enrollments; los campos de Person presentes sí se actualizan)

#### Scenario: invite pendiente reenvía

- **WHEN** ya existe AcademyInvite pendiente para (academia, email)
- **THEN** se reenvía el correo sin duplicar la fila; cuenta `resent`

#### Scenario: plan inexistente

- **WHEN** la fila trae `plan` con un nombre que no existe (columna
  legacy de un template anterior)
- **THEN** el valor se ignora y la fila procesa normal - ya no hay
  error `plan_not_found` ni se escribe vigencia desde la planilla

#### Scenario: campos opcionales nuevos

- **WHEN** la fila trae `rut`, `fecha_nacimiento`, `sexo` válidos
- **THEN** se persisten `nationalId`, `birthDate`, `gender` en la
  Person; un `sexo`/`fecha_nacimiento` inválido reporta error de fila
  sin abortar el import

### Requirement: Import masivo de horario semanal

`POST /academies/:id/import/schedule` (multipart `file`, capacidad
`schedule`) SHALL agrupar filas por `serie`+`mes` (default mes en curso):

- Columnas requeridas: `serie`, `dia_semana`, `hora_inicio`, `hora_fin`.
  Opcionales: `estilo`, `nivel`, `capacidad`, `instructor_email`, `mes`.
- Serie: SHALL reutilizar `ClassSeries` activa de la academia con el
  mismo nombre y mes, o crearla (estilo/nivel por nombre contra catálogo;
  sin match → error de fila).
- Slot: dedup por `(seriesId, weekday, startTime)` → fila `skipped`;
  si no SHALL crear `ClassSlot` + materializar `Class` de las fechas del
  mes de la serie que caigan ese weekday (misma regla que POST /series).
- `dia_semana`: 0-6 o nombre español (domingo=0 … sábado=6); inválido →
  error de fila.
- `instructor_email`: resuelve `AcademyInstructor.person` por email; sin
  match → slot sin instructor + warn de fila (no error).
- Respuesta: `{total, series, slots, skipped, errors:[{row,message}]}`.

#### Scenario: dos filas misma serie distinto día

- **WHEN** filas "Bachata" lunes 20:00-21:30 y miércoles 20:00-21:30
- **THEN** una sola serie con dos slots y las Class del mes materializadas

### Requirement: Plantillas descargables

`GET /academies/:id/import/template/students` y `.../schedule` SHALL
devolver `text/csv` con headers y una fila de ejemplo, gated por la
capacidad correspondiente (students / schedule). El template de
alumnos SHALL usar el orden de columnas del contrato vigente
(`email,nombre,rut,fecha_nacimiento,telefono,sexo`) - sin `plan` ni
`pagado_hasta`.

#### Scenario: descarga con ejemplo

- **WHEN** el owner pide `template/students`
- **THEN** recibe un CSV cuya primera línea son los headers exactos y
  la segunda una fila de ejemplo válida

### Requirement: Teléfono del import normalizado

La columna `telefono` del CSV de alumnos SHALL normalizarse a E.164 con
el país de la academia como `defaultCountry`; una fila con teléfono
inválido SHALL reportarse como error de fila sin abortar el import.

#### Scenario: teléfono local de academia chilena

- **WHEN** la fila lleva `telefono=912345678` en una academia CL
- **THEN** la Person creada/matcheada usa `phone="+56912345678"`,
  `phoneCountryCode="CL"`

#### Scenario: teléfono inválido

- **WHEN** la fila lleva `telefono=abc`
- **THEN** la fila reporta `telefono inválido` y las demás filas siguen

### Requirement: Validación previa de la planilla (dry-run)

Los endpoints de import SHALL aceptar `?dryRun=1`: corren la misma
tubería de parseo, validación y clasificación por fila sin escribir
`Person`/`AcademyInvite`/`AcademyImportRun` ni enviar correos ni
push, y devuelven el resultado previsto por fila con los mismos
conteos que la corrida real (`runId:null`). La respuesta de dry-run
es la vista previa del resumen: qué se invita, qué se salta, qué
falla y por qué.

#### Scenario: dry-run no escribe

- **WHEN** se sube una planilla válida con `?dryRun=1`
- **THEN** la respuesta muestra `invited`/`resent`/`skipped`/`error`
  por fila y la DB no registra Person, invite ni corrida nuevas

#### Scenario: dry-run detecta errores de fila

- **WHEN** la planilla trae email inválido y fecha_nacimiento no
  parseable
- **THEN** esas filas reportan su error en la vista previa y el staff
  corrige antes de importar

### Requirement: Historial de corridas de import

Cada corrida real (no dry-run) de `/import/students` e
`/import/schedule` SHALL persistir un `AcademyImportRun` {academyId,
kind, fileName, conteos, results por fila, createdById, createdAt}.
`GET /academies/:id/import/runs` (cap `students`) SHALL listar las
corridas más nuevas primero con kind, archivo, fecha y conteos;
`GET /academies/:id/import/runs/:runId` SHALL devolver el detalle
fila a fila de la corrida.

#### Scenario: corrida queda en historial

- **WHEN** un import students procesa 12 filas (8 invited, 3 skipped,
  1 error)
- **THEN** el listado muestra la corrida con fecha, nombre de archivo
  y conteos, y su detalle reproduce las 12 filas con su status y
  detalle

#### Scenario: staff sin capacidad no ve historial

- **WHEN** un miembro sin capability `students` pide
  `/import/runs`
- **THEN** responde 403
