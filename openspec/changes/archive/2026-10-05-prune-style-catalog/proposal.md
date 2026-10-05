# prune-style-catalog

## Why

El picker "Tu baile" del perfil (y `/bienvenida`) ofrece el catálogo
completo de estilos, incluidos nichos que el usuario no quiere
ofrecer como selección personal (Salsa on2, Bachata dominicana,
Afrocubano, Rueda de casino, Fusión). Además "Salsa on2" y "Bachata
dominicana" salen del catálogo sembrado por completo: no son estilos
que la plataforma quiera mantener.

## What Changes

- `STYLE_CATALOG` (seed) pierde "Salsa on2" y "Bachata dominicana";
  el seed dev deja de referenciarlos (serie inactiva "Bachata
  Dominicana - Intensivo" y dos `PersonStyleRole` demo).
- El picker de estilos del perfil (`/perfil/datos`) y de `/bienvenida`
  excluye los 5 estilos via denylist por nombre en
  `apps/web/src/lib/profile-styles.ts`. Los demás consumidores del
  catálogo (series, eventos, academias) no se tocan: "Rueda de casino",
  "Afrocubano" y "Fusión" siguen existiendo para esos usos.
- Un `PersonStyleRole` que ya apunte a un estilo oculto sigue
  mostrándose en la fila del picker (la opción se conserva) para no
  dejar el draft vacío; solo deja de ser ofrecible como selección
  nueva.

## Capabilities

### Modified Capabilities

- `dancer-dance-profile`: el picker de estilos del perfil ofrece un
  subconjunto del catálogo (denylist por nombre), no el catálogo
  completo.

## Impact

- **API**: `apps/api/prisma/seed-common.ts` (catálogo), `seed-dev.ts`
  (serie + styleRoles removidos). Sin cambios de schema ni endpoints.
  Los seeds no borran filas existentes: DBs ya pobladas conservan los
  estilos, pero el denylist del front los oculta igual del picker.
- **Web**: nuevo `lib/profile-styles.ts`; filtro en el select de
  `/perfil/datos` y en los chips de `/bienvenida`.
