# Tasks; admin-users-pagination

## 1. API

- [x] `admin.controller.ts` `UsersQueryDto`: agregar `page`/`pageSize`
      opcionales (`@IsOptional @IsString @ApiPropertyOptional`).
- [x] `users()`: `pageParams(q.page, q.pageSize)` (import de
      `academies/infrastructure/list-filters`, mismo patrón que
      crm/payments); guarda vacía devuelve envelope
      `{items:[],total:0,page,pageSize}`; `findMany` con `skip`/`take`
      + `person.count({where})`; responder `{items,total,page,pageSize}`.

## 2. Web; /admin/usuarios

- [x] Tipo `UsersResponse` `{items,total,page,pageSize}`; estado `page`
      (default 1, reset al cambiar `q`/`role`).
- [x] Fetch con `page`+`pageSize` en params; guardar envelope.
- [x] Render `<Pager>` bajo la lista cuando hay búsqueda activa;
      mantener hint/minChars/noResults/SkeletonList acordes al estándar
      de carga.

## 3. Web; /analitica/usuarios

- [x] Leer `items` del envelope (misma UX: buscador por nombre, primera
      página).

## 4. Docs y verificación

- [x] `docs/qa-flows-inventory.md`: flujo admin/usuarios con paginación
      + filtro rol.
- [x] `node apps/api/scripts/export-api-docs.cjs` con API viva →
      `docs/openapi.json` + postman regenerados.
- [x] `pnpm typecheck` (api+web), `node scripts/i18n-audit.cjs`,
      lint de los archivos tocados.
