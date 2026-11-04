# Tasks: academy-niveles-to-config

## Web

- [x] 1. Mover `academia/niveles/page.tsx` a
  `academia/configuracion/niveles/page.tsx` y quitar el
  `ConsoleHeader` (las sub-páginas de Configuración son nivel 1 del
  drawer, sin back - mismo patrón que `configuracion/general`).
- [x] 2. `academia/niveles/page.tsx` queda como redirect a
  `/academia/configuracion/niveles` (mismo patrón que
  `academia/configuracion/page.tsx`: server component +
  `redirect({href, locale})` de `@/i18n/navigation`).
- [x] 3. `BottomNav.tsx`: sacar el item `/academia/niveles` del grupo
  `navGroups.teaching` y agregarlo al grupo `navGroups.config` después
  de `configPages.general`, con `key: "configPages.levels"`,
  `icon: ICONS.layers` y `academyFeature: "classes"`.
- [x] 4. i18n `academyExtras.json`: agregar `"levels": "Niveles"` en
  `academy.configPages` (y espejo en las partes en/fr/pt-PT si el repo
  las mantiene al día).
- [x] 5. Actualizar cualquier link interno que apunte a
  `/academia/niveles` a la ruta nueva.

## Docs / cierre

- [x] 6. `docs/qa-flows-inventory.md`: ruta del flujo del mantenedor
  de niveles actualizada (`/academia/configuracion/niveles` + nota del
  redirect); archivar el change.
