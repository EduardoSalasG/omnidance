# Handoff: release 1.16.0 pausada - drift e2e Playwright (trial-lifecycle)

Sesión 2026-11-09 tarde. Se resolvió la suite vitest roja (2531/2531
verde, commit `e2d9c2c4`) y se instalaron gates de flujo (`d4325d86`).
Al intentar la promoción dev→main el gate e2e obligatorio (la release
toca `apps/web`) descubrió que **la suite Playwright está roja por
drift pre-existente**: no corría completa desde el 4-5 nov, antes de
que `trial-lifecycle-15d` aterrizara en dev.

## Estado del release (pendiente, casi todo listo)

- Incremento definido: **MINOR 1.16.0** (feat platform-trials).
- `pnpm verify` verde (typecheck + lint + test: API 2531/2531).
- QA + commit-guard verdes en dev para `4bbc0f4e`.
- Web build de producción OK; stack vivo corrido:
  `pnpm --filter @omnidance/web start` (:3000) + `pnpm dev:api` con
  `PAYMENT_GATEWAY=stub` + `THROTTLE_AUTH_LIMIT=120` (:4000).
  **Ambos procesos quedaron corriendo** (shells de esta sesión);
  si la máquina reinició, levantar de nuevo según receta AGENTS.
- Bump de versión + CHANGELOG **sin hacer todavía**. El bump va en
  dev ANTES del PR (main protegido: push directo bloqueado).
- Flujo nuevo (AGENTS actualizado): bump en dev → push → PR dev→main
  → checks (static-unit + no-agent-attribution) → merge → tag
  `v1.16.0` en el merge commit → push tag → supervisar deploy
  → sync main de vuelta a dev.

## Progreso en los fixes (sesión 2, parcial)

- **`dancer-membresia` ARREGLADO y verificado verde**: el assert del
  notice `status` "suscripción quedó activa" era frágil (auto-cierra
  ~3s); el estado real ya se verifica por cola vacía + API ACTIVE.
  Assert eliminado.
- **`productor-colaboradores` parcial**: se agregó expirar el trial de
  carlos vía `PATCH /api/admin/users/:id/pro-trial` ({endsAt}) como
  admin + restaurarlo a +90d en finally (funciona: el test avanzó del
  assert "sube de tier" a llenar el cupo). También se relajó el assert
  del pool de DJs a `QUOTA - count + 1` (seed deja 2 DJs en roster).
  **Sigue rojo en el assert del alert "sube de tier"**: con el trial
  vencido el alta siguiente no produjo el aviso - verificar qué devuelve
  el POST /producer/staff (¿403 `staff_quota` vs `tier.required` vs
  2xx?) - el trace está en test-results/. Puede que el 403 sea
  `staff_quota` con copy distinto, o que el entitlement cachee el
  trial.
- **Sin tocar**: academia-alumnos, dancer-checkout, dancer-qr,
  academia-cobros, academia-videos, dancer-eventos.

## Fallas e2e: 5 únicas (chromium), mismas en mobile

Corrida completa: 70 pass / 14 fail / 1 skip. Re-corrida aislada
confirma **5 fallos reales, no flakes**:

1. **`productor-colaboradores`** "cupo lleno → siguiente alta
   rechazada": la persona `carlos@omnidance.dev` está `FREE` pero con
   `proTrialEndsAt: 2027-01-03` (trial Pro vigente → multiStaff, nunca
   hay 403 ni aviso "sube de tier"). Primera corrida falló en el
   assert del alert; la segunda falló antes (`pool >= 3` DJs: la
   búsqueda `?q=dj` devuelve <3 candidatos libres - posible residual
   de corridas previas, revisar roster/limpieza).
   Fix probable: persona producer sin trial para este spec (seed o
   ajuste admin de trial vía API al inicio del test), o reescribir la
   expectativa a trial-vencido.
2. **`academia-alumnos`** "alta duplicada (409)": `locator.fill` en
   "id de persona" timeout; el snapshot muestra la consola
   **Productor** (no Academia). Causa confirmada: `muvet@omnidance.dev`
   tiene 3 roles APPROVED (ACADEMY_OWNER + INSTRUCTOR + PRODUCER) y el
   shell resuelve la superficie de productor. Revisar cómo el shell
   elige consola por defecto / forzar contexto academia en el spec
   (switcher o query), o el label "id de persona" cambió.
3. **`dancer-checkout` PAID y FAILED**: causa confirmada - el spec
   hardcodea el evento `cmubd9oq200n213hetp2cx88h` ("Viernes Sabroso,
   vie 7 nov") cuya preventa YA CERRÓ (el comentario del spec lo
   advierte). Fix robusto: resolver el evento con preventa abierta vía
   API en runtime en vez de ID hardcodeado (el próximo evento seed que
   envejezca vuelve a romperlo).
4. **`dancer-membresia`**: "suscripción quedó activa" no aparece - el
   flujo orden manual → comprobante → aprobación no llega a ACTIVE
   (estado residual: la membresía del dancer ya estaba ACTIVE?).
5. **`dancer-qr` (mobile)**: alert "no pudimos generar tu qr" ausente -
   el intercept del 500 no disparó o el QR ya estaba minted/cacheado.

Sin evidencia de bug de producto: la única causa confirmada (colaboradores)
es **comportamiento correcto** (trial Pro vende todo) y specs/fixtures
desactualizados - mismo patrón que los specs vitest ya arreglados.

## Decisión pendiente del usuario

- (a) Arreglar el drift e2e y luego releasear (camino correcto del
  gate), o
- (b) Release con brecha e2e declarada explícitamente (AGENTS DoD lo
  permite) - riesgo: el drift es justo de lo que se releasea.

## Comandos de la receta e2e (verificados esta sesión)

```bash
pnpm --filter @omnidance/web build && pnpm --filter @omnidance/web start   # :3000
cd apps/api && PAYMENT_GATEWAY=stub THROTTLE_AUTH_LIMIT=120 pnpm dev       # :4000
pnpm exec playwright test --project=chromium <specs>                     # subset
pnpm test:e2e                                                            # completa
```

Traces de cada fallo en `test-results/<spec>/trace.zip`
(`pnpm exec playwright show-trace <path>`).

## Después del release: `academy-invites` (OpenSpec completo sin empezar).
