# Handoff — 2026-09-21 (reorg experiencia bailarín)

## Mergeado a `dev` (2518dac, pusheado)

**`dancer-nav-reorg`** — reorganización de la experiencia del bailarín (OpenSpec completo en `openspec/changes/dancer-nav-reorg/`):

- **Rsvp eliminado por completo**: modelo, `rsvp.controller.ts`, `PUT/DELETE /events/:id/rsvp`, `GET /me/rsvp`, `SaveEventButton`, `RsvpControls`, vista `saved`, seeds. La asistencia real es `Ticket` ACTIVE + `Checkin`. **Waitlist sigue existiendo** (modelo separado — no era Rsvp).
- **"Cerca de ti" eliminado**: `?near=`, `NearMeButton`, `lib/geo.ts`. `venue.lat/lng` sigue en la API sin uso por ahora.
- **`/eventos?view=mios`**: "Mis eventos" = agenda de eventos futuros con ticket ACTIVE propio (SSR con cookie forward a `/tickets/mine`). El switcher quedó `[≡|📅]` + ícono ticket.
- **`/entradas` fuera del nav** pero la página sigue viva (transferencia de tickets + post-checkout la enlazan). "Gestionar entradas" link desde vista mios.
- **Nav DANCER**: `[Inicio] [Eventos] [+] [Amigos] [Perfil]`; el "+" es botón (`sheet: true`) que abre `DancerActionsSheet` (bottom sheet, QR destacado vía `MyQr compact`, grid Bailes/Prácticas/Viajes/Notificaciones — en lente academia: Academia/Prácticas/Eventos/Notificaciones). **DANCER ya no tiene drawer** en ninguna lente; otros roles lo conservan.
- **`/amigos`**: sección "Tus amigos van a" — `GET /api/friends/upcoming-events` (amigos ACCEPTED con ticket ACTIVE en eventos futuros, avatar stack, top 4 + "+n").
- **`/amigos/[id]`**: "Próximos eventos" solo si amistad ACCEPTED — `GET /people/:id` incluye `upcomingEvents` condicional. Bloqueados → 404 (previo).
- **`/bailes`**: solo sesiones QR + ratings. **`/practicas`**: absorbe `AvailabilitySection` + `PartnerRequests` + listado + crear.
- **`PartnerAvatar`** ganó `size="sm"`; **`MyQr`** ganó `compact`.

## Verificación

- API: **905/905** (incl. `leads.e2e` — el flake paralelo no apareció en esta corrida)
- Web `tsc`: limpio · `ALL_KEYS_OK` · contrast-check sin fallos
- Probes en vivo: switcher con "Mis eventos" (sin Guardados/Cerca de ti), mios con empty state, anon sin vistas extra, `/api/me/rsvp` → 404, `/friends/upcoming-events` → [] sin amigos
- Gap conocido: el sheet es client-rendered tras `/me` — no verificable vía curl; solo tsc + patrón SideDrawer replicado.

## Notas operativas

- **No hay `prisma/migrations/`** — el proyecto trabaja con `db push` aunque AGENTS.md mencione `db:migrate`. El drop de Rsvp quedó aplicado por push.
- JWT_SECRET en `apps/api/.env` viene entre comillas — al firmar sesiones a mano, sanea las comillas.
- `Ticket.eventId` es **escalar sin relación** — joins manuales en controllers (ver `friends.controller.ts`, `people.controller.ts`).

## Pendiente — siguiente slice

**`dancer-profile-survey-analytics`** (OpenSpec completo, diseño aprobado por el usuario, sin implementar):
- `Person.gender` (M/F/OTHER) + UI de estilos con rol LEADER/FOLLOWER/SWITCH en `/perfil` (`PATCH /me/profile`, `GET /styles`)
- `EventRating.overall` + encuesta post-social (card /inicio + notifySafe; elegibilidad = check-in real; 24h; dims bipolares música/gente/temperatura)
- `GET /api/events/:id/analytics` (asistentes, M/F, L/F por género del evento, ratings k≥3) + UI en `/productor/eventos/[id]` + analítica como módulo propio en nav (producer + admin)
