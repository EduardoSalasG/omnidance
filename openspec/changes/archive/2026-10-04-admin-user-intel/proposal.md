# admin-user-intel — explorador de datos + ficha de usuario + analítica por usuario

El admin necesita conocer a las personas y la data operacional sin salir de su
consola: buscador real (no lista masiva), ficha 360° por persona con data por
rol, y un sub-módulo "Analítica por usuario" con insights de negocio por lente.

Además: en `/perfil` el rol ADMIN no ve racha ni insignias (no aplican).

## API — nuevos endpoints (todos `admin.access`)

### `GET /admin/users?q=`
- `q` < 2 chars o ausente → `[]` (nunca lista masiva). Busca por name/email/phone.
- Respuesta: `[{ id, name, email, createdAt, roles: [{role,status}] }]`.

### `GET /admin/users/:personId/detail`
```ts
{
  person: { id, name, email, phone, photoUrl, isLightAccount, verifiedAt, createdAt },
  roles: [{ id, role, status, createdAt }],           // línea de tiempo de gestión
  roleData: {
    DANCER?: {
      ticketsUpcoming: [{ id, status, listPrice, event: { id, name, startsAt } }],
      ticketsPast:     [{ id, status, listPrice, event: { id, name, startsAt } }],
      dancesCount: number, checkinsCount: number
    },
    PRODUCER?: { eventsUpcoming: [{id,name,startsAt,status}], eventsPast: [...] },
    STAFF?: { assignments: [{ id, role, event: {id,name,startsAt, producer:{id,name}} }] },
    INSTRUCTOR?: {
      academies: [{ id, name }],
      classesUpcoming: [{ id, startsAt, style, academy: {id,name} }],
      classesPastCount: number
    },
    ACADEMY_OWNER?: { academies: [{ id, name, studentsCount }] },
    DJ?: { gigsUpcoming: [{id, event:{id,name,startsAt}}], gigsPast: [...] },
    VENUE_MANAGER?: { venues: [{id,name}], rentals: [{id, date, status, venue:{id,name}}] },
    SUPPORT?: {}, ADMIN?: {}
  }
}
```
Solo se incluyen las keys de roles que la persona tiene (cualquier status ≠ REJECTED).

### `GET /admin/users/:personId/analytics?role=X`
```ts
{ role, sections: { ...por rol } }
```
- `DANCER` → `social`: `totalSpentClp, monthSpentClp, monthlyAvgClp, lastEvent {id,name,startsAt}, favoriteEvents [{eventId,name,attendances}], avgCheckinHour, dancesCount, seasonPoints, rank, badges [{key,name}]`;
  `academy`: `activeEnrollments [{academy{id,name}, plan{name,price,type}, status}], classesTaken, classesUpcoming, currentMonthlyClp, totalPaidClp, byAcademy [{name,count}], byStyle [{name,count}], byGenre [{genre,count}]`.
- `PRODUCER` → `eventsTotal, eventsUpcoming, grossAllClp, grossMonthClp, ticketsSold, avgOccupancyPct, topEvents [{id,name,grossClp}]`.
- `STAFF` → `producers [{id,name,shifts}], eventsWorked, upcomingShifts`.
- `INSTRUCTOR` → `academies [{id,name}], classesTaught, classesUpcoming, avgFillPct`.
- `DJ` → `gigsTotal, gigsUpcoming, events [{id,name,startsAt}]`.
- `VENUE_MANAGER` → `venues [{id,name}], rentalsByStatus {REQUESTED,CONFIRMED,CANCELLED}`.
- `ACADEMY_OWNER` → `academies [{id,name,students,attendance30d,classes30d}]`.
- `SUPPORT`/`ADMIN` → `meta`: `accountAgeDays, roleHistory [{role,status,createdAt}]`.
- role sin APPROVED para esa persona → 400 `ROLE_NOT_HELD`.

### `GET /admin/browse/:entity`
`entity ∈ events|classes|payments|tickets|academies|venues|rentals|people`.
Filtros por query string; respuesta siempre array ≤100 filas livianas:
- `events`: `q,status,from,to,producerId,venueId` → `{id,name,startsAt,status,producer{name},venue{name},sold}`
- `classes`: `academyId,styleId,from,to` → `{id,startsAt,style{name},academy{name},instructor{name},booked,capacity}`
- `payments`: `status,orderType,from,to` → `{id,amount,net,status,orderType,createdAt,person{name},event{name}?}`
- `tickets`: `status,eventId` → `{id,status,listPrice,event{name,startsAt},owner{name}}`
- `academies`: `q` → `{id,name,students,seriesActive}`
- `venues`: `q` → `{id,name,address,rentalsCount}`
- `rentals`: `status,venueId` → `{id,date,status,venue{name},event{name}?}`
- `people`: `q,role` → misma shape que /admin/users.

## Web

- `components/ui/pill-tabs.tsx` — strip de pills deslizable (overflow-x-auto,
  snap, scrollbar oculto), controlled: `items[{key,label}], active, onSelect`.
  Reusable por CRM-style navs y filtros.
- `/perfil` — racha + insignias ocultas cuando `activeRole === "ADMIN"`.
- `/admin/usuarios` — sin carga inicial; estado vacío con hint; buscador ≥2
  chars; resultados = cards (nombre, email, badges de roles) → link a detalle.
- `/admin/usuarios/[personId]` — datos personales, línea de tiempo de roles,
  controles de gestión (setRole/revoke existentes), secciones por rol activo,
  CTA "Ver analítica" → `/analitica/usuarios/[personId]`.
- `/analitica/usuarios` — buscador idéntico (cards nombre+email+roles).
- `/analitica/usuarios/[personId]` — PillTabs de roles aprobados (primero
  activo por defecto); contenido por rol; DANCER con sub-secciones
  Social + Academia.
- `/admin/datos` — PillTabs de entidades + filtros + lista de resultados.
- Hub `/admin` + drawer: entrada "Datos" (`/admin/datos`); drawer analítica:
  "Por usuario" (`/analitica/usuarios`).

## Tests
- e2e: detail 404/401/403, analytics por rol + ROLE_NOT_HELD, browse entities
  con filtros, users?q mínimo.
