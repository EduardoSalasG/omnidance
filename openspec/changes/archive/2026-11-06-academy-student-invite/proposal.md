# academy-student-invite

## Why

El alta de alumno exigía un personId existente: si la persona no
estaba en la app el flujo moría. Decisión del usuario: la academia
registra con email+nombre y la persona completa su cuenta por mail.

## What Changes

- `POST /academies/:id/enrollments` acepta `email`+`name` además de
  `personId`: find-or-stub; stub nuevo recibe magic link de 7d vía
  `studentInviteEmailHtml` (mismo patrón staff/instructor). El mail
  es best-effort; la respuesta incluye `invited`.
- En /alumnos/nuevo, cuando el buscador no encuentra a la persona
  aparece "Registrar nueva persona" con campos email+nombre; el
  aviso confirma la invitación enviada.
