# Tasks: academy-owner-selector

- [x] `HomeHub`: `<AcademyGate selector>` en la rama ACADEMY_OWNER -
      restaura cambio de academia + CTA "Nueva academia" (multiAcademy)
      en `/inicio`. El hub `/academia` ya lo tiene para staff/admin.
- [x] Spec delta `academies/console-lists`: el selector + CTA viven en
      `/inicio` para el owner (el requisito decía `/academia`).
- [x] `docs/qa-flows-inventory.md` §8: selector del owner en `/inicio`.
- [x] Verificación: `tsc --noEmit` web, suite web, `openspec validate`.
- [ ] Smoke manual: `academias@omnidance.dev` (owner de 15 academias
      en los 4 tiers) cambia de academia desde `/inicio` y el CTA
      "Nueva academia" aparece al seleccionar la academia PRO
      (`multiAcademy`), no en COBROS/STUDIO.
