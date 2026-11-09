# Delta: bulk-import

## MODIFIED Requirements

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
- Enrollment: si existe ACTIVE para la academia SHALL actualizar
  `planId` al importado y `endsAt` = max(existente, importada); si no
  SHALL crear `ACTIVE{startedAt:now, planId, endsAt}`.
- `pagado_hasta` SHALL interpretarse como fin del día Chile (mediodía
  UTC aprox., misma convención que alta staff); vacío → `endsAt` null.
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
