# Proposal: importación masiva de alumnos con campos mínimos

## Resumen

La importación de alumnos (`POST /academies/:id/import/students`) hoy
exige `email, nombre, plan` en un CSV. El owner decidió bajar la
fricción: el archivo (csv o xls/xlsx) SHALL exigir solo
**`nombre` + `email`**, con columnas opcionales
**`rut`/`dni`, `fecha_nacimiento`, `telefono`, `sexo`**. `plan` y
`pagado_hasta` quedan opcionales (se conserva la funcionalidad: con
plan → inscripción como hoy).

## Alcance

- **Columnas**: required `email`, `nombre`. Opcionales: `plan`,
  `pagado_hasta`, `telefono`, `rut`/`dni` (alias aceptados:
  `rut`, `dni`, `documento`), `fecha_nacimiento`, `sexo`. Columna
  desconocida se ignora (comportamiento actual de
  `csvRowsToObjects`).
- **Sin plan**: `Enrollment.planId` ya es nullable - la fila crea/
  actualiza la Person y la inscribe como alumna SIN plan
  (Enrollment con `planId: null`) + invitación; con plan, semántica
  actual intacta (upsert endsAt = max, plan declarado).
- **RUT/DNI**: campo nuevo `Person.nationalId String?` (migración;
  sin unique - documentos se repiten entre jurisdicciones y el dedup
  de importación es por email).
- **Sexo**: `sexo` acepta `m|f|otro` + alias (masculino/femenino/
  male/female/otro/x, case-insensitive) → `Gender` enum; valor no
  reconocido → error de fila (estilo de validación existente).
- **Fecha nacimiento**: `fecha_nacimiento` acepta `dd/mm/yyyy` e ISO
  `yyyy-mm-dd` → `Person.birthDate`.
- **XLS/XLSX**: el endpoint acepta `.csv`, `.xls`, `.xlsx` (por
  extensión/MIME del upload); misma cota de filas que CSV. Nueva
  dependencia de parseo (SheetJS `xlsx` o equivalente, versión
  pineada ≥7 días publicada).
- **Front**: template descargable y copy de `/academia/
  configuracion/importar` se actualizan a los campos nuevos.
- Sin cambio en el import de horario.

## Fuera de alcance

- Dedup por documento (el match sigue por email).
- Validación de dígito verificador de RUT chileno (el campo se
  guarda tal cual normalizado; es dato administrativo del alumno).
