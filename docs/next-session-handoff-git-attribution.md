# Handoff: cierre trial-lifecycle-15d + saneamiento de historia git

Sesión 2026-11-09 (noche). Dos frentes: cierre del change
`trial-lifecycle-15d` y saneamiento de la atribución a agentes en la
historia git (detectado por el usuario en GitHub).

## 1. Cierre del change (commits en `dev`, hashes post-rewrite)

- `cf7b8716` docs(platform-trials): cierre task 8 - docs del ciclo de
  vida, exports API y spec entitlements.
  - `omni-dance.md`: trial 15d, bloque "Trials de plataforma",
    `activity_event` en el modelo.
  - `docs/architecture.md`: fila `ActivityEvent`, endpoints admin
    (PATCH trial ×2, GET /admin/trials, GET /admin/users/:id/timeline),
    bullets del ciclo de vida en PlatformSubscriptionsService, barridos
    en `subscriptions.reconcile`.
  - `docs/flows.md`: sección "Ciclo de vida del trial de plataforma"
    (mermaid) antes del ledger BIAN.
  - `docs/qa-flows-inventory.md`: palanca backfill en §0, card CX en
    `/perfil`, postura trial-vencido en el gate por tier, KPIs/sección
    trials en inicio admin, línea de vida + PATCH pro-trial en ficha,
    PATCH trial en `/admin/academias`, bloque correos/promo.
  - `docs/openapi.json` + postman regenerados (375 paths) contra API
    viva.
  - Fix de spec roto: `actor-entitlements.spec.ts` - el cambio de
    `featuresForAcademy` (tier null + trial vencido → []) había dejado
    rojo el caso `academias del owner`; ahora cubre trial vigente →
    STUDIO y trial vencido → `[]`. 12/12 verde.
- Change archivado con `openspec archive trial-lifecycle-15d --yes`
  (hubo que borrar lock stale
  `openspec/changes/archive/.openspec-archive.lock` tras el primer
  intento abortado). Specs canónicas actualizadas: academy-billing,
  admin, admin/home-insights, platform-trials (nueva).
- Verificación: `npx tsc --noEmit` api 0 errores; `pnpm lint` 0 errores
  (74 warnings preexistentes); `openspec validate --changes` 2/2 verde
  (quedan academy-invites y multipais-foundation).

## 2. Saneamiento de atribución a agentes en git

**Problema**: 201 commits con trailers de firma de agente en el cuerpo
y 4 commits autoreados por la identidad del agente (dev@cognition.ai),
además de 2 tags anotados (v1.8.0, v1.15.6) con los mismos trailers.

**Resuelto**:

- Reescritura completa con `git filter-branch` (env-filter autor/
  committer + msg-filter que borra las líneas de firma + stripspace)
  sobre `--all`: `dev`, `main`, 18 ramas feature locales y los 40 tags
  (21 anotados recreados). Los 2 tags con firma se recrearon con
  mensaje limpio conservando taggerdate.
- Verificación: `git log --all` → 0 referencias; único autor/committer
  EduardoSalasG; `git fsck --unreachable` vacío tras GC.
- **Force-push aplicado**: `dev`, `main` y los 40 tags. Remoto verificado
  con `git ls-remote` (hashes nuevos coinciden).
- Respaldo completo pre-rewrite:
  `C:\Users\salas\Documents\omnidance-pre-scrub-2026-11-09.bundle`
  (bundle verificado, historia completa; conservar o borrar a criterio).

**Endurecimiento (commit `807902c0`)**:

- `.githooks/commit-msg`: rechaza mensajes con referencias a agentes o
  trailers de atribución (probado en vivo: bloqueó un mensaje que
  nombraba los patrones).
- `.githooks/pre-commit`: exige user.name/user.email configurados y no
  bot (probado: rechazó `Devin <devin@cognition.ai>` vía `git -c`).
- `core.hooksPath=.githooks` configurado localmente y auto-activable
  por `postinstall` (`scripts/setup-git-hooks.cjs`).
- `.github/workflows/commit-guard.yml`: misma regla server-side sobre
  el rango de cada push/PR a dev/main.
- `AGENTS.md` del repo y `~/AppData/Roaming/devin/AGENTS.md` global:
  regla explícita - autor/committer = identidad real, sin trailers ni
  firmas de agente, prohibido `--no-verify` salvo autorización.
- Nota: el commit que instala la guardia no puede nombrar los patrones
  literales en su mensaje (el hook los bloquea también en prosa).

## Pendiente

- `academy-invites` (change OpenSpec completo sin empezar) +
  `multipais-foundation`.
- Deploy de prod disparado por el force-push a `main`: misma árbol,
  efecto nulo; revisar Actions si se quiere confirmación.
- Otros clones/forks del repo: necesitan `git reset --hard origin/dev`
  o re-clonar (todos los SHAs cambiaron).
- La API de dev quedó corriendo en background (puerto 4000) desde esta
  sesión; matar si no se usa.
