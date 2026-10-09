# AGENTS.md - Omni-Dance

> Guía de trabajo para agentes en este repositorio. Las reglas aquí son verificables y propias del proyecto. La spec de producto/negocio completa vive en `omni-dance.md` - léela antes de cambios de producto.

## Propósito y contexto

**omnidance** es la plataforma del ecosistema SBK de Santiago (salsa, bachata, cubano): validación de actividad real por QR, reputación privada, ticketing con cargo de servicio, analíticas B2B (SaaS) y gestión de academias. Dos líneas de producto sobre un mismo backend/QR/identidad: **Omnidance Nightlife** y **Omnidance Academy**.

Reglas de dominio que no se negocian:

- Ratings y evaluaciones **siempre privados y agregados** - nunca exponer evaluaciones individuales ni identidad del evaluador.
- Scores de relación (CRM) **privados por actor** - el productor no ve el de la academia; el bailarín no ve ninguno.
- Gamificar **conductas, nunca puntajes** - el único ranking competitivo es Prime Time.
- Regla de los ~5 segundos: ninguna mecánica en pista puede exigir mirar el teléfono más que eso.
- Fotos de eventos y videos **nunca se hostean** - siempre links externos (Drive, YouTube, Vimeo).
- No competir con el POS del local (Fudo): mesas son solo reserva/registro.

## Mapa del repositorio

- `apps/web/`: Next.js + React PWA - todas las superficies (bailarín, staff, consolas B2B role-gated, pantalla del local). Design system atómico, **dark-first**, mobile-first.
- `apps/api/`: NestJS + TypeScript, **arquitectura hexagonal** (puertos/adaptadores), Prisma + Postgres, WebSockets, BullMQ sobre Redis.
- `apps/api/prisma/`: `schema.prisma`, migraciones, `seed.ts` (data de prueba: venues, productores, DJs, series y eventos reales de la escena).
- `packages/shared/`: enums, constantes de negocio y types compartidos front/back (`@omnidance/shared`).
- `docker-compose.yml`: Postgres 16 + Redis 7 con volúmenes persistentes (dev local).
- `docs/`: handoffs entre sesiones, decisiones de arquitectura, evidencia de QA/release.
- `omni-dance.md`: **spec de producto fuente de verdad** - modelo de datos, vistas, economía, decisiones.

## Comandos verificados

Ejecutar desde la raíz del repo:

- Instalar dependencias: `pnpm install`
- Levantar DB + Redis: `pnpm db:up` (docker compose)
- Preparar esquema: `pnpm db:push` · migración versionada: `pnpm db:migrate`
- Seed de datos: `pnpm db:seed` - idempotente (upserts por clave natural). `SEED_ENV=dev` (default) siembra baseline + demo Santiago con personas `*@omnidance.dev` logueables por magic link; `SEED_ENV=prod` solo baseline + admin (requiere `SEED_ADMIN_EMAIL`). Ambos se pueden re-correr sin duplicar ni pisar params editados en /admin.
- Backend dev: `pnpm dev:api` → http://localhost:4000 (requiere `pnpm --filter @omnidance/shared build` antes la primera vez - la API importa `shared/dist` en runtime)
- Frontend dev: `pnpm dev:web` → http://localhost:3000
- Ambos: `pnpm dev`
- Build completo: `pnpm build`
- Tests: `pnpm test` (Vitest unit + Playwright smoke e2e)
- Prisma Studio: `pnpm db:studio`

Para una modificación acotada, verifica primero la superficie afectada (`pnpm --filter @omnidance/api build`, etc.) y amplía según riesgo.

**CSS stale en dev**: si tras cambiar `tailwind.config.ts` o los tokens de `globals.css` el browser no refleja el cambio, el `.next` cache sirve el CSS viejo y HMR no lo invalida. Fix: matar el dev server, `rm -rf apps/web/.next`, reiniciar. Verificación rápida: `curl -s localhost:3000/_next/static/css/app/layout.css | grep -c '<token>'` debe dar >0.

## Flujo de trabajo

### Gates obligatorios (no saltarse)

Estos pasos se incumplieron en sesiones reales - son gates, no sugerencias:

- **G0 - Skills antes de actuar**: al iniciar sesión invoca `using-superpowers` ANTES de la primera acción (incluida explorar o leer archivos). Antes de implementar, invoca la skill de proceso que aplique: `openspec-new-change` para features/cambios de comportamiento, `systematic-debugging` para bugs, `test-driven-development` antes de escribir código de implementación, `brainstorming` cuando el pedido es ambiguo o creativo. Saltárselas "porque el cambio es chico" es exactamente el patrón que falló.
- **G1 - Índice del grafo**: tras leer el handoff, corre `list_projects`/`index_status` en codebase-memory-mcp. Si el proyecto no está indexado o está stale tras un cambio grande externo, `index_repository`. Todo discovery estructural posterior va por `search_graph`/`trace_path`/`get_code_snippet`; grep/glob queda reservado a literales, configs y no-código. `check_index_coverage` sobre las rutas evidenciadas antes de claims negativos o exhaustivos.
- **G2 - Spec antes de commit**: ningún feature o cambio de comportamiento se commitea sin su change en `openspec/changes/` (creado con `openspec-new-change`, con proposal/tasks/deltas) y `openspec validate --changes` verde. Al completar el trabajo el change se archiva (sin `--skip-specs` cuando tiene deltas) para que la spec canónica quede sincronizada - si el cambio no toca comportamiento (docs, refactor interno, fix de test), el change puede omitirse, pero hay que decirlo explícitamente.
- **G3 - Evidencia antes de declarar verde**: invoca `verification-before-completion` antes de afirmar que algo funciona o está completo - corre los comandos reales (typecheck, tests, smoke) y cita el output; nunca "debería pasar".

### Secuencia

1. **Al iniciar sesión**: lee el `docs/next-session-handoff-*.md` más reciente y compáralo con `git status` / commits recientes; reporta divergencias. El handoff es contexto de planificación - valida contra el código real antes de confiar en afirmaciones estructurales.
2. **Discovery estructural con Codebase Memory primero** (search_graph, trace_path, get_code_snippet); grep/glob solo para literales, no-código, o cuando el índice esté incompleto - verifica coverage antes de claims negativos o exhaustivos.
3. **Diseño antes de código** en cambios no triviales: alcance, módulos afectados, riesgos, contratos, impacto en datos/docs, criterios de aceptación.
4. **OpenSpec** para refinar el plan aprobado antes de implementar (skill `openspec-new-change`); si no está disponible, registrar la limitación y pedir dirección.
5. Implementa la **menor unidad coherente**; evita refactors no relacionados.
6. Actualiza pruebas, contratos y documentación **en el mismo cambio**.
7. Revisa el diff, verifica con los comandos reales, y comunica qué quedó verificado y qué brecha de prueba queda pendiente.
8. Al cerrar sesión o con presupuesto bajo: escribe el handoff en `docs/` con trabajo completado, bloqueos, evidencia de verificación, próximo slice y gaps conocidos.

## Reglas por tipo de cambio

### API y contratos

- Validación (zod en `packages/shared`), manejo de errores y tipos consistentes entre cliente y servidor.
- Sin `any` ni `@ts-ignore`.
- No cambies contratos públicos sin evaluar compatibilidad y plan de transición.

### Datos y persistencia

- Todo cambio de esquema → `pnpm db:migrate` (migración versionada), nunca cambios manuales.
- Evalúa impacto en seed, rollback y datos existentes.
- Nada destructivo sin autorización explícita + plan de recuperación.

### Interfaz

- Design system atómico en `apps/web/src/ui` (tokens → atoms → molecules → organisms): reutiliza, no dupliques.
- **Dark-first**: el tema oscuro es el default (la app se usa de noche en locales oscuros).
- Mobile-first: verifica 320px, mobile representativo y desktop; touch targets, estados de carga/vacío/error.
- i18n: todo string por catálogo de mensajes (next-intl), solo `es-CL` habilitado - pero las bases listas desde el día 1.
- **Indicadores de carga (estándar de carga percibida)**: <100ms se siente instantáneo → no mostrar nada; un spinner visible <300ms es "flash" y hace la app sentirse más lenta. Reglas:
  - Carga de **contenido con layout conocido** (listas, cards, detalle): `SkeletonList`/`SkeletonCard`/`SkeletonText` de `components/ui` - el skeleton se percibe más corto que un spinner porque anticipa la estructura (NN/g). Todos llevan `.page-loading` (aparición diferida 200ms) y `motion-reduce` apaga el pulse.
  - Carga de **contenido con layout desconocido** (gates de sesión/rol que deciden qué renderizar): `PageLoading` - difiere su aparición 200ms vía beacon compartido.
  - **Navegación** entre rutas o por `searchParams`: `NavPendingOverlay` (montado en `(app)/layout.tsx`, cubre toda la app) arma un overlay al click en link interno, lo muestra solo si la navegación supera 200ms y lo retira al pintar. No crear loading ad-hoc por página.
  - Feedback de **acción** (botón presionado, submit, guardar): `Spinner` inline **inmediato** - ahí la latencia la pide el usuario, no el sistema.
  - Nunca `<Spinner>` desnudo a nivel panel ni "Cargando…" de texto plano sin delay. Nunca forzar duración mínima larga (≥1s) para "que se aprecie": penaliza el caso común rápido. Si un indicador ya se mostró, basta un mínimo ~400ms anti-parpadeo.
- **Skills de diseño**: cualquier trabajo de UI pasa por `impeccable` (context por sesión, `craft-floor.md` antes de editar, `detect --json` al terminar) y `apple-design` cuando toque motion física, materiales o tipografía - detalle en "Orquestación multi-agente" §6.
- **Consolas** (`/academia`, `/productor`, `/admin`, `/soporte`): el patrón unificado (crear = CTA → page, card clickeable → ficha, acciones en ficha, destructivo en zona roja al pie, FilterBar + Pager, estados explícitos) vive en `.devin/skills/console-patterns` - toda página nueva o refactor de consola sigue ese skill.

### Documentación

- `omni-dance.md` es la spec viva - actualízala cuando cambien reglas de producto.
- README/docs cuando cambien setup, flujos o arquitectura.
- **Docs de API siempre sincronizadas** - al agregar/cambiar/quitar endpoints:
  - Swagger: ya es automático (`@nestjs/swagger` en `main.ts`) - UI en `/api/docs`, JSON en `/api/docs-json`. Mantener DTOs con `class-validator` para que el schema quede útil.
  - `node apps/api/scripts/export-api-docs.cjs` (API viva) → regenera `docs/openapi.json` + `docs/postman/omni-dance.postman_collection.json`. Commitear los regenerados junto al cambio de endpoints.
  - `docs/architecture.md` (módulos, RBAC, params, wiring, modelo) y `docs/flows.md` (secuencias/estados en mermaid) - actualizar el diagrama/sección que el cambio vuelva inexacto.

## Orquestación multi-agente

El agente principal **orquesta**; los subagentes **ejecutan**. Pipeline por feature:

1. **Orquestador - contexto pesado, nunca delegado**: handoff + grafo Codebase Memory (G1) + change OpenSpec completo (G2: proposal, spec deltas con scenarios, design, tasks). Los tasks del change son los requisitos vinculantes del implementador. Todas las decisiones de diseño y ambigüedades se resuelven **antes** de despachar.
2. **Detección de choques**: si dos pedidos tocan archivos compartidos (`schema.prisma`, i18n parts, `globals.css`, lockfile, specs canónicas), se secuencian o el orquestador integra los puntos comunes. Migraciones de DB pasan solo por el orquestador, una a la vez.
3. **Dispatch**: un subagente implementador por task con **brief autocontenido** - los subagentes no heredan la conversación ni el MCP; todo va en el prompt: paths exactos, snippets, decisiones tomadas, convenciones, evidencia del grafo (tier, generation, coverage, call-chains). Implementadores **en serie** sobre el mismo working tree (git index, lockfile). En paralelo solo van: investigaciones read-only, reviews, o scopes 100% disjuntos.
4. **Review por task**: tras cada implementación, subagente reviewer read-only sobre el diff - exige spec-compliance **y** calidad; ambas son gate.
5. **Integración (orquestador)**: revisa diffs, corre typecheck/tests, archiva el change OpenSpec, regenera docs API si tocó endpoints, escribe handoff. El implementador commitea solo su task y **nunca pushea**; los commits de integración son del orquestador.
6. **Front además**: antes de editar UI se lee `craft-floor.md` del skill `impeccable` y sus bans van en el brief; `apple-design` aplica a motion física (springs, sheets, momentum), materiales translúcidos y tipografía. Autoridad visual = sistema incumbente (`apps/web/src/ui`, tokens, globals.css); superficie nueva o redesign pasa por `init`/`shape` con el usuario primero. Al terminar UI cambiada, el orquestador corre `impeccable detect --json <targets>` **una vez** sobre el diff y corrige el batch.
7. **Excepción de tamaño**: tweaks acotados (1-2 archivos, cambio trivial) los hace el orquestador directo - despachar cuesta más que el cambio.

Roles de colaboración dentro del pipeline: Diseño (orquestador + usuario) → Implementación (subagente) → Revisión técnica (subagente reviewer: regresiones, drift de contrato, migraciones omitidas, i18n faltante) → QA funcional (orquestador o usuario, desktop y móvil) → Release (orquestador: checklist, promoción `dev → main`, supervisión del deploy).

## Límites

- **Siempre**: tests con el código, i18n por catálogo, migración versionada por cambio de schema, validación zod en contratos, diff revisado antes de commit.
- **Preguntar primero**: operaciones destructivas de datos, nuevas dependencias, cambios de contrato público, promover `dev → main`, side effects fuera del repo (push, deploy, notificaciones reales).
- **Nunca**: secretos/JWT/hashes en código, logs o commits; ratings o evaluaciones individuales expuestos; guards ad-hoc de roles; cambios de schema sin migración; editar migraciones ya aplicadas; commits con co-autoría de agente.

## Ramas y entrega

- Trabaja en `dev` por defecto; features en `feature/*` mergean a `dev`.
- Promueve `dev → main` solo tras revisión + QA + release gate.
- Hotfix en `main` → regulariza `dev` inmediatamente. **Nunca quedarse parado en `main`.**
- No mezcles cambios no relacionados ni cambios locales ajenos en la misma entrega.
- **Sin co-autoría ni firma de agente en los commits** - solo el mensaje descriptivo.
- **CI/CD**: push a `main` despliega el API (GH Actions → GHCR → SSH a la VM → migrate+seed → health gate); el front va a Netlify vía `netlify.toml` (Next.js runtime). Secrets/vars y setup de la VM en `docs/ci-cd.md`.

### Versionamiento

- SemVer `MAJOR.MINOR.PATCH`: MAJOR = incompatible (API/datos/auth); MINOR = feature compatible; PATCH = fix/docs/mantenimiento.
- Release gate (`dev → main`): definir incremento → actualizar versión + `CHANGELOG.md` (Keep a Changelog) + notas de release → tests/build/QA → tag anotado `vX.Y.Z` en el commit exacto de `main` → push → supervisar CI/deploy/health checks → sincronizar `main` de vuelta a `dev`.
- **Rollback**: nunca re-desplegar SHA informal ni mover tags. Re-desplegar el artefacto del último tag sano + health checks + documentar motivo/impacto.

## Definition of Done

- Compilan las apps/paquetes afectados.
- Tests y verificaciones relevantes pasan - o la brecha se declara explícitamente.
- Migraciones, contratos, i18n y documentación actualizados cuando corresponde.
- Diff revisado: sin archivos generados, secretos ni cambios ajenos.
- Handoff en `docs/` actualizado al cerrar la sesión.

## Seguridad

- Nunca secretos, JWTs ni hashes en logs o respuestas.
- Nunca commits con credenciales - `.env` está en `.gitignore`.
- QR rotativo (TOTP ~30s): no loggear payloads de tokens.
- Ratings privados: ningún endpoint puede filtrar evaluaciones individuales ni identidad del evaluador.

## Mantenimiento de esta guía

- Reglas breves, concretas y comprobables sobre principios genéricos.
- Actualiza la regla en el mismo cambio que la vuelve inexacta.
- Error repetido → primero automatiza su prevención (test, lint, CI) antes de añadir regla.

## Convenciones de plataforma (post-RBAC)

- **RBAC global DB-driven**: nunca crear guards ad-hoc ni listas de roles/permisos en código. Las rutas protegidas usan `@UseGuards(SessionGuard, RolesGuard)` + `@RequirePermissions(...)` de `src/common/rbac` (roles/permisos/grants viven en `Role`/`Permission`/`RolePermission`; `Role.isSuperuser` bypass, solo seed). `req.person.roles` = solo APPROVED; `req.person.roleStates` = todos con status (PENDING/SANDBOX/APPROVED/REJECTED). SANDBOX solo pasa con `@AllowSandbox()` explícito; PENDING y REJECTED nunca pasan. `@RequireRoles` queda como escape hatch - preferir permisos. Tras mutar grants llamar `invalidateRoleCatalog()` (el cache del guard es 30s).
- **Parámetros operativos**: van en `PlatformParam` (DB), se leen con `ParamsService.getNumber(key, fallback)` (cache 30s) - no hardcodear ni leer env en runtime de negocio. Edición solo vía `PUT /api/admin/params/:key` (ADMIN, audita `PARAM_UPDATE`). `GET /api/params/public` solo expone la whitelist - no agregar datos sensibles ahí.
- **Acciones admin auditan**: `AuditLog` con actorId/action/targetType/targetId/payload (prev/next).
- `tsc --noEmit` deja `tsconfig.tsbuildinfo` que confunde al watch de Nest - si `dist/` queda incompleto: `rm -rf dist tsconfig.tsbuildinfo` y reiniciar.
- Smoke RBAC/params reproducible: `node apps/api/scripts/smoke-rbac-params.cjs` (API viva en :4000).
- **PrismaService único**: los feature modules NO declaran `PrismaService` en providers - importan `PrismaModule` (módulo compartido normal, no @Global). Un solo PrismaClient/pool en runtime; los e2e TestingModule obtienen el provider transitivamente vía el feature module.
- **RBAC puntual fuera del guard**: cuando un endpoint mezcla "self o staff" (no aplica @RequirePermissions a todo el handler), usar `roleKeysHavePermission(prisma, roleKeys, perms)` de `common/rbac/roles.guard` - mismo catálogo cacheado, nunca roles literales.
- **Notificaciones best-effort**: `NotificationsService.notifySafe(personId, input)` - nunca try/catch local duplicado ni `@Optional` (los módulos que usan notifications ya importan NotificationsModule).
- **Secretos en producción**: `secretOrDevFallback(key, dev)` de `src/common/env` - fallback dev solo fuera de prod; en prod falta → fail-fast al arrancar.
- **i18n web en parts**: los namespaces nuevos van en `apps/web/src/i18n/parts/<ns>.json`, no en `messages/es-CL.json` (monolito). `src/i18n/messages.ts` hace el deep-merge y es la única fuente que alimentan `request.ts` y `layout.tsx` - al agregar un part hay que registrarlo ahí.
- **Listados públicos vs gestión**: los endpoints de listado que exponen datos de terceros mantienen la frontera de privacidad (sin ids ni estados internos); la vista de gestión es un endpoint separado bajo la misma ruta (p.ej. `GET /events/:id/table-reservations/manage`) con autorización owner/admin.
