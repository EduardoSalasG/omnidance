# post-signup-profile-setup

## Why

El registro solo pide email + password + consentimiento (fricción
mínima, se mantiene así), pero el perfil del bailarín queda vacío:
sin género, sin Instagram, sin teléfono y sin estilos de baile. La spec
de producto declara que el onboarding captura "nombre, foto, estilos +
roles" (omni-dance.md) y hoy nadie guía al usuario nuevo a completarlo;
los campos solo son editables si la persona descubre `/perfil/datos`
por su cuenta.

## What Changes

- Tras `POST /auth/register` exitoso, el front redirige a
  **`/bienvenida`** (página dedicada en el grupo `(app)`) en vez de
  directo a `/inicio`; el `?next=` existente se propaga y se consume
  al terminar u omitir.
- `/bienvenida` muestra un formulario **completamente salteable** con:
  nombre (pre-llenado), teléfono, Instagram, género (segmented
  M/F/OTHER, deseleccionable) y "Tu baile" (estilos del catálogo +
  rol leader/follower/switch + nivel opcional). Guarda vía `PATCH /me`
  + `PUT /me/style-roles`; tanto guardar como omitir marcan
  `onboarding["profile-setup"]` para no volver a interponerse.
- `PATCH /me` responde **409 `phone_exists`** cuando el teléfono ya
  pertenece a otra cuenta (hoy explotaba en 500 por el constraint
  unique) - mismo contrato que `POST /me/complete-profile`.
- En `/perfil`, una card sutil "Completa tu perfil" visible mientras
  falte algún campo del set (phone, instagram, gender, styleRoles);
  tiene dismiss persistente vía `onboarding["profile-reminder"]` para
  quienes prefieren no declarar.

## Capabilities

### New Capabilities

(ninguna - todo cae dentro de `people-profile`)

### Modified Capabilities

- `people-profile`: nuevo requisito de completado post-registro, error
  409 de teléfono duplicado en `PATCH /me`, y recordatorio sutil de
  perfil incompleto en `/perfil`.

## Impact

- **API**: `apps/api/src/people/people.controller.ts` (`updateMe` gana
  check de teléfono único → 409). Sin cambios de schema ni migraciones.
- **Web**: nuevo `apps/web/src/app/(app)/bienvenida/page.tsx`; redirect
  en `login-form.tsx`; `GenderGroup` extraído a componente compartido
  (lo reusan `/perfil/datos` y `/bienvenida`); card en
  `/perfil/page.tsx`; nuevo part i18n `welcome.json` + keys en
  `profile.json`.
- **Tests**: spec del 409 en PATCH /me; ajuste del redirect post-register.
- Sin efecto en contratos existentes, migraciones ni datos.
