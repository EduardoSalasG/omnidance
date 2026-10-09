# Proposal — academy-team-instructors

## Why

`AcademyInstructor` existe en el modelo y habilita la consola de
instructor (membresía = acceso, sin requerir `PersonRole INSTRUCTOR`),
pero no hay ningún endpoint ni UI para que el owner lo gestione: las
filas solo nacen del seed y del import CSV. El módulo Equipo
(`/academia/equipo`) solo administra colaboradores (`AcademyStaff`).

## What Changes

- **API**: bajo `/academies/:id/instructors` (capacidad `team`, mismo
  gate que staff):
  - `GET` — lista profesores con `{person:{id,name,email},
    commissionPct, createdAt}`.
  - `POST {email, name?, commissionPct?}` — misma mecánica que staff:
    normaliza email, stub + invitación por magic link si la persona no
    existe, upsert por `(academyId, personId)`. `commissionPct`
    entero 0–100, opcional.
  - `DELETE /:personId` — elimina la membresía (la persona conserva su
    cuenta; pierde acceso de instructor a esa academia).
  - `PATCH /:personId` ya existe (comisión) — sin cambios.
  - Mismas guardas que staff: owner no es objetivo, nadie se gestiona
    a sí mismo.
- **Web**: `/academia/equipo` gana la sección **Profesores** (lista +
  baja + comisión editable inline) sobre la de Colaboradores; el alta
  `/academia/equipo/nuevo` gana selector de tipo (Colaborador |
  Profesor): profesor muestra `commissionPct` en vez de los toggles de
  accesos.
- Email de invitación nuevo (`instructorInviteEmailHtml`) con copy de
  profesor.

## Non-goals

- No se otorga `PersonRole INSTRUCTOR` automáticamente: la membresía
  `AcademyInstructor` ya habilita los endpoints de instructor
  (`/classes/teaching`, asistencia). El rol global sigue siendo flujo
  de plataforma.
- No se mueve el editor de comisión de `/academia/configuracion`
  (queda; Equipo también lo permite inline).
