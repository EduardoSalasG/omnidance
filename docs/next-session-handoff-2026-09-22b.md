# Handoff - 2026-09-22 PM - reconstruido post-facto desde git log

> **Nota**: este handoff se escribió el 2026-09-23 reconstruyendo la
> sesión de tarde del 22 desde commits (9341427…25c86df) - la sesión
> original no dejó documento. Verificación y gaps detallados pueden
> estar incompletos; validar contra el código antes de confiar.

## Qué se hizo (por tema)

### Prácticas (`/practicas`)

- Creación en página propia, form simplificado y "más humano":
  placeholders de dirección (calle/comuna + nombre del sitio), notas de
  dirección separadas de la descripción, campos apilados en móvil (iOS
  no encoge date/time), safe-area en header público, al menos un
  público obligatorio (chip bloqueado + guard de dominio), retiro del
  botón Cancelar (vuelve back del appbar) y del selector de asistencia.
- Lugar libre (sin Venue del catálogo), modo "solo mujeres", RSVP
  "voy", vista Mis prácticas, chips de estilo y días, ficha limpia
  dentro de /eventos.
- Cartelera pública `/eventos` excluye prácticas; retiro total de
  womenOnly/menOnly de eventos + h1 por vista.

### Bailes (`/bailes`)

- Acordeón por evento, orden pending-first, badges de estado, insights
  por evento más ricos, bloqueo de venta en eventos terminados, card
  "Tu último social" refinado.

### Locales (`/locales`)

- Perfil del local: vista lista/calendario, filtro por estilo, cards
  agrupadas por día, dirección abre mapas con "cómo llegar", back al
  mapa.

### Mesas en checkout (OpenSpec `checkout-table-reservation` - 19/19)

- Reserva de mesa opcional en el checkout con disponibilidad dinámica;
  `Event.tablesTotal`/`tableSeatMax`/`tableSeatsTotal` + defaults
  editables del productor (`/productor/parametros`, GET/PUT
  `/producer/table-params`, herencia/override/disable); validaciones
  `tablePartySize ≤ seatMax` (400) y `≤ seatsLeft` (409); webhook crea
  TableReservation REQUESTED al PAID + notificación al productor;
  notificación al solicitante al confirmar/cancelar; PATCH manage con
  partySize; seed con mesas en noches grandes de finde.
- Fix adyacente: el dropdown de amigos del checkout se cierra al
  asignar una entrada.

### Emails + onboarding

- Plantillas de marca morada: bienvenida, magic link e invitación.
- Tours actualizados a la app actual + tour de lente Academia + step
  del toggle Social/Academia; tours nuevos en amigos, bailes,
  prácticas, perfil, campana y mis entradas.

### Home academia del bailarín

- `/inicio` en lente academia: clases del mes, próxima clase rotulada y
  próximas reservas.

### Clases (`/clases` + academia)

- ClassType "En Pareja" según vocabulario del spec → luego rename
  in-place a "Pareja" en seed; modalidad por horario, precio de clase
  suelta, styleId sin duplicar; ClassSlot siempre dentro de una serie
  (slots legacy eliminados); confirmación inline al cancelar; seed de
  academias reales de la escena.
- Explorar: parrilla agrupada por día y hora, vistas
  lista/calendario/historial + Mis clases (símil de /eventos), ficha
  `/clases/:id` con instructor y reserva.
- Iteración visual del card: hora como separador → título estilo+nivel
  sin separador ni color de género → nivel atenuado → card en 4 líneas
  → tipo y nivel como chips outline/muted.
- Fix: `role-console-depth` e2e bootea con ParamsModule.

## Estado al cerrar el día

- Todo commiteado en `dev` (working tree limpio al 23 AM).
- Verificación de esa sesión: no documentada - la suite al 23 AM está
  verde (969 tests) con todos estos cambios incluidos.

## Gaps heredados visibles

- Ninguno declarado por la sesión (no hubo handoff). Revisión posterior
  no encontró TODOs en /clases.
