# Design — producer-exports

## Endpoint

```
GET /events/:id/export.csv?dataset=sales|checkins|guestlist
Authorization: sesión (cookie)
→ 200 text/csv; charset=utf-8
  Content-Disposition: attachment; filename="<eventId>-<dataset>.csv"
```

Declarado en `EventsController` junto a `live` — reutiliza
`findEventOr404` + `requireOwnerOrAdmin` (owner `event.producerId` o
`admin.access`). `SessionGuard` solo; no requiere `events.manage` porque
el permiso real es la propiedad del evento (un admin sin ese permiso debe
poder auditar igual que en `/live`).

La ruta literal `export.csv` va dentro de `:id/export.csv` — `:id` es
cuid (sin puntos), no hay ambigüedad con `GET /events/:id`.

## Datasets

| dataset | origen | columnas |
|---|---|---|
| `sales` | `ticket.findMany({eventId})` + join `payment` por `paymentId` para `channel` | `fecha,comprador,asistente,precio_lista,cargo_servicio,total,estado,canal,payment_id` |
| `checkins` | `checkin.findMany({eventId})` | `entrada,salida,metodo,persona,anulado,nota` |
| `guestlist` | `guestList.findMany({eventId, include:{entries}})` | `lista,dueno_lista,invitado,estado,creado` |

Nombres: join manual a `person` (FKs escalares — mismo patrón que
`guest-lists.controller` y `listStaff`). Persona borrada → `?`.

`sales` incluye tickets de cualquier estado (ACTIVE/USED/CANCELLED/
TRANSFERRED) — el productor cuadra contra el estado, no solo ventas
vivas. `total` = `listPrice + serviceFee`. Ticket sin `paymentId`
(histórico/manual) → `canal` y `payment_id` vacíos. **`claimToken` jamás
se exporta** (secreto de reclamo — regla de seguridad del repo).

`checkins` incluye anulados (`voidedAt`) con columna `anulado=si` — la
cuadratura de puerta necesita verlos. `outAt` vacío si sigue dentro.

## CSV

- BOM `\uFEFF` al inicio — Excel es-CL abre UTF-8 correctamente solo con BOM.
- Separador `,`, líneas `\r\n`.
- Escaping: si el campo contiene `,"` `\n` o `\r` → envuelto en `"` y `"` internas
  duplicadas (`""`). Helper `csvCell(v: unknown)`.
- Fechas en ISO-8601 (`toISOString`) — parseable y sin ambigüedad de zona.
- Números sin formato (pesos enteros CLP, como los guarda el modelo).

## Respuesta

`@Res({ passthrough: true })` para setear `Content-Type` +
`Content-Disposition` dinámicos y devolver el string — mismo patrón de
`crm.controller`/`guest-lists.controller`.

## UI

`/productor/eventos/[id]`: sección `ExportSection` (componente chico en
`components/producer/`) con tres `<a href="/api/events/:id/export.csv?dataset=…" download>`
— el proxy `/api` de next.config preserva cookies. Solo se renderiza con
`canManage` (owner/admin ya gateado en página). Sin fetch previo: el link
descarga directo; un 403 del API aparece como descarga fallida —
aceptable v1 (mismo patrón que cualquier link de descarga autenticado).

## Riesgos

- Volumen: evento grande ~5k tickets → ~500KB CSV, fine para un GET
  síncrono; sin paginación en v1.
- Datos personales en el CSV: el export es para el **productor del
  evento**, que ya ve estos datos en pantalla (guest-lists, passes,
  payments) — no amplía la frontera de privacidad.
