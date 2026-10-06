# academies/bulk-import — deltas

## ADDED Requirements

### Requirement: Parser CSV

`parseCsv(text)` SHALL parsear UTF-8 con BOM opcional, separador `,`,
campos entrecomillados con escape `""`, saltos `\r\n`/`\n`, y devolver
`{header: string[], rows: string[][]}` (header normalizado a
lowercase-trim). Archivos con filas inconsistentes SHALL producir error
de fila, no crash. Límite: 500 filas de datos → 400 si excede.

#### Scenario: campos con comas y comillas

- **WHEN** una fila es `"Pérez, Ana",ana@x.cl` con campo entrecomillado
- **THEN** parsea como 2 campos (`Pérez, Ana` y `ana@x.cl`) sin cortar

#### Scenario: BOM y CRLF

- **WHEN** el texto empieza con BOM UTF-8 y usa `\r\n`
- **THEN** el primer header se lee limpio y cada línea es una fila

### Requirement: Import masivo de alumnos

`POST /academies/:id/import/students` (multipart `file`, capacidad
`students`) SHALL procesar el CSV por fila:

- Columnas requeridas: `email`, `nombre`, `plan`. Opcionales:
  `telefono`, `pagado_hasta` (YYYY-MM-DD).
- Person: match por email normalizado; si no existe SHALL crear stub
  `{email, name:nombre, phone?}` + enviar email de invitación con magic
  link largo (fila → `invited`). Si existe → `linked`/`updated`.
- Plan: match por nombre contra `MembershipPlan` activos de la academia
  (case/accent-insensitive); sin match → error de fila `plan_not_found`.
- Enrollment: si existe ACTIVE/TRIAL/ONLINE para la academia SHALL
  actualizar `planId` al importado y `endsAt` = max(existente, importada);
  si no SHALL crear `ACTIVE{startedAt:now, planId, endsAt}`.
- `pagado_hasta` SHALL interpretarse como fin del día Chile (mediodía
  UTC aprox., misma convención que alta staff) — vacío → `endsAt` null.
- Respuesta: `{total, imported, updated, invited, errors:[{row,message}]}`.

#### Scenario: alumno nuevo invitado

- **WHEN** la fila trae email nuevo + plan "Mensual" + pagado_hasta
- **THEN** se crea Person stub + Enrollment ACTIVE con endsAt y se envía
  email con link de acceso largo; la fila cuenta `invited`

#### Scenario: alumno existente actualiza vigencia

- **WHEN** el email ya tiene Enrollment ACTIVE con endsAt menor
- **THEN** `endsAt` sube al importado, `planId` se actualiza; fila `updated`

#### Scenario: plan inexistente

- **WHEN** `plan` no calza ningún plan activo de la academia
- **THEN** la fila es error `plan_not_found` y no toca datos

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
capacidad correspondiente (students / schedule).

#### Scenario: descarga con ejemplo

- **WHEN** el owner pide `template/students`
- **THEN** recibe un CSV cuya primera línea son los headers exactos y la
  segunda una fila de ejemplo válida
