# Handoff — 2026-10-28 (release 1.11.0 + tag infra)

## Completado

- **Release 1.11.0 promovida `dev → main`** (`12b2ad5b`), tag anotado
  `v1.11.0` pusheado, `dev` sincronizado de vuelta y pusheado.
  Tags 1.8–1.10 no existían — esta sí se tagueó.
- **GTM `GTM-W9KC3378`** (snippet head + noscript body) y **Microsoft
  Clarity `z4swabie90`** (head) en `components/gtm.tsx` /
  `clarity.tsx`, gateados por `NEXT_PUBLIC_GTM_ID` /
  `NEXT_PUBLIC_CLARITY_ID` (seteadas en `netlify.toml`; sin var no se
  renderiza → dev no contamina). CSP: `script-src` +
  `frame-src` para `googletagmanager.com` y `*.clarity.ms`.
- **Dominio primario `omnidance.tech`**: `NEXT_PUBLIC_WEB_URL` movida;
  canonical/og/sitemap/robots/JSON-LD verificados en smoke local.
  Fix al bug de share sheets que compartían `omnidance.netlify.app`.
- **Posicionamiento SEO**: metadata global reescrita (gestión de
  academias + eventos de productores + referencia sociales/congresos,
  sin tocar copy de landings) + nuevo `public/llms.txt` (200
  text/plain verificado).
- **QA gate completo**: lint 0 errores · typecheck 0 ·
  `pnpm test` 2308/2308 · `pnpm test:e2e` 14/14 · `pnpm build` OK.
- **3 fallos pre-existentes de `dev` corregidos** (bloqueaban CI):
  `social-endpoints.e2e` (venue ahora expone `city` — contrato
  multipais), `academy-claims.service.spec` (claim.currency hereda
  `plan.currency`, snapshot estampado al crear el plan), `gap-crm.e2e`
  (fixture `proTier` STARTER→GROWTH: `crm` no está en STARTER).
  Spec smoke cartelera endurecido (`waitForURL` + `toBeVisible`,
  flake de navegación RSC pending).
- Changes OpenSpec archivados: `add-gtm`, `add-clarity`,
  `seo-positioning-domain` → specs `web-tag-manager`,
  `landing-marketing`.

## ⚠️ Pendientes MANUALES del usuario (post-deploy)

1. **`.env` de la VM** (API): `WEB_URL`/`CORS_ORIGINS` →
   `https://omnidance.tech`. Sin esto, magic links/emails/ICS/claims
   siguen apuntando a `*.netlify.app`. Re-deploy con
   `workflow_dispatch` tras editar.
2. **Netlify → Domain management**: `omnidance.tech` como primary
   domain; activar redirect del subdominio `*.netlify.app` al primario.
3. **Precios nuevos (params + TierPrice)**: los valores en
   `seed-common.ts` (39500/79700/120500/99700/250200) NO se aplican a
   DBs existentes — PlatformParam y TierPrice upserts usan
   `update:{}`. Requiere edición en `/admin`: los 5 params
   `*_monthly_clp` **y** las filas TierPrice CL por ciclo (la resolución
   primaria del cargo; el param es fallback). Regla documentada:
   terminación 200/500/700, no .990.

## Branch pendiente de review/merge: `feature/landing-pricing`

- `dcc9d82f`: sección "Planes y precios" en `/para-academias` +
  `/para-productores` (componente compartido `Landing.tsx`, i18n ×4,
  CTAs → registerHref porque las landings no tienen lead form).
- `e5ffc30f`: recalibración de precios (seed-common params, landing
  JSONs, omni-dance.md sincronizado — su tabla productor estaba
  stale/divergente del código, `platform-billing` spec,
  fixtures de specs).
- `ce7fb4d5`: **commit duplicado** de los test fixes que ya entraron a
  `dev` por cherry-pick (`12b2ad5b`) — al mergear, git lo resuelve
  limpio o conflicto trivial.
- Pendiente: review del diff + merge a `dev` (quedó fuera de 1.11.0
  por no tener QA). Gap conocido del subagente: sin verificación
  visual (ni dev server ni screenshots) — revisar 320px y ≥lg.
- `docs/estrategia-comercial-2026-10-22.md` y
  `docs/competitive-references.md` tienen precios/caps stale —
  refresco queda como trabajo aparte (decision records históricos).

## Notas operativas

- Docker Desktop debe estar corriendo para `db:up`/`test:e2e`.
- `git` no está en PATH del shell MSYS: usar
  `/c/Program Files/Git/cmd/git.exe` o exportarlo.
- Deleting-lock quirk de openspec: si `archive` se interrumpe queda
  `openspec/changes/archive/.openspec-archive.lock` — borrarlo y re-correr.
