# Design: academy-invite-first-polish

## Decisiones

- **Una sola clave renombrada**: `academy.newEnrollment` pasa de
  "Nueva inscripción" a "Inscripción manual" (es) / "Manual enrollment"
  (en) / "Inscription manuelle" (fr) / "Inscrição manual" (pt-PT). La
  misma clave titula el form de `/alumnos/nuevo`: botón y destino
  dicen lo mismo, sin claves nuevas.
- **Invitar primario, manual secundario**: swap de `variant` en
  `StudentsSection` (Invitar → default primario; manual →
  `secondary`). Se conserva el orden visual Invitar → manual y el
  anchor de tour `academy-alumnos-new` que envuelve ambos.
- **Valores por columna como `<dl>`**: lista compacta col (mono) →
  valores aceptados, solo para las columnas con formato restringido.
  `studentsCols`/`scheduleCols` siguen listando los nombres; los
  valores van en `studentsValues`/`scheduleValues` (arrays `{col,
  values}`) para no inflar una sola línea ilegible.
- **Fixtures deterministas**: el enrich usa las mismas reglas de
  idempotencia del spec academy-demo-seed: run por clave natural
  `(academyId, kind, fileName)` e invites por `(academyId, email)`
  pendiente; `invitedById`/`createdById` = `academy.ownerId`.

## Detalle

### Import: valores por columna (es)

- students: `sexo` → `m · f · otro`; `fecha_nacimiento` → `DD/MM/YYYY`
  (también `YYYY-MM-DD`); `telefono` → `+56 9 1234 5678` (se
  normaliza al país de la academia); `rut` → `12.345.678-9` (o
  `dni`/`documento`).
- schedule: `dia_semana` → `lunes … domingo` o `0-6` (domingo = 0);
  `hora_inicio`/`hora_fin` → `HH:MM`; `capacidad` → entero;
  `estilo`/`nivel` → tal como están en la consola (match sin
  acentos/mayúsculas); `instructor_email` → email de un instructor de
  la academia; `mes` → `YYYY-MM` (opcional, etiqueta).

Render: `<dl>` bajo el párrafo de columnas, antes de la fila de
acciones; `dt` `font-mono text-ink/50`, `dd` `text-ink/40`.

### Seed fixtures

- 1 `AcademyImportRun` por academia activa: `kind=students`,
  `fileName` determinista (`import-alumnos.csv`), `total` ~12,
  `counts` derivados de un `results` realista (invited ~7, resent ~2,
  skipped ~2 — duplicado y vigente —, error ~1 con los `detail`
  textuales del servicio).
- 2 `AcademyInvite` pendientes por academia: emails deterministas
  `invitado.{i}.{slug}@omnidance.dev` (sin Person: pendiente real),
  `createdAt` reciente.
- Idempotente: `findFirst` por clave natural antes de crear;
  re-corrida reporta 0 nuevos.
