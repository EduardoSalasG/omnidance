# dancer-nav-reorg — Reorganización de la experiencia del bailarín

## Why

La navegación del bailarín está sobredimensionada (bottom bar + drawer lateral para ~8 destinos) y varios módulos mezclan responsabilidades: `/bailes` mezcla historial de sesiones con disponibilidad y búsqueda de pareja (que son de prácticas), `/entradas` es solo una agenda (la entrada real es el QR), RSVP `GOING`/`INTERESTED` no aporta señal (asistencia real = `Checkin`/`Ticket`), y `/amigos` no muestra el perfil ni los eventos de los amigos. El objetivo es simplificar la IA del dancer y hacer que cada módulo responda una sola pregunta.

## What Changes

- **Nav dancer**: bottom bar `[Inicio] [Eventos] [⊕] [Amigos] [Perfil]`; el botón `+` central abre un sheet con **Mi QR destacado** + accesos secundarios (Bailes, Prácticas, Viajes, Notificaciones). El drawer lateral se elimina para DANCER (permanece para roles con consola). **BREAKING** para la navegación del rol.
- **`/entradas` se elimina del nav**; su función de agenda pasa a **Mis eventos** en `/eventos?view=mios` (eventos futuros con `Ticket` ACTIVE propio). La entrada real en puerta es el QR personal.
- **RSVP se elimina completo**: modelo `Rsvp` (GOING/INTERESTED), endpoints `PUT/DELETE /api/events/:id/rsvp` y `GET /api/me/rsvp`, `SaveEventButton`, vista `saved`. **BREAKING** (drop de tabla + endpoints).
- **"Cerca de ti" se elimina**: `NearMeButton`, param `?near=`, sort haversine en `/eventos` (`venue.lat/lng` queda en el modelo sin superficie).
- **Amigos**: `/amigos/[id]` gana "Próximos eventos" (solo si son amigos confirmados, basado en tickets activos — no RSVP); `/amigos` gana la sección "Tus amigos van a" (eventos con ≥1 amigo con ticket, + stack de avatares) vía `GET /api/friends/upcoming-events`.
- **Bailes** queda solo con el historial de sesiones QR escaneadas (pareja, estilo, rating).
- **Prácticas** absorbe `AvailabilitySection` ("Disponibles ahora") y `PartnerRequests` ("Busco pareja") junto al listado y creación de prácticas.

## Capabilities

### New Capabilities
- `dancer-navigation`: bottom bar del bailarín con sheet central (`+` → QR destacado + módulos secundarios) y eliminación del drawer para DANCER.
- `event-attendance`: "Mis eventos" (`?view=mios`) como agenda de tickets activos; eliminación de RSVP/guardados y de "cerca de ti".
- `friends-discovery`: perfil de amigo con próximos eventos (gated por amistad) y sección "Tus amigos van a" en el listado.
- `social-modules-scope`: separación de dominios — `/bailes` = historial de sesiones; `/practicas` = prácticas + disponibilidad + búsqueda de pareja.

### Modified Capabilities
- (sin specs previos archivados — todo queda como capacidad nueva)

## Impact

- **API**: drop tabla `Rsvp` (migración); remove `rsvp.controller.ts` + `GET /me/rsvp`; nuevo `GET /api/friends/upcoming-events`; `GET /api/people/:id` gana `upcomingEvents` condicionado a amistad.
- **Web**: `BottomNav`/`SideDrawer` (sheet nuevo para dancer), `/eventos` (vista `mios`, sin saved/near), `/amigos` + `/amigos/[id]`, `/bailes`, `/practicas`, `/entradas` (ruta eliminada), `SaveEventButton`/`NearMeButton` eliminados, i18n.
- **Datos**: migración drop `Rsvp` — era solo "guardados", sin pérdida de negocio.
- **Docs**: `architecture.md` (nav, eventos, amigos), openapi/postman regenerados.
