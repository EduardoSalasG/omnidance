# admin-user-delete

## Why

No hay forma de eliminar una cuenta desde la consola admin. El caso
inmediato: re-testear el onboarding post-registro en producción con un
email real, que exige liberar el email de la cuenta previa. También
sirve para limpiar cuentas de prueba y duplicadas.

## What Changes

- `DELETE /api/admin/users/:personId` (permiso `admin.access`): borra
  la persona en cascada en una transacción - primero las filas con FK
  declarada a `Person` (PersonRole, FiscalProfile, PersonStyleRole,
  Rsvp, EventDj, Notification, PushToken, PlatformSubscription payer;
  `producerId` queda null) y luego la `Person`. Audita
  `USER_DELETE`.
- No permite borrar la propia cuenta en sesión (400), y responde 404
  si la persona no existe.
- Ficha `/admin/usuarios/[personId]`: card "Zona de peligro" con
  confirmación y redirect al listado tras borrar.

Los ids referenciados sin FK (Ticket.ownerId, AuditLog.actorId,
sesiones, prácticas…) quedan como huella histórica - mismo criterio
que una baja de negocio, sin falsos "no referenciado".

## Capabilities

### Modified Capabilities

- `people-profile`: la consola admin puede eliminar una persona en
  cascada con auditoría y guard de auto-eliminación.

## Impact

- **API**: `admin.controller.ts` (nuevo endpoint), `admin.e2e.spec.ts`
  (401/403/400/404 + cascada + email liberado). Sin cambios de schema.
- **Web**: `/admin/usuarios/[personId]/page.tsx` + keys
  `admin.users.delete.*`.
