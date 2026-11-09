# Handoff: release 1.16.1 deployada - drift e2e resuelto

Sesión 2026-11-09 noche. Se completó el camino (a) del handoff
anterior: arreglar el drift e2e y releasear. Suite Playwright
**85/85 verde** (chromium + mobile) contra build de producción,
y release **1.16.1** ya deployada en main (tag `v1.16.1`).

## Qué quedó hecho

### Fixes e2e (commit `914e9ec9`)

- `productor-colaboradores`: reescrito como happy-path real (alta por
  búsqueda -> visible en nómina -> quitar con ConfirmSheet + assert
  por API). El 403 por cupo fue removido a propósito en `4730aceb`
  (el cupo free aplica al staff por evento, no a la nómina).
- `academia-alumnos` (alta duplicada 409): el form ya no tiene input
  "id de persona"; ahora busca por `/students/candidates` (no
  excluye enrolados). Spec actualizado al buscador (email único).
- `dancer-checkout`: evento hardcodeado con preventa vencida
  reemplazado por resolución runtime via `GET /api/events`
  (PUBLISHED + PUBLIC + futuro + con precio).
- `dancer-qr` mobile: pasaba solo; el flake real era el service
  worker (ver abajo).
- `academia-cobros` mobile (error+retry): causa raíz real -
  `InstallPrompt` registra `/sw.js` en cada página con
  `skipWaiting()+clients.claim()`; una vez que el SW controla la
  página, en **WebKit** `page.route` no intercepta los fetches que
  pasan por él. Fix: `serviceWorkers: "block"` en
  playwright.config.ts (la suite no prueba el SW).
- `academia-videos` mobile (login timeout): race fill-vs-hidratación
  - el fill del correo caía antes de hidratar y React lo pisaba; el
  submit nunca salía. Fix: `expect(...).toPass` re-llenando hasta
  que el valor persista. Mismo fix aplicado a `auth.setup.ts`.
- Inventario QA: `remove sin confirm` -> `remove ConfirmSheet`
  en `/productor/colaboradores`.

### Release (PR #1 + PR #2)

- Bump 1.16.0 en dev + CHANGELOG (trial-lifecycle-15d + gates) ->
  PR #1 dev->main, checks verdes, merge `43494a5c`, tag `v1.16.0`.
- **Deploy falló**: el postinstall raíz (`setup-git-hooks`, de
  `d4325d86`) rompía `pnpm install --frozen-lockfile` en la etapa
  builder del Dockerfile (scripts/ aún no copiado). Hotfix 1.16.1:
  `COPY scripts/setup-git-hooks.cjs` antes del install en
  `apps/api/Dockerfile` (commit `f7b7d4d1`). PR #2 mergeado
  (`0c651af3`), tag `v1.16.1`, **Deploy omnidance API verde**
  (run 42687802353, todos los steps OK incl. Oracle VM + Nginx).
- main sincronizado de vuelta a dev (FF). dev == main == `0c651af3`.

## Verificación citada

- `pnpm test:e2e`: "85 passed (2.3m)" chromium+mobile, 0 fail.
- `gh run list`: Deploy omnidance API main -> completed success.
- static-unit + no-agent-attribution + netlify preview: pass en PR #1 y #2.

## Pendiente

- Post-deploy: validar en prod que el seed creó params nuevos
  (trial_days, cx.contact.*, cx.notify_email) y probar grant de
  trial Producer Pro al aprobar un PersonRole(PRODUCER).
- `academy-invites`: OpenSpec completo sin empezar (siguiente slice).
- Flake residual conocido: `dancer-eventos` mobile falló una vez
  por click pre-hidratación que no navegó (pasa aislado); sin fix -
  si reaparece, mismo patrón toPass o waits por estado estable.
- Stack dev: API `pnpm dev` sigue corriendo en shell local con
  `PAYMENT_GATEWAY=stub THROTTLE_AUTH_LIMIT=120`; web prod `next
  start` en :3000 también quedó vivo.
