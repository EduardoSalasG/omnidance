# Brief: impl-media (analítica + videos)

Lee `docs/audit-briefs/_impl-common.md` primero. Tu scope exclusivo:

- `apps/web/src/app/[locale]/(app)/analitica/usuarios/page.tsx` —
  `ConsoleHeader` back → `/analitica` al tope (l41-46).
- `apps/web/src/app/[locale]/(app)/analitica/usuarios/[personId]/page.tsx`
  — (a) expands con `SeeAllRow` en: producers, academies (instructor/
  venue/owner), roleHistory, byAcademy/byStyle/byGenre,
  activeEnrollments (~l663-811); (b) actores con id → `<Link>` a su
  ficha (`/analitica/usuarios/[id]` para personas; productor/academia/
  venue → su ruta de ficha si existe en analítica, si no texto);
  (c) `Row`/`SectionCard` → semántica `dl`/`dt`/`dd` (l135-160);
  (d) notFound con CTA (l290-296).
- `apps/web/src/components/analytics/QueryTable.tsx` (ubicar el path
  real primero con glob) — celda persona → Link
  `/analitica/usuarios/[personId]` cuando la fila trae `personId`.
- `apps/web/src/components/academy/videos.tsx` — delete inline →
  `ConfirmSheet` (l226-236); empty con `q` activo → `query.empty`
  (l175-187).
- `apps/web/src/components/academy/video-form.tsx` — busy texto →
  `Spinner` inline (l136-138); forbidden sin `role="alert"` (l72).
