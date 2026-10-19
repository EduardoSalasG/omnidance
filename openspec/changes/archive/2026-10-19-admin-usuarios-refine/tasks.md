# Tasks — admin-usuarios-refine

## 1. Ficha — expand en actividad por rol

- [x] `DataList`: cap 5 + toggle autocontenido (Children.toArray,
      estado por lista, botón secondary sm centrado).
- [x] i18n: `admin.users.roleData.showAll` ("Ver las {count}") /
      `showLess` ("Ver menos") en `parts/admin.json`.

## 2. API — contadores en /admin/users

- [x] `users()`: tras el findMany, `academy.groupBy(ownerId)` +
      `event.groupBy(producerId)` sobre los ids de la página; merge en
      cada item como `academiesCount`/`eventsCount`.

## 3. Listado — contadores en el card

- [x] Tipo `SearchUser` + línea meta bajo los roles: "N academia(s)" /
      "N evento(s)" solo si >0, `text-xs text-ink/50`.
- [x] i18n: `admin.users.academiesCount` / `eventsCount` (ICU plural).

## 4. Docs y verificación

- [x] `docs/qa-flows-inventory.md` (ficha expand + card contadores).
- [x] Export openapi/postman; typecheck api+web; eslint; i18n-audit.
