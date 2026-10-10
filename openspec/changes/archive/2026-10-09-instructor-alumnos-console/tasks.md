# Tasks

- [x] 1. Nav: `TABS_BY_ROLE.INSTRUCTOR` reemplaza `Mi academia` por
  `/academia/alumnos` (tab `students`, icono users); `nav.students`
  en i18n.
- [x] 2. Nav: `DRAWER_BY_ROLE.INSTRUCTOR` vacío + la condición
  sin-drawer cubre INSTRUCTOR (como DANCER) — sin hamburguesa ni
  drawer en `<lg`; Videos y Particulares salen de su navegación.
- [x] 3. Perfil: badges de rol bajo la identidad solo cuando
  `roleStates.length <= 2` (con más roles ya están en
  "Interactuar como").
- [x] 4. Verificación: tsc web, audit i18n, smoke CDP instructor
  móvil/desktop (tab Alumnos, ficha con historial, sin hamburguesa).
