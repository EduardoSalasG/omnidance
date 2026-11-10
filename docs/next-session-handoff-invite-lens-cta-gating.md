# Handoff: invite→lente academy + fixes CTA gating COBROS

Sesión 2026-11-10 (tarde-noche). Verificación post-deploy 1.17.0
cerrada, pitch comercial consolidado, y dos changes OpenSpec
implementados tras QA manual sobre Academia Tumbao (COBROS).

## Trabajo completado

### 1. Post-deploy 1.17.0 (cerrado, sin acción)

- `GET /api/health` prod → 200 re-verificado. PR #3 dev→main mergeado,
  deploy success, migraciones corridas.
- Dry-run `migrate-legacy` en prod: **descartado por el owner** (prod
  sin data real, no aporta).
- dev queda 1 commit sobre main: solo docs/handoffs.

### 2. Pitch comercial por tier (doc nuevo, no commiteado antes)

- `docs/pitch-comercial-tiers.md`: pitch por tier (para quién,
  promesa, número que cierra, objeciones específicas + transversales),
  reglas del closer y cheat sheet. Consolidaba material disperso de
  `estrategia-comercial-2026-10-22.md` + landings + `omni-dance.md` §10.
- **Divergencias detectadas (§5 del doc, pendiente decisión owner)**:
  `TierPrice` en dev DB fue editado por /admin con .990 que no calza
  con spec ($39.500/$79.700/$120.500 academia; $79.700/$169.500
  producer - la spec prohíbe charm pricing); `academy_billing.
  trial_days`=30 en dev vs 15 en spec; `producer_tier.growth_monthly_
  clp`=79700 igual que starter en params (¿bug de seed?).

### 3. Change `invite-academy-lens` (implementado)

Decisión aprobada por owner: opción cookie (no academy default global,
el funnel nightlife manda).

- `auth.controller.ts`: `consumeAcademyInvites` → `boolean`; al
  consumir ≥1 invite, `GET /auth/verify` y `POST /auth/otp/verify`
  setean cookie `omnidance:lens=academy` (JS-readable, ~5min).
- `BottomNav.tsx`: efecto con sesión resuelta lee la cookie →
  `setViewMode("academy")` → expira. Cubre cuenta nueva (vía
  /bienvenida) y existente.
- **Gap conocido**: push `academy.invite` de cuenta existente abre la
  app sin pasar por verify → sin flip (decidido fuera de este slice).
- Spec controller: 3 tests nuevos (cookie con invite / sin invite /
  OTP). Archivo completo: 25/25 verde.

### 4. Change `academy-console-cta-gating` (implementado)

Bugs reportados por owner en QA manual de Tumbao (COBROS):

- `series/page.tsx` + `equipo/page.tsx`: `ConsoleHeader` movido dentro
  del render-prop de `AcademyGate`; `actions` condicionado a
  `academyHasFeature(academy, "classes"|"staff")`. Antes el CTA de
  crear quedaba visible junto al paywall.
- `promos/page.tsx` + `series/page.tsx`: eliminado el botón de crear
  duplicado del empty state (regla nueva: un solo CTA de crear por
  pantalla, el del header).
- `academy-gate.tsx`: selector de academia `academies.length>1 ||
  canAddAcademy` (era `|| canCreate` → selector inútil de 1 opción en
  COBROS single-academy). Misma regla que `AcademySwitcher`.
- `.devin/skills/console-patterns/SKILL.md` §1 + estados: regla "un
  solo CTA de crear por pantalla; empty state = mensaje solo".
- Auditoría: `planes/page.tsx` (feature COBROS, correcto sin gate) y
  `promos` idem; `asistencia`/`horarios`/`niveles` son redirects.

## Verificación corrida (evidencia)

- `npx vitest run auth.controller.spec.ts` → 25/25 verde.
- `pnpm --filter @omnidance/api typecheck` → OK.
- `pnpm --filter @omnidance/web typecheck` → OK.
- `openspec validate --changes` → 3/3 OK.
- Pendiente QA manual: refrescar /academia/series y /equipo en COBROS
  (paywall sin CTA), promos sin botón gris, inicio sin selector; y el
  flujo invite completo (nuevo invite → mail → verde desde la llegada).

## Escenario QA vivo (dev)

- Academia Tumbao `cmua3gao7003buas59g9fyxn5`: tier COBROS, Flow BYO
  ACTIVE+verified (sandbox), planes Normal $40.000 MONTHLY / Clase
  suelta $10.000 SINGLE / Clase de prueba $0 CLASS_PACK, métodos
  Transferencia+Efectivo. Owner `tumbao@omnidance.dev`/`omnidance123`.
- API dev corre con `API_URL=https://hvr4lkk3-4000.brs.devtunnels.ms`
  (retorno Flow funciona; devtunnel vivo al cierre).
- Alumno probado: `salas.eduardo03+alumno@gmail.com` (invite consumido,
  SIN enrollment - invitar ≠ inscribir, decisión vigente).
- Subs existentes Tumbao: `salas.eduardo.backup@gmail.com` ACTIVE;
  `salas.eduardo03@gmail.com`/`+mp`/`@outlook` PENDING_CARD.

## Pendientes generales (sin cambio)

- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Decisión owner: modelo del import (a) enrollment INACTIVE sin plan
  vs (b) AcademyInvite bulk.
- Decisión owner NUEVA: divergencias de precio TierPrice dev vs spec
  (ver §2).
- Gap lente por push `academy.invite` (ver §3).

## Ideas no pedidas detectadas en el camino

- `consumeAcademyInvites` consume TODOS los invites pendientes del
  email para esa academia (loop) - correcto pero documentarlo.
- El catch de `/auth/verify` traga el error real (solo "Link inválido
  o expirado") - dificulta debug; un log warn estructurado ayudaría.
