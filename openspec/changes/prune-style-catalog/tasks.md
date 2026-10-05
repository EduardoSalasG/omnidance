# Tasks - prune-style-catalog

- [x] `seed-common.ts`: quitar "Salsa on2" y "Bachata dominicana" de
  `STYLE_CATALOG`.
- [x] `seed-dev.ts`: quitar serie "Bachata Dominicana - Intensivo" y
  los `styleRole` de Sebastian (Salsa on2) y Daniela (Bachata
  dominicana).
- [x] `apps/web/src/lib/profile-styles.ts`: denylist de 5 estilos.
- [x] `/perfil/datos`: filtrar opciones del select (manteniendo la
  opción ya seleccionada aunque esté oculta).
- [x] `/bienvenida`: filtrar chips del catálogo.
- [x] Verificación: `pnpm --filter @omnidance/api test` (1429 verdes,
  los e2e corren el seed) + `tsc --noEmit` web.
