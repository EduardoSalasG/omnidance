# role-console-polish

## Why

`role-console-depth` ya entregó la profundidad de consolas (stats de
eventos, live, dashboards de venue/academia, rating del DJ). El residual
real del rol **instructor** es económico: `PrivateLesson.commissionPct`
existe en el schema pero **siempre es 0** — nada lo configura — y el
instructor no tiene vista de sus clases particulares con lo que le
corresponde. La consola de academia se comparte owner/instructor, pero el
instructor solo ve la lista staff si tiene acceso; su vista propia
(`GET /private-lessons/mine?as=instructor`, ya implementada) no se
consume en la web.

## What Changes

- **`AcademyInstructor.commissionPct Int?`** — comisión que cobra la
  academia sobre el precio de cada clase particular de ese instructor
  (null/0 = sin comisión). Migración versionada.
- **`PATCH /academies/:id/instructors/:personId {commissionPct}`** —
  solo owner/admin (`requireAdminister`). Rango 0–100.
- **Snapshot al crear**: `POST /academies/:id/private-lessons` copia el
  `commissionPct` vigente del instructor a la lección (el valor queda
  fijo aunque el owner lo cambie después — igual que cualquier precio
  pactado).
- **Vista instructor**: `GET /private-lessons/mine?as=instructor` agrega
  `commissionClp` y `netClp` calculados por fila (la UI no hace
  aritmética de negocio). Nada cambia para `as=student`.
- **UI**: `PrivateLessons` gana la sección "Mis clases como instructor"
  (se monta solo si el viewer tiene lecciones como instructor): cada
  clase muestra precio, comisión y neto; header con el total del mes
  en curso. Settings de academia muestra la lista de instructores con su
  `commissionPct` editable (owner/admin — misma regla de visibilidad que
  `AcademySettings`).

Fuera de scope: liquidación real de la comisión (no hay pago asociado a
PrivateLesson aún), edición de comisión por lección individual,
exportes de instructor.

## Capabilities

### New Capabilities

- `academies/instructor-commission`: comisión por instructor sobre clases
  particulares — configuración owner, snapshot al crear, neto visible
  para el instructor.

## Impact

- `prisma/schema.prisma` + migración: `AcademyInstructor.commissionPct`.
- `academies.controller.ts`: `PATCH :id/instructors/:personId`; el
  detalle manage (`GET /academies/:id`) expone `commissionPct` en
  `instructors` (vista staff — el perfil público `/profile` NO lo expone).
- `private-lessons.controller.ts`: snapshot en `request()`; `mine`
  agrega `commissionClp`/`netClp` cuando `as=instructor`.
- Web: `private-lessons.tsx` (sección instructor + totales),
  `academy-settings.tsx` o subsección nueva (lista de instructores con
  comisión editable), i18n `parts/academyExtras.json`.
- Tests: spec de `private-lessons.controller` (snapshot + neto) y de la
  ruta PATCH (auth + rango).
