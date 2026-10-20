# Proposal — admin-user-soft-delete

## Why

El borrado de usuarios era físico en cascada (persona + filas FK
eliminadas, email liberado). Rompe integridad referencial del resto del
grafo (academias huérfanas, eventos sin productor visible, historial
social) y es irreversible. El estándar de industria es baja lógica:
la cuenta se desactiva, auth se bloquea, y el resto de la data queda
intacta para el admin.

## What Changes

- `Person.deletedAt` (nuevo campo, migración versionada).
- `DELETE /admin/users/:personId` pasa a soft delete (deletedAt=now),
  idempotente; nuevo `POST /admin/users/:personId/reactivate`
  (deletedAt=null). Ambos auditados.
- Auth bloqueada para cuentas desactivadas: SessionGuard 401,
  `upsertByEmail` (link/OTP) y login con password las rechazan.
  El email no se libera (re-registro → 409).
- Superficies públicas filtran `deletedAt: null`: búsqueda de gente,
  perfil público, amigos, listas de invitados, pases, prácticas.
- Admin UI: badge "Desactivada" en lista y ficha, botón Reactivar,
  copy de zona de peligro actualizado.
- **BREAKING** semántico: el endpoint ya no libera el email ni elimina
  el historial — comportamiento intencional.
