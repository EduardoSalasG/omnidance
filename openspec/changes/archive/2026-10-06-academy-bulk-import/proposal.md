# academy-bulk-import

## Why

Migración de academias desde otra plataforma: el owner llega con su
nómina de alumnos (con vigencias ya pagadas afuera) y su horario semanal
armados en Excel. Entrar todo a mano es inviable — la carga masiva CSV
es el onboarding real de una academia nueva. Además cada alumno importado
que no tiene cuenta debe recibir un email para crearla.

## What Changes

- **Import de alumnos** (`POST /academies/:id/import/students`, cap
  `students`, multipart CSV): columnas `email,nombre,telefono?,plan,
  pagado_hasta?`. Por fila: normaliza email → Person existe (link) o stub
  `{email,name,phone}` + email de invitación con magic link largo
  (mismo mecanismo del staff invite) → Enrollment: si existe vigente para
  la academia se actualiza `endsAt` (max del existente vs el importado) y
  `planId`; si no, se crea `ACTIVE` con `startedAt=now`, plan resuelto por
  nombre (match case/accent-insensitive contra los planes activos de la
  academia). `pagado_hasta` (YYYY-MM-DD) → `endsAt` mediodía Chile.
  Resultado por fila: `imported | updated | invited | error` con detalle.
- **Import de horario** (`POST /academies/:id/import/schedule`, cap
  `schedule`, multipart CSV): columnas `serie,estilo?,nivel?,dia_semana,
  hora_inicio,hora_fin,capacidad?,instructor_email?,mes?`. Agrupa por
  `serie`+`mes` (default mes en curso) → `ClassSeries` (upsert por nombre)
  + `ClassSlot` por cada fila (dedup por weekday+startTime) + materializa
  las `Class` del mes igual que `POST /series`. `dia_semana` acepta
  0-6 o nombre en español (domingo=0). `instructor_email` resuelve contra
  instructores de la academia; no encontrado → slot sin instructor + warn.
  Estilo/nivel sin match en catálogo → error de fila (no auto-crea
  catálogos).
- **Plantillas descargables**: `GET /academies/:id/import/template/
  students|schedule` → CSV con header + fila de ejemplo.
- **Parser CSV propio** (`src/common/csv.ts`): separador `,`, campos
  entre comillas con `""` escape, `\r\n`/`\n`, BOM tolerado, límite 500
  filas. Sin dependencia nueva.
- UI: sección `/academia/importar` con descarga de plantillas, upload y
  reporte por fila (importados/invitados/errores).

## Non-goals

- Sin import de pagos históricos ni asistencia.
- Sin auto-crear planes ni catálogos (Style/ClassLevel) — una fila con
  plan inexistente es error de esa fila, no del archivo.
- Sin modo dry-run por separado: el reporte por fila ya es la
  previsualización (el import es idempotente por dedup).

## Impact

- API: 2 endpoints POST + 2 GET template; parser util; emails de
  invitación reusan `createMagicToken` con TTL (de staff-roles).
- Web: página `/academia/importar`.
- Seguridad: multipart límite 5MB/500 filas; emails solo a cuentas
  importadas explícitamente por el owner.
