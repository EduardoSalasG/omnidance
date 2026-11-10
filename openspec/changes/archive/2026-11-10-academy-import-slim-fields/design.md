# Design: importación de alumnos con campos mínimos

## Contrato de columnas

| Columna | Obligación | Mapeo |
|---|---|---|
| `email` | required | Person.email (dedup) |
| `nombre` | required | Person.name |
| `plan` | optional | MembershipPlan por normLabel (como hoy); ausente → Enrollment con `planId: null` |
| `pagado_hasta` | optional | endsAt del enrollment (como hoy, parsePaidThrough) |
| `telefono` | optional | Person.phone E.164 + phoneCountryCode (lógica existente, colisión @unique → se omite como hoy) |
| `rut`/`dni`/`documento` | optional | **Person.nationalId** (campo nuevo, sin unique) |
| `fecha_nacimiento` | optional | Person.birthDate (`dd/mm/yyyy` o `yyyy-mm-dd`) |
| `sexo` | optional | Person.gender (`m/f/otro` + alias comunes, case-insensitive) |

El endpoint baja `required` de `["email","nombre","plan"]` a
`["email","nombre"]`. La semántica por fila se conserva donde el
dato exista: plan declarado → upsert enrollment con ese plan y
endsAt=max como hoy; sin plan → `Enrollment` con `planId:null` (la
columna ya es nullable) e invite igual. Update por email solo toca
los campos que la fila trae (no borra datos previos: nationalId/
birthDate/gender se setean si vienen, se conservan si la celda está
vacía - misma regla que `telefono` hoy).

## Schema

`Person.nationalId String?` + migración versionada (`pnpm db:migrate`).
Sin índice ni unique: los documentos no son clave de dedup (email lo
es) y formatos se repiten entre países.

## Parseo XLS/XLSX

`parseCsvFile` se generaliza a `parseImportFile`: `.csv` → parser
actual; `.xls`/`.xlsx` (extensión o MIME) → `xlsx` (SheetJS, hoja 1,
`raw:false` para strings tal cual; versión pineada ≥7 días). Misma
cota `CSV_MAX_ROWS` y mismos errores (archivo faltante, sin filas,
columnas faltantes con mensaje igual).

## Errores de fila (estilo actual)

- `email` inválido / ausente → "email inválido"
- `nombre` vacío → "nombre requerido"
- `plan` declarado inexistente → "plan ... no existe"
- `sexo` no mapeado → error de fila
- `fecha_nacimiento` no parseable → error de fila
- `rut`/`dni`: se normaliza (trim, uppercase, sin puntos/guion para
  formato chileno; DNI libre para otros países) - sin validación de
  dígito verificador.

## Front

`/academia/configuracion/importar`: template descargable con las
columnas nuevas (orden: email,nombre,rut,fecha_nacimiento,telefono,
sexo,plan,pagado_hasta), copy de campos requeridos/opcionales y del
formato aceptado (csv/xls/xlsx). Keys i18n solo es-CL.
