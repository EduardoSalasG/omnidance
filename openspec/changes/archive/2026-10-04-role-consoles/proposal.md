# role-consoles — consolas Venue, DJ y Support

Cierra el mapa de roles: VENUE_MANAGER, DJ y SUPPORT existen en el
catálogo pero no tienen superficie propia (solo tabs/drawer mínimos).

## Alcance

1. **API venue** — `GET /venues/mine`, `GET /venues/:id/dashboard`
   (próximos eventos, check-ins 30d, rentals, menus), `PATCH
   /venues/:id/rentals/:id` (CONFIRMED/CANCELLED). Guard: ownerId o ADMIN.
2. **API DJ** — `GET /dj/gigs` (eventos donde figura en EventDj, próximos
   y pasados con slotNote), `GET /dj/gigs/:eventId/suggestions`
   (agregado de SongSuggestion, solo DJ asignado o ADMIN).
3. **API support** — `GET /support/users?q=` (buscar por nombre/email),
   `GET /support/users/:id` (roles, tickets, pagos, check-ins; read-only).
   Rol SUPPORT aprobado o ADMIN.
4. **Web** — `/venue`, `/dj`, `/soporte` como consolas Operate-mode con
   el sistema visual incumbente; AppRole += SUPPORT; tabs + drawer por rol.
5. **i18n** — parts venue.json / dj.json / support.json + registro.

## Fuera de scope

- Edición de datos de venue (dirección, capacidad) — solo lectura +
  gestión de rentals.
- Impersonation de usuarios desde support (riesgo de seguridad).
- Menús de venue (upload de PDF) — se listan, no se suben.
