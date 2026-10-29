# Propuesta: Cambiar contraseña desde el perfil (cambiar-password)

## Why
Los usuarios con contraseña (admin/dev) y magic-link-only no tienen cómo
gestionarla. `PATCH /me` acepta `password` sin verificar la actual;
cualquier sesión activa la cambia en silencio (gap de seguridad).

## What Changes
- `PUT /me/password` `{currentPassword?, newPassword}`: si la persona
  tiene `passwordHash` → `currentPassword` obligatoria y correcta
  (verifyPassword scrypt existente); si es null (solo magic link) →
  permite establecerla sin actual. newPassword min 8 chars. 400 si la
  actual es incorrecta. Audit log opcional del cambio.
- Front `/perfil` sección "Seguridad > Cambiar contraseña": campos
  actual (si aplica) + nueva + confirmar; validación client-side +
  ActionNotice éxito/error; "establecer contraseña" cuando no tiene.
- `PATCH /me` deja de aceptar `password` (la superficie admin que lo
  usaba migra al endpoint dedicado o queda prohibido; reportar uso).
