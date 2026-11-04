# Brief: impl-videos (ficha/edit de video)

Lee `docs/audit-briefs/_impl-common.md`. Scope exclusivo:

**Decisión nueva del usuario** (revierte la excepción documentada):
el video SÍ tiene ficha. La card del listado navega a una página de
editar y el delete vive dentro en zona roja con ConfirmSheet.

- NUEVO `apps/web/src/app/[locale]/(app)/academia/videos/[id]/page.tsx`:
  `ConsoleHeader` back → `/academia/videos`; form de edición
  (title*, url*, classId, restrictedToAttended — mismos campos del
  create en `video-form.tsx`, reusar/convertir el form a soportar
  modo edit si es razonable, o form propio chico); PATCH al endpoint
  de videos (verifica el método exacto en
  `apps/api/src/academies/**` — si no existe PATCH /videos/:id,
  repórtalo, no lo inventes en front); zona roja centrada
  `border-t border-line pt-6` + `Button variant="ghost"` rojo +
  `ConfirmSheet` → DELETE → ActionNotice + vuelta al listado.
  Estados: skeleton, error alert+retry, 401/403/404 → "sin acceso",
  notFound con CTA.
- `apps/web/src/components/academy/videos.tsx`: cards admin →
  `Link` a `/academia/videos/${v.id}` con chevron (patrón card
  clickeable); quitar el botón delete inline de la card admin (los
  viewers sin permiso siguen con card→link externo como hoy; el
  video es externo, la navegación a ficha solo para quien puede
  administrar — verifica el cap/canAdminister ya usado para el CTA
  nuevo/delete).
- `docs/qa-flows-inventory.md` sección Videos: actualizar (ficha
  existe, delete vive ahí).
- `.devin/skills/console-patterns/SKILL.md`: quitar la "Excepción
  documentada" de videos (ya no aplica — ahora hay ficha).

i18n: reusar keys de videos.*; nuevas solo en el part del dominio +
mirrors. NO git. `npx tsc --noEmit` + i18n-audit al final. Reporta
archivos + si falta endpoint PATCH en backend.
