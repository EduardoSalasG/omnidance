# Domain Wiring + Endpoints Faltantes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:dispatching-parallel-agents / subagent-driven-development. Ejecutar como ola paralela con scopes disjuntos + integración central.

**Goal:** Cerrar el backlog del handoff: notificaciones wireadas, badges por evento real, endpoints sociales faltantes (me/rsvp, venues, partner-requests, availability, transfer) y gaps de schema.

**Architecture:** 6 agentes en paralelo con ownership de archivos disjunto. NADIE edita `*.module.ts` ni `app.module.ts` — el integrador registra providers/controllers. Solo el agente de schema toca `schema.prisma` + corre `db push`/`generate`. i18n pre-poblado por el integrador.

**Spec:** `docs/next-session-handoff-2026-09-17.md` (backlog priorizado) + contratos abajo.

## Global Constraints

- API: NestJS hexagonal, prefijo global `/api`, Vitest. Tests: cada agente corre SOLO sus specs (`npx vitest run test/<archivo>`); suite completa la corre el integrador (e2e comparten DB).
- Web: Next.js mobile-first, dark, es-CL, touch targets ≥44px, átomos en `components/ui`.
- RBAC: `@UseGuards(SessionGuard, RolesGuard)` + `@RequirePermissions`. Rutas de consumidor solo `SessionGuard`.
- NO editar: `*.module.ts`, `app.module.ts`, `package.json`, `schema.prisma` (salvo agente C), `messages/es-CL.json` (pre-poblado).

## Contratos API (definidos upfront — los agentes web consumen esto)

- `GET /me/rsvp` → `[{ eventId, status, createdAt }]` (status GOING|INTERESTED)
- `GET /venues` → `[{ id, name, address, capacity }]` (active=true)
- `POST /partner-requests` `{styleId?, role?, level?, location?, note?}` → request; `GET /partner-requests` → feed OPEN `[{id, person:{id,name,photoUrl}, styleId, style:{name}|null, role, level, location, note, createdAt}]`; `POST /partner-requests/:id/close` (owner)
- `POST /availability` `{available:boolean, until?, location?}` → toggle; `GET /availability` → `[{person:{id,name,photoUrl}, location, until, updatedAt}]`
- `POST /tickets/:id/transfer` `{toEmail}` → mueve `ownerId`, setea `giftedFromId` (buyerId queda); 404 sin ticket, 400 email inexistente/igual, 409 no ACTIVE
- `GET /gamification/:eventId/missions` → ya existe (lista misiones + completadas)
- Check-in response (EntryPass): agrega `passType` para que staff no muestre "sin entrada"
- `GET /academies/:id/attendance` items agregan `person:{id,name,email}`

## Agents

### A — Domain wiring (backend)
**Files:** `src/sessions/domain/sessions.service.ts`, `src/sessions/infrastructure/sessions.controller.ts`, `src/payments/infrastructure/webhook.controller.ts`, `src/social/infrastructure/waitlist.controller.ts`, `src/gamification/domain/*`, tests propios.
- notify() en: session invite (→invitee, SOCIAL), confirm/decline (→inviter), payment PAID/FAILED (→buyer, TRANSACTIONAL), waitlist promote (→person).
- Badge evaluation hook en confirm + rate (gamification service existente — lazy eval hoy).
- `SessionStatus.RATED` aplicado tras rate.
- Necesita `NotificationsService` + gamification service inyectables → **documentar imports de módulo requeridos** (integrador cablea).

### B — Social + misc endpoints (backend)
**Files:** `src/social/infrastructure/rsvp.controller.ts` (+GET /me/rsvp), nuevos `venues.controller.ts`, `partner-requests.controller.ts`, `availability.controller.ts`, `src/social/domain/*` si hace falta, `src/payments/infrastructure/` (transfer: nuevo `tickets.controller.ts` o dentro del existente de tickets/mine), tests.
- Todos los contratos de arriba. Permisos: consumidor autenticado; close solo owner; transfer solo owner del ticket.

### C — Schema gaps (backend) — ÚNICO que toca schema.prisma
**Files:** `prisma/schema.prisma`, `src/payments/infrastructure/checkout.controller.ts`, `src/checkins/*`, `src/social/infrastructure/guest-lists.controller.ts`, `src/social/infrastructure/practices.controller.ts`, `src/events/*` (venueId optional types), `src/admin/*` (reject → REJECTED si el modelo lo soporta).
- `Checkin.note String?`, `GuestListEntry.createdAt @default(now())`, `Event.venueId` opcional, `Payment.eventId String?` + `discountCodeId String?` (escribirlos en checkout).
- Correr `npx prisma db push` + `npx prisma generate`. Fix de tipos downstream (venueId nullable).
- Manual checkin acepta `note`; response EntryPass incluye `passType`.

### D1 — Web consumer flows
**Files:** `app/eventos/[id]/page.tsx` + `components/rsvp/RsvpControls.tsx`, `app/entradas/page.tsx`, `app/practicas/page.tsx`, `app/productor/page.tsx`.
- RSVP preload desde GET /me/rsvp; missions section en evento; transfer modal en entradas; venue datalist en practicas + productor.

### D2 — Web social discovery (/bailes hub)
**Files:** `app/bailes/page.tsx` + componentes nuevos bajo `components/social/`.
- Toggle "Disponible para bailar" (POST /availability), feed quién está disponible, partner-requests composer + feed OPEN + close propio.

### E — Minor data fixes (backend+web, disjunto)
**Files:** `src/academies/infrastructure/attendance.controller.ts` (join person), `app/staff/[eventId]/page.tsx` (label EntryPass via `passType`), `messages/es-CL.json` solo si falta "hasta" (integrador pre-agrega).

## Integration (yo)
- Wirear módulos reportados por A/B; correr suite completa + typecheck + smoke; commit por scope.
