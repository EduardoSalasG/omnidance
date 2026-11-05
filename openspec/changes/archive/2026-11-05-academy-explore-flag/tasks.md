## 1. Flag en catálogo

- [x] 1.1 Agregar `academy_explore` (label "Explorar academias y clases", default `enabled: true`) a `FEATURE_FLAG_SEED` en `apps/api/prisma/seed-common.ts`. Verificar: `pnpm db:seed` corre sin error y `GET /features` incluye `academy_explore: true`; re-correr el seed tras un toggle admin no pisa `enabled`.

## 2. Gating en /academias

- [x] 2.1 En `academias/page.tsx` consumir `useFeatures()` y normalizar: flag OFF → `scope` derivado nunca es `explorar` (`s=explorar`, `v=explorar` legado y el default por `enrollments===[]` caen a `mias`). Verificar con test de componente: render con `flags.academy_explore=false` + `?s=explorar` muestra la pill "Mis academias" activa y sin pill Explorar.
- [x] 2.2 Ocultar con flag OFF: la opción Explorar del segmented, el buscador por nombre y los CTAs que apuntan a explorar (empty states incluidos). El mapa queda operativo sobre el scope `mias`. Verificar: test de componente + revisión de empty states.

## 3. Gating en /clases

- [x] 3.1 En `clases/page.tsx` misma normalización (`s=explorar` y `view=explore` legado → `mias`) y ocultar la pill Explorar + el select de academia (solo existe en explorar). `loadBrowse` nunca pide browse sin `scope=enrolled` por gate, no por parche en el fetch. Verificar: test de componente.
- [x] 3.2 Empty states y CTAs a explorar (`t("explore")`, `hrefFor({s:"explorar"})`) ocultos o con copy sin invitación a explorar cuando el flag está OFF. Verificar: test de componente + revisión i18n.

## 4. Ficha de academia

- [x] 4.1 En `academias/[id]/page.tsx` ocultar el link "Explorar más clases" (`/clases?s=explorar&academy=`) cuando el flag está OFF; la ficha sigue completa. Verificar: revisión visual o test ligero.

## 5. Tours y copy

- [x] 5.1 Verificar que los tours de onboarding (`cl-explore`, explorar en academias) no rompen cuando el elemento data-tour no existe con flag OFF; ajustar el spec del tour si exige el elemento. Verificar: revisar la lógica del componente de tour + smoke manual o nota en el handoff.
- [x] 5.2 i18n `es-CL`: agregar solo las claves de empty state que hagan falta cuando no se puede invitar a explorar (reusar las existentes si el copy ya funciona sin CTA). Sin guiones largos ni dobles en el copy. Verificar: `pnpm --filter @omnidance/web typecheck`.

## 6. Verificación y docs

- [x] 6.1 Actualizar `docs/qa-flows-inventory.md`: flujos de `/academias` y `/clases` registran el flag `academy_explore` y el comportamiento OFF (normalización a mias, fichas vivas). Verificar: sección de flujos afectados editada en el mismo commit.
- [x] 6.2 `pnpm --filter @omnidance/web test` verde (tests de componente nuevos incluidos), `pnpm --filter @omnidance/web typecheck` y `pnpm lint` sin errores nuevos. Verificar: output citado.
- [x] 6.3 Smoke manual o nota de gap: con `PAYMENT_GATEWAY=stub` y flag toggled vía `PATCH /admin/feature-flags/academy_explore {enabled:false}`, `/academias?s=explorar` muestra `mias` y `/academias/[id]` renderiza sin link a explorar. Verificar: evidencia o gap declarado en el handoff.
