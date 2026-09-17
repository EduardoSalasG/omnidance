# Auth + Eventos públicos + QR personal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un usuario puede registrarse con magic link (Resend), ver el calendario público de eventos seedeados, y obtener su QR personal rotativo.

**Architecture:** NestJS hexagonal — cada feature es un módulo con `domain/` (puertos + reglas), `application/` (use-cases) e `infrastructure/` (adapters NestJS: controllers, prisma repos). Web Next.js consume la API con fetch server-side; auth via cookie httpOnly con JWT (`jose`).

**Tech Stack:** NestJS 10, Prisma 5, jose (JWT), Resend (magic links), Next.js 14 App Router, Tailwind, Vitest.

**Spec:** `omni-dance.md` — secciones 4 (core loop/QR), 10 (reglas de sistema: auth, onboarding B2B), 16 (arquitectura).

## Global Constraints

- Backend hexagonal: dominio nunca importa NestJS ni Prisma; dependencias apuntan hacia adentro.
- No `any` ni `@ts-ignore`.
- Auth: Google OAuth + magic link (Resend). Magic link es la vía inicial; Google OAuth queda como adapter intercambiable detrás del mismo puerto.
- JWT con `jose`, secreto `JWT_SECRET` de env.
- QR rotativo: token firmado con `QR_SECRET`, TTL ~60s, payload `{ personId, iat, exp }` — staff valida offline contra la firma.
- i18n: catálogo de mensajes desde el día 1 (`next-intl`), solo `es-CL` habilitado.
- PWA dark-first; mobile-first; targets ≥44px.
- Commits en `dev`, mensajes descriptivos, sin coautoría.
- Tests con Vitest; cada task termina en commit.

---

### Task 1: Módulo `auth` — magic link + JWT

**Files:**
- Create: `apps/api/src/auth/domain/ports.ts`
- Create: `apps/api/src/auth/domain/auth.service.ts`
- Create: `apps/api/src/auth/infrastructure/auth.controller.ts`
- Create: `apps/api/src/auth/infrastructure/prisma-auth.repo.ts`
- Create: `apps/api/src/auth/infrastructure/resend-mailer.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/domain/auth.service.spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/auth/magic-link` body `{ email: string }` → `202 { sent: true }` (siempre 202, no filtra existencia)
  - `GET /api/auth/verify?token=<jwt>` → setea cookie `omnidance_session` httpOnly + redirect a `WEB_URL`
  - `AuthService.issueSession(personId: string): Promise<string>` (JWT 30d)
  - `AuthService.createMagicToken(email: string): Promise<string>` (JWT 15min, claim `purpose:"magic"`)
  - `Mailer.send(to: string, subject: string, html: string): Promise<void>` (puerto)
- Consumes: `Person` (upsert por email, rol DANCER por defecto), `jose`, Resend API key `RESEND_API_KEY` (opcional en dev: si falta, loguea el link a consola y retorna).

- [ ] **Step 1: failing test** — `auth.service.spec.ts`: `issueSession` retorna JWT verificable con `personId`; `createMagicToken` produce token con `purpose:"magic"` y exp ~15min. Verificar que falla (módulo no existe).
- [ ] **Step 2:** `domain/ports.ts` — `export interface Mailer { send(...): Promise<void> }`, `export interface AuthRepo { upsertByEmail(email): Promise<Person> }`.
- [ ] **Step 3:** `auth.service.ts` — implementa con `jose.SignJWT`/`jwtVerify`, secretos por constructor.
- [ ] **Step 4:** `resend-mailer.ts` — adapter `fetch` a `https://api.resend.com/emails`; si `RESEND_API_KEY` ausente → `console.log` del link (dev).
- [ ] **Step 5:** `prisma-auth.repo.ts` — `prisma.person.upsert({ where: { email }, create: { email, roles: { create: { role: "DANCER" } } } })`.
- [ ] **Step 6:** `auth.controller.ts` — los dos endpoints; `verify` valida `purpose`, emite sesión, `res.cookie(...).redirect(WEB_URL)`.
- [ ] **Step 7:** `auth.module.ts` + registrar en `AppModule`. `pnpm --filter @omnidance/api test` verde. Commit.

### Task 2: Guard de sesión + `GET /api/me`

**Files:**
- Create: `apps/api/src/auth/infrastructure/session.guard.ts`
- Create: `apps/api/src/people/people.controller.ts`
- Test: `apps/api/test/me.e2e-spec.ts` (supertest no instalado → usar `fetch` contra app Nest en puerto efímero con `app.listen(0)`)

**Interfaces:**
- Produces: `SessionGuard` (lee cookie `omnidance_session`, verifica JWT, adjunta `req.person`); `GET /api/me` → `{ id, name, email, roles: string[] }` o 401.

- [ ] **Step 1:** failing test — request sin cookie → 401; con cookie válida → 200 con roles.
- [ ] **Step 2:** `session.guard.ts` implementa `CanActivate`; extrae Bearer o cookie, `jwtVerify`.
- [ ] **Step 3:** `people.controller.ts` con `@UseGuards(SessionGuard)`.
- [ ] **Step 4:** test verde + commit.

### Task 3: QR personal rotativo

**Files:**
- Create: `apps/api/src/qr/domain/qr.service.ts`
- Create: `apps/api/src/qr/qr.controller.ts`
- Create: `apps/api/src/qr/qr.module.ts`
- Test: `apps/api/src/qr/domain/qr.service.spec.ts`

**Interfaces:**
- Produces:
  - `QrService.mint(personId: string): Promise<{ token: string; expiresAt: string }>` — JWT `purpose:"qr"`, TTL 60s, firmado con `QR_SECRET`.
  - `QrService.verify(token: string): Promise<{ personId: string }>` — rechaza expirado/propósito erróneo.
  - `GET /api/qr/mine` (SessionGuard) → `{ token, expiresAt }`.

- [ ] **Step 1:** failing test — mint/verify round-trip; token expirado (exp en pasado) rechaza; token con `purpose:"magic"` rechaza.
- [ ] **Step 2:** implementación con `jose`.
- [ ] **Step 3:** controller + module + tests verdes + commit.

### Task 4: Eventos públicos (read-only)

**Files:**
- Create: `apps/api/src/events/infrastructure/events.controller.ts`
- Create: `apps/api/src/events/infrastructure/prisma-events.repo.ts`
- Create: `apps/api/src/events/events.module.ts`
- Test: `apps/api/test/events.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `GET /api/events` → lista publicados próximos: `{ id, title, startsAt, series: { name }, venue: { name, address }, coverUrl }[]`, orden `startsAt asc`, `status in (PUBLISHED, LIVE)`, `startsAt >= now-12h`.
  - `GET /api/events/:id` → detalle + `djs[]` + `styles[]` + `capacity`.

- [ ] **Step 1:** failing test e2e — seed existe → `/api/events` retorna ≥1 evento con shape esperado.
- [ ] **Step 2:** repo con `prisma.event.findMany` + includes.
- [ ] **Step 3:** controller + module. Test verde + commit.

### Task 5: Web — catálogo `next-intl` + página login + `/eventos` + `/qr`

**Files:**
- Create: `apps/web/messages/es-CL.json`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/eventos/page.tsx`
- Create: `apps/web/src/app/qr/page.tsx`
- Create: `apps/web/src/lib/api.ts`
- Modify: `apps/web/next.config.mjs` (next-intl plugin), `apps/web/src/app/layout.tsx` (provider)

**Interfaces:**
- Consumes: `POST /api/auth/magic-link`, `GET /api/events`, `GET /api/qr/mine`, `GET /api/me`.
- `/eventos`: server component fetch a `API_URL`; cards dark-first (portada, título, serie, venue, fecha `Intl.DateTimeFormat("es-CL")`).
- `/login`: form email → POST magic-link → estado "revisa tu correo".
- `/qr`: client component; fetch `/api/qr/mine` cada 50s; renderiza QR con `qrcode` (npm) a SVG; si 401 → CTA a login.

- [ ] **Step 1:** `pnpm --filter @omnidance/web add next-intl qrcode && pnpm --filter @omnidance/web add -D @types/qrcode`.
- [ ] **Step 2:** `messages/es-CL.json` con las ~20 strings de estas pantallas.
- [ ] **Step 3:** `lib/api.ts` — `apiFetch(path, opts)` con `API_URL` (default `http://localhost:4000`), `credentials:"include"`.
- [ ] **Step 4:** páginas. `pnpm --filter @omnidance/web build` pasa; verificación manual: login→link en consola API→/qr muestra QR→/eventos lista seed.
- [ ] **Step 5:** commit.

---

## Self-Review

- **Spec coverage:** auth magic-link ✓(§10), QR rotativo TTL+firmado ✓(§4), eventos públicos ✓(§5), i18n base ✓(§16). Google OAuth, B2B sandbox, decline/discard, Prime Time → planes siguientes.
- **Placeholders:** ninguno — cada paso tiene archivo, firma o código.
- **Tipos consistentes:** `AuthService`/`QrService`/`Mailer`/`SessionGuard` usados igual en producción y tests.
