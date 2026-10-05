# Design — dancer-nav-reorg

## Decisiones clave

1. **Ticket como fuente de verdad de asistencia futura.** RSVP (GOING/INTERESTED) se elimina: la intención declarada no validaba nada y el bookmark se reemplaza por la agenda real de tickets. `Checkin` sigue siendo la asistencia pasada.
2. **Sheet client-side para el `+`.** El bottom bar es client (`BottomNav`); el sheet es un componente client con backdrop + Escape + focus trap, QR renderizado dentro (reutilizar el componente QR existente de `/qr` si es usable embebido; si no, imagen/link destacado a `/qr`).
3. **Amigos y tickets**: `friends/upcoming-events` cruza `Friendship` aceptada → `Ticket` ACTIVE del amigo → `Event` futuro público. Perfil `/people/:id` expone `upcomingEvents` solo si `friendship.status === "friends"`.
4. **Sin `name` split**: `Person.name` es un solo campo; el perfil muestra el nombre completo tal cual (aprobado por el usuario en la conversación — no se divide nombre/apellido).

## Piezas

### API (`apps/api`)

- **Migración**: `DROP TABLE Rsvp` + enum `RsvpStatus` fuera del schema. Revisar referencias (`Rsvp` en social.service, seed, tests e2e) y limpiarlas.
- **Remove**: `social/infrastructure/rsvp.controller.ts` (`PUT/DELETE /events/:id/rsvp`, `GET /me/rsvp`), imports/registro en módulo.
- **`people.controller.ts` `GET /people/:id`**: si `friendship.status === "friends"`, agregar `upcomingEvents`: `Ticket` del perfil con `status: ACTIVE`, `event.startsAt > now`, `event.status` PUBLISHED/LIVE → `{ id, name, startsAt, venue.name }` ordenado por fecha (límite ~10).
- **`friends.controller.ts` nuevo `GET /friends/upcoming-events`**: amigos aceptados → tickets ACTIVE de esos amigos en eventos futuros → agrupar por evento → `[{ event: {id,name,startsAt,venue.name}, friends: [{id,name,photoUrl}] }]` ordenado por fecha.
- **e2e**: `friends.e2e`/`people` — upcoming-events solo amigos, no-amigos no ven; rsvp tests eliminados.

### Web (`apps/web`)

- **`BottomNav.tsx`**: `TABS_BY_ROLE.DANCER = [HOME, EVENTS, +_TAB, AMIGOS, PROFILE]`; `+` abre `DancerActionsSheet` (nuevo componente client). DANCER sale de `DRAWER_BY_ROLE` → sin hamburguesa/drawer. Otros roles intactos.
- **`DancerActionsSheet.tsx`**: portal/fixed overlay, `role="dialog" aria-modal`, backdrop click + Escape + foco, QR destacado arriba, grid de accesos (Bailes, Prácticas, Viajes, Notificaciones). `prefers-reduced-motion` respetado.
- **`/eventos`**: `view` ∈ `list|calendar|mios`; header = toggle `[≡|📅]` + ícono ticket. `mios` = fetch `GET /api/me/tickets` (verificar endpoint existente — `/entradas` ya consume algo así; reutilizar) filtrando ACTIVE+futuro, agrupado por día con `renderDayGroup`. Eliminar: `saved`, `SaveEventButton`, `NearMeButton`, `?near=`, `parseNear`, `haversine` (si no quedan usos), `myRsvps` fetch.
- **`/amigos`**: sección "Tus amigos van a" sobre el listado — fetch `friends/upcoming-events`, card evento + `AvatarStack` (foto/iniciales). Rows de amigos ya linkean a `/amigos/[id]` — verificar que todo el row sea el link.
- **`/amigos/[id]`**: renderizar `upcomingEvents` cuando venga.
- **`/bailes`**: quitar `AvailabilitySection` + `PartnerRequests` (+ sus fetchs `/me`).
- **`/practicas`**: montar ambas secciones tras el listado.
- **`/entradas`**: eliminar la página (o redirect a `/eventos?view=mios`). Verificar referencias (nav i18n keys, links internos, checkout success → /entradas).
- **i18n**: keys nuevas (`nav.friends` ya existe, `events.viewMine`, `friends.goingTo`, sheet labels); limpiar keys muertas (`events.viewSaved`, `save/saved`, `near*`).

### Datos

- Migración `drop_rsvp`: irreversible sobre datos de marcadores — aceptado por el usuario.
- `seed-dev`: quitar seeds de Rsvp si existen.

## Riesgos

- **`Rsvp` referenciado en waitlist/notifications**: verificar con search antes del drop (Waitlist es modelo aparte — no debería tocarlo).
- **Checkout success → `/entradas`**: actualizar el redirect a `/eventos?view=mios`.
- **Sheet + QR**: el QR rotativo vive en `/qr` como página; si el componente no es embebible sin refactor, el sheet muestra un acceso destacado grande a `/qr` (fallback aceptable, se decide en implementación — preferir embebido).
- **Roles multi-lente**: DANCER_ACADEMY usa drawer distinto — decidir si también pierde drawer (propuesta: sí, mismo sheet).

## Testing

- e2e API: `friends/upcoming-events` (amigos ve, no-amigos no), `people/:id` upcomingEvents gateado, endpoints rsvp → 404.
- Probes SSR/DOM: bottom bar dancer (5 ítems, + abre sheet), `/eventos` (3 vistas, sin bookmark/near), `/amigos` (sección + rows linkean), `/bailes` limpio, `/practicas` con secciones.
- Suite completa + `tsc` + `ALL_KEYS_OK` + detector impeccable.
