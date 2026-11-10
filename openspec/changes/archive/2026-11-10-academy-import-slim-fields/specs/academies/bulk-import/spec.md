# Delta: academies/bulk-import (campos mínimos + xlsx)

## MODIFIED Requirements

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
`students`, csv o xls/xlsx) SHALL procesar el archivo por fila:

- Columnas requeridas: `email`, `nombre`. Opcionales: `plan`,
  `pagado_hasta` (YYYY-MM-DD), `telefono`, `rut`/`dni`/`documento`,
  `fecha_nacimiento` (DD/MM/YYYY o YYYY-MM-DD), `sexo`
  (m/f/otro + alias comunes).
- Person: match por email normalizado; si no existe SHALL crear stub
  `{email, name:nombre, phone?, nationalId?, birthDate?, gender?}` +
  enviar email de invitación con magic link largo (fila → `invited`).
  Si existe → `linked`/`updated`; en update solo se sobreescriben los
  campos presentes en la fila (celda vacía conserva el dato previo).
- `rut`/`dni`/`documento` (alias equivalentes) SHALL persistirse en
  `Person.nationalId` normalizado (sin validación de dígito
  verificador; sin unique - el dedup es por email).
- `sexo` SHALL mapear a `Gender` (m→M, f→F, otro/alias→OTHER); valor
  no reconocido → error de fila.
- `fecha_nacimiento` SHALL mapear a `Person.birthDate`; no parseable →
  error de fila.
- Plan: match por nombre contra `MembershipPlan` activos de la academia
  (case/accent-insensitive); declarado y sin match → error de fila
  `plan_not_found`; celda vacía/columna ausente → `planId` null.
- Enrollment: si existe ACTIVE para la academia SHALL actualizar
  `planId` al importado (o null si no viene) y `endsAt` =
  max(existente, importada); si no SHALL crear
  `ACTIVE{startedAt:now, planId, endsAt}`.
- `pagado_hasta` SHALL interpretarse como fin del día Chile (mediodía
  UTC aprox., misma convención que alta staff); vacío → `endsAt` null.
- Respuesta: `{total, imported, updated, invited, errors:[{row,message}]}`.

#### Scenario: fila mínima

- **WHEN** la fila solo trae `email` + `nombre` sin más columnas
- **THEN** se crea/vincula la Person + Enrollment ACTIVE con
  `planId:null` y se envía invitación; la fila cuenta `invited`/`linked`

#### Scenario: alumno nuevo invitado

- **WHEN** la fila trae email nuevo + plan "Mensual" + pagado_hasta
- **THEN** se crea Person stub + Enrollment ACTIVE con endsAt y se envía
  email con link de acceso largo; la fila cuenta `invited`

#### Scenario: alumno existente actualiza vigencia

- **WHEN** el email ya tiene Enrollment ACTIVE con endsAt menor
- **THEN** `endsAt` sube al importado, `planId` se actualiza; fila `updated`

#### Scenario: plan inexistente

- **WHEN** `plan` declarado no calza ningún plan activo de la academia
- **THEN** la fila es error `plan_not_found` y no toca datos

#### Scenario: campos opcionales nuevos

- **WHEN** la fila trae `rut`, `fecha_nacimiento`, `sexo` válidos
- **THEN** se persisten `nationalId`, `birthDate`, `gender` en la
  Person; un `sexo`/`fecha_nacimiento` inválido reporta error de fila
  sin abortar el import

### Requirement: Plantillas descargables

`GET /academies/:id/import/template/students` y `.../schedule` SHALL
devolver `text/csv` con headers y una fila de ejemplo, gated por la
capacidad correspondiente (students / schedule). El template de
alumnos SHALL usar el orden de columnas del contrato vigente
(`email,nombre,rut,fecha_nacimiento,telefono,sexo,plan,pagado_hasta`).

#### Scenario: descarga con ejemplo

- **WHEN** el owner pide `template/students`
- **THEN** recibe un CSV cuya primera línea son los headers exactos y la
  segunda una fila de ejemplo válida
