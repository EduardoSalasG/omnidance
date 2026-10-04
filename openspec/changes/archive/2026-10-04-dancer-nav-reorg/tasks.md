# Tasks — dancer-nav-reorg

## 1. API: eliminar RSVP

- [x] Migración: drop `Rsvp` + enum `RsvpStatus` del schema (`pnpm db:migrate`); quitar el `tx.rsvp.create` del host en `practices.controller.ts` (host ya es `hostId`)
- [x] Eliminar `rsvp.controller.ts` y su registro en `social.module.ts`; limpiar refs en `social.service.ts`
- [x] Limpiar tests e2e que usan rsvp (`social*.e2e.spec.ts`)

## 2. API: friends discovery

- [x] `GET /api/people/:id` → `upcomingEvents` solo si `friendship.status === "friends"` (tickets ACTIVE, eventos futuros, `{id,name,startsAt,venue.name}`, ≤10)
- [x] `GET /api/friends/upcoming-events` → eventos futuros con ≥1 amigo confirmado con ticket ACTIVE + amigos que van `{id,name,photoUrl}`
- [x] e2e: gate de amistad en ambos; 404 en rsvp eliminados

## 3. Web: nav dancer + sheet

- [x] `BottomNav`: DANCER = `[Inicio, Eventos, +, Amigos, Perfil]`; `+` abre sheet (no navega); DANCER fuera de `DRAWER_BY_ROLE` (sin hamburguesa/drawer — decidir también para DANCER_ACADEMY)
- [x] `DancerActionsSheet` (client): `role="dialog"`, backdrop/Escape/focus, QR destacado embebido (fallback: link destacado a /qr), accesos Bailes/Prácticas/Viajes/Notificaciones, reduced-motion
- [x] Eliminar `/entradas` del nav; /entradas fuera del nav; queda como página de gestión deep-linked (transferencia) enlazada desde view=mios y post-checkout — la agenda vive en Mis eventos

## 4. Web: eventos

- [x] `/eventos`: vista `mios` (fetch `/tickets/mine`, filtrar ACTIVE+futuro, agrupar por día, hint "tu QR es la entrada"); switcher = `[≡|📅]` + ícono ticket
- [x] Eliminar: vista `saved`, `SaveEventButton`, `NearMeButton`, `?near=`, `parseNear`, `haversine`, fetch `myRsvps`
- [x] i18n: keys nuevas (`viewMine`, `emptyMine`, sheet) y limpiar muertas (`viewSaved`, `save`, `saved`, `near*`)

## 5. Web: amigos / bailes / prácticas

- [x] `/amigos`: sección "Tus amigos van a" (card evento + avatar stack) sobre el listado
- [x] `/amigos/[id]`: sección "Próximos eventos" si el endpoint la devuelve
- [x] `/bailes`: solo historial de sesiones (quitar `AvailabilitySection` + `PartnerRequests`)
- [x] `/practicas`: montar ambas secciones tras el listado/crear

## 6. Verificación + docs

- [x] `pnpm test` API completo; `tsc` web+api; `ALL_KEYS_OK`; detector impeccable
- [x] Probes SSR/DOM: bottom bar + sheet, `/eventos?view=mios`, `/amigos`, `/bailes`, `/practicas`, redirect `/entradas`
- [x] `architecture.md` (nav/eventos/amigos) + openapi/postman regenerados
- [x] Commit feature → merge `dev` → push
