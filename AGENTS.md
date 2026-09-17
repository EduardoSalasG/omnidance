# AGENTS.md — Omni-Dance

> Guía de trabajo para agentes en este repositorio. Las reglas aquí son verificables y propias del proyecto. La spec de producto/negocio completa vive en `omni-dance.md` — léela antes de cambios de producto.

## Propósito y contexto

**omnidance** es la plataforma del ecosistema SBK de Santiago (salsa, bachata, cubano): validación de actividad real por QR, reputación privada, ticketing con cargo de servicio, analíticas B2B (SaaS) y gestión de academias. Dos líneas de producto sobre un mismo backend/QR/identidad: **Omnidance Nightlife** y **Omnidance Academy**.

Reglas de dominio que no se negocian:

- Ratings y evaluaciones **siempre privados y agregados** — nunca exponer evaluaciones individuales ni identidad del evaluador.
- Scores de relación (CRM) **privados por actor** — el productor no ve el de la academia; el bailarín no ve ninguno.
- Gamificar **conductas, nunca puntajes** — el único ranking competitivo es Prime Time.
- Regla de los ~5 segundos: ninguna mecánica en pista puede exigir mirar el teléfono más que eso.
- Fotos de eventos y videos **nunca se hostean** — siempre links externos (Drive, YouTube, Vimeo).
- No competir con el POS del local (Fudo): mesas son solo reserva/registro.

## Mapa del repositorio

- `apps/web/`: Next.js + React PWA — todas las superficies (bailarín, staff, consolas B2B role-gated, pantalla del local). Design system atómico, **dark-first**, mobile-first.
- `apps/api/`: NestJS + TypeScript, **arquitectura hexagonal** (puertos/adaptadores), Prisma + Postgres, WebSockets, BullMQ sobre Redis.
- `apps/api/prisma/`: `schema.prisma`, migraciones, `seed.ts` (data de prueba: venues, productores, DJs, series y eventos reales de la escena).
- `packages/shared/`: enums, constantes de negocio y types compartidos front/back (`@omnidance/shared`).
- `docker-compose.yml`: Postgres 16 + Redis 7 con volúmenes persistentes (dev local).
- `docs/`: handoffs entre sesiones, decisiones de arquitectura, evidencia de QA/release.
- `omni-dance.md`: **spec de producto fuente de verdad** — modelo de datos, vistas, economía, decisiones.

## Comandos verificados

Ejecutar desde la raíz del repo:

- Instalar dependencias: `pnpm install`
- Levantar DB + Redis: `pnpm db:up` (docker compose)
- Preparar esquema: `pnpm db:push` · migración versionada: `pnpm db:migrate`
- Seed de datos: `pnpm db:seed`
- Backend dev: `pnpm dev:api` → http://localhost:4000
- Frontend dev: `pnpm dev:web` → http://localhost:3000
- Ambos: `pnpm dev`
- Build completo: `pnpm build`
- Tests: `pnpm test` (Vitest unit + Playwright smoke e2e)
- Prisma Studio: `pnpm db:studio`

Para una modificación acotada, verifica primero la superficie afectada (`pnpm --filter @omnidance/api build`, etc.) y amplía según riesgo.

## Flujo de trabajo

1. **Al iniciar sesión**: lee el `docs/next-session-handoff-*.md` más reciente y compáralo con `git status` / commits recientes; reporta divergencias. El handoff es contexto de planificación — valida contra el código real antes de confiar en afirmaciones estructurales.
2. **Discovery estructural con Codebase Memory primero** (search_graph, trace_path, get_code_snippet); grep/glob solo para literales, no-código, o cuando el índice esté incompleto — verifica coverage antes de claims negativos o exhaustivos.
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
- i18n: todo string por catálogo de mensajes (next-intl), solo `es-CL` habilitado — pero las bases listas desde el día 1.

### Documentación

- `omni-dance.md` es la spec viva — actualízala cuando cambien reglas de producto.
- README/docs cuando cambien setup, flujos o arquitectura.

## Roles de colaboración (multi-agente)

1. **Diseño**: alcance, dependencias, riesgos, aceptación.
2. **Implementación**: código + pruebas + docs asociados.
3. **Revisión técnica**: regresiones, drift de contrato, migraciones omitidas, i18n faltante.
4. **QA funcional**: flujo completo end-to-end, desktop y móvil.
5. **Release**: checklist, promoción `dev → main`, supervisión del deploy.

Paraleliza con subagentes solo tareas independientes (sin estado compartido ni dependencias secuenciales).

## Ramas y entrega

- Trabaja en `dev` por defecto; features en `feature/*` mergean a `dev`.
- Promueve `dev → main` solo tras revisión + QA + release gate.
- Hotfix en `main` → regulariza `dev` inmediatamente. **Nunca quedarse parado en `main`.**
- No mezcles cambios no relacionados ni cambios locales ajenos en la misma entrega.
- **Sin co-autoría ni firma de agente en los commits** — solo el mensaje descriptivo.

### Versionamiento

- SemVer `MAJOR.MINOR.PATCH`: MAJOR = incompatible (API/datos/auth); MINOR = feature compatible; PATCH = fix/docs/mantenimiento.
- Release gate (`dev → main`): definir incremento → actualizar versión + `CHANGELOG.md` (Keep a Changelog) + notas de release → tests/build/QA → tag anotado `vX.Y.Z` en el commit exacto de `main` → push → supervisar CI/deploy/health checks → sincronizar `main` de vuelta a `dev`.
- **Rollback**: nunca re-desplegar SHA informal ni mover tags. Re-desplegar el artefacto del último tag sano + health checks + documentar motivo/impacto.

## Definition of Done

- Compilan las apps/paquetes afectados.
- Tests y verificaciones relevantes pasan — o la brecha se declara explícitamente.
- Migraciones, contratos, i18n y documentación actualizados cuando corresponde.
- Diff revisado: sin archivos generados, secretos ni cambios ajenos.
- Handoff en `docs/` actualizado al cerrar la sesión.

## Seguridad

- Nunca secretos, JWTs ni hashes en logs o respuestas.
- Nunca commits con credenciales — `.env` está en `.gitignore`.
- QR rotativo (TOTP ~30s): no loggear payloads de tokens.
- Ratings privados: ningún endpoint puede filtrar evaluaciones individuales ni identidad del evaluador.

## Mantenimiento de esta guía

- Reglas breves, concretas y comprobables sobre principios genéricos.
- Actualiza la regla en el mismo cambio que la vuelve inexacta.
- Error repetido → primero automatiza su prevención (test, lint, CI) antes de añadir regla.
