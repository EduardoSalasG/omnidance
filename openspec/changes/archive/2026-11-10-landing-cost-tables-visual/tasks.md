# Tasks: landing-cost-tables-visual

## 1. Catálogo i18n (4 locales)

- [x] 1.1 `landingAcademy.costTable`: agregar `steps` (3 pasos del
      flujo del dinero) + `costNote` por fila; eliminar
      `colMethod`/`colCost`/`colGain`.
- [x] 1.2 `landingProducer.costTable`: `costNote` donde aplique;
      nuevo `planFees` (label + managedLabel/ownLabel + tiers
      Standard/Pro); `note` recortada a "el asistente paga el precio
      publicado"; eliminar `col*`.
- [x] 1.3 Replicar en `en/`, `fr/`, `pt-PT/` y correr
      `node scripts/i18n-audit.cjs` → ALL_KEYS_OK.

## 2. Renderer

- [x] 2.1 `Landing.tsx`: tipo `CostTableMessages` + bloque re-hecho
      (pasos opcionales → cards de métodos → banda planFees → nota),
      responsive mobile-first, jerarquía costo primario.

## 3. Verificación

- [x] 3.1 `pnpm --filter @omnidance/web typecheck` + lint de archivos
      tocados.
- [x] 3.2 `impeccable detect --json` sobre Landing.tsx.
- [x] 3.3 Smoke visual `/para-academias` + `/para-productores`
      (mobile + desktop).
