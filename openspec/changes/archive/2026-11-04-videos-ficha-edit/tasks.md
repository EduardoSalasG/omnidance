# Tasks

- [x] 1. `video-form.tsx`: soportar modo edit (props `video`/`videoId`,
  PATCH en vez de POST, `classId: null` al limpiar el campo, labels de
  guardar) sin romper el modo create.
- [x] 2. `academia/videos/[id]/page.tsx`: fetch del detalle por
  `GET /academies/:id/videos/:videoId` (fuera el scan paginado), estados
  loading/forbidden/notFound/error+retry, render del form en modo edit
  para canAdminister, zona roja + ConfirmSheet intactos, comentario del
  archivo actualizado.
- [x] 3. i18n: keys nuevas solo en el part `academyExtras.videos` +
  mirrors; `i18n-audit` verde.
- [x] 4. `docs/qa-flows-inventory.md` sección Videos: GET detalle +
  PATCH edit + flujo de la ficha.
- [x] 5. Verificación: `tsc --noEmit` web, smoke visual de la ficha
  (render + guardar + delete), archivar el change.
