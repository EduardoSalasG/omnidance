# tasks — role-console-depth

- [x] API: GET /dj/gigs/:eventId/rating (agregado music, k-anonymity, DJ asignado)
- [x] API: /venues/:id/dashboard += tables (reservas de mesa) + flow (peak hour, permanencia)
- [x] API: /academies/:id/dashboard += todayClasses + attendanceToday
- [x] API: /events/mine += stats {sold, grossClp, checkins} por evento
- [x] API: GET /events/:id/live (ventas por canal, check-ins, ocupación — owner/admin)
- [x] Tests: e2e por endpoint nuevo/extendido
- [x] Web: /productor/eventos stats por card (vendidas · bruto · check-ins)
- [x] Web: /productor/eventos/[id] sección En vivo/Operación (ventas por canal + check-ins + histograma)
- [x] Web: /dj badge de música en gigs pasados
- [x] Web: /venue secciones Reservas de mesa + Flujo
- [x] Web: /academia dashboard "Clases de hoy" + card CRM (owner/ADMIN)
- [x] Nav: /crm en drawer ACADEMY_OWNER
- [x] Seed: EventRatings en ediciones pasadas + outAt en check-ins + mesa CONFIRMED + check-ins LIVE + EventDjs pasados
- [x] i18n: keys nuevas en parts
- [x] Fix wiring: VenueConsoleController antes de VenuesController en SocialModule (/venues/mine quedaba tapada por :id → 404) + spec venue-routes-wiring con el módulo real
- [x] Verificación: tsc api+web, tests, seed, detect, docs, commit+push
