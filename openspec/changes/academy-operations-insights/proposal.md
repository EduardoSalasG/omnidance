# academy-operations-insights

## Why

La landing `/para-academias` promete gestión real — pero dos features
de retención que el owner espera (avisos de planes por vencer y
cumpleaños de alumnos) no existen en la consola, y el strip de prueba
social muestra eventos (dato de productor, no de academia). La data ya
está (`Enrollment.endsAt`); los cumpleaños requieren un campo nuevo.

## What Changes

- `Person.birthDate` (DateTime nullable, autodeclarado): editable vía
  `PATCH /me`, devuelto en `GET /me` y editable en `/perfil/datos`.
- `GET /academies/public` (sin sesión): `{id, name, styles[]}` de
  academias activas sin bloqueo de mora — mínima exposición para el
  strip de la landing.
- `GET /academies/:id/dashboard` gana `expiringEnrollments` (planes con
  vigencia en los próximos N días) y `upcomingBirthdays` (cumpleaños de
  alumnos en los próximos N días); ventanas vía PlatformParam.
- Consola `/academia`: dos listas nuevas en el dashboard (por vencer,
  cumpleaños) con link a la ficha del alumno.
- Landing `/para-academias`: el strip muestra academias reales en vez
  de eventos; el copy de features menciona vencimientos y cumpleaños.

## Capabilities

### New Capabilities

- `academies/owner-insights`: insights de retención del dashboard del
  owner y el directorio público mínimo de academias.

### Modified Capabilities

- `people-profile`: campo `birthDate` autodeclarado.

## Impact

- `schema.prisma` (Person.birthDate) + migración.
- `academies.controller.ts` (endpoint público + dashboard),
  `academy.service.ts` (cómputo de cumpleaños), `people.controller.ts`
  (DTO + handler), `seed-common.ts` (params) y `seed-dev.ts` (demo).
- Web: `academy-dashboard.tsx`, `perfil/datos`, `Landing.tsx`,
  `lib/public-academies.ts`, i18n (es-CL academy + landing.json +
  profile.json).
