# events/producer-console Specification

## Purpose
TBD - created by archiving change console-parity-v5. Update Purpose after archive.

## Requirements

### Requirement: Consola del productor con el patrón compartido

Los módulos del productor (eventos, listas de invitados, códigos de
descuento, cobros) DEBEN (SHALL) usar el mismo patrón de consola definido para
el dueño de academia: crear = botón → página dedicada, card completo
clickeable → detalle, edición y acciones destructivas en la ficha,
listas con FilterBar + Pager, skeletons y errores con retry.

#### Scenario: crear evento

- WHEN el productor presiona el CTA "Nuevo evento" en su listado
- THEN navega a una página dedicada de creación

#### Scenario: detalle de evento

- WHEN el productor activa el card de un evento en el listado
- THEN navega al detalle con datos, edición y acciones del evento

#### Scenario: listado paginado y filtrable

- WHEN el productor ve un módulo con listado
- THEN la lista usa FilterBar con el vocabulario del query engine y
  Pager compartido, con skeleton en carga y retry en error

#### Scenario: ficha de un elemento del listado

- WHEN el productor activa el card de un código, lista de invitados,
  liquidación o comprobante
- THEN navega a una página de detalle con sus datos y las acciones
  relevantes (agregar invitado/emitir pase, aprobar/rechazar
  comprobante); las mutaciones no ocurren inline en el listado

#### Scenario: acción destructiva del evento

- WHEN el productor puede cancelar un evento
- THEN el botón de cancelar vive en una zona separada al pie de la
  ficha, con estilo destructivo y confirmación

### Requirement: Endpoints de ficha del productor

La API SHALL exponer los endpoints de detalle que las fichas consumen:
`GET /discount-codes/:id`, `GET /guest-lists/:id`,
`GET /producer/claims/:claimId`, `GET /me/payouts/:id` y `GET /me/payouts`
paginado con el envelope compartido `{items,total,page,pageSize}`.

#### Scenario: detalle de comprobante

- WHEN el productor pide el detalle de un comprobante de su cola
- THEN recibe datos del claim y de la orden origen (refId, canal,
  estado); un claim ajeno responde 404

### Requirement: Home del productor como dashboard

El home (`/inicio`) de la lente PRODUCER SHALL ser un dashboard
operativo al estilo del dueño de academia - no un hero con CTA. La API
SHALL exponer `GET /producer/dashboard` (SessionGuard; productor
APPROVED o permiso `admin.access`) que agrega en un solo request:

- `kpis`: `upcoming` (eventos PUBLISHED/LIVE con `endsAt` a futuro),
  `sold` (tickets ACTIVE|USED de esos eventos), `grossMonth` (bruto
  PAID TICKET del mes calendario) y `pendingClaims` (comprobantes
  PENDING).
- `topRevenue` y `topAttendance`: top 5 eventos del productor por
  bruto PAID y por check-ins no anulados, con id/nombre/fecha.
- `pendingClaims`: `{count, amount, items≤5}` de la cola de
  comprobantes manuales (persona, método, monto, fecha).

El front SHALL renderizar KPI cards + las tres listas con el mismo
lenguaje visual del dashboard de academia (filas clickeables que
navegan a la ficha o a la cola), estados skeleton/error/empty y sin
hero ni sección "Próximos eventos".

#### Scenario: productor con actividad

- WHEN un productor con eventos, ventas y comprobantes pendientes abre
  /inicio en su lente
- THEN ve los 4 KPIs, los top 5 por facturación y por asistencia, y la
  cola de cobros por revisar con monto acumulado

#### Scenario: productor sin eventos

- WHEN un productor aprobado sin eventos abre /inicio
- THEN el dashboard muestra KPIs en cero y un CTA a crear su primer
  evento; las listas vacías no se renderizan

#### Scenario: navegación desde una fila

- WHEN el productor toca un evento de un top o un comprobante de la
  cola
- THEN navega a `/productor/eventos/:id` o `/productor/comprobantes`

### Requirement: Navegación del productor simplificada

El chrome del productor SHALL listar en su sidebar (desktop) y drawer
(móvil) solo: Inicio, Eventos (su módulo), Códigos, Comprobantes, CRM y
Analítica; seguidos de un grupo "Configuración" inmediatamente encima de
la sección Cuenta con una página por sección: "Valores por defecto"
(`/productor/parametros`), "Medios de pago" (`/productor/medios-pago`),
"Suscripción" (`/productor/suscripcion`), "Mis pagos"
(`/productor/pagos`) y "Apariencia" (`/productor/apariencia`). Las
listas de invitados NO son un módulo de navegación - viven dentro de la
ficha del evento. El tab "Crear evento" y el hub `/productor` se
eliminan de la navegación; la ruta `/productor` SHALL redirigir a
`/inicio`. Los `backHref` de los módulos del productor apuntan a
`/inicio`.

#### Scenario: sidebar del productor

- WHEN un productor abre la sidebar o el drawer
- THEN no ve "Crear evento" ni el hub "Productor" ni "Listas de
  invitados"; el grupo "Configuración" lista las cinco páginas sobre la
  sección Cuenta; el enlace a la cartelera pública no aparece

#### Scenario: retorno de registro Pro

- WHEN Flow redirige tras el registro de tarjeta para Producer Pro
- THEN el API devuelve 303 a `/productor/suscripcion?pro=ok` y esa
  página muestra el aviso de retorno

#### Scenario: split de Configuración

- WHEN el productor abre "Valores por defecto"
- THEN edita mesas reservables, aforo sentable y corte de preventa; la
  comisión, la suscripción Pro, la pasarela, los medios de cobro y el
  tema viven cada uno en su propia página de Configuración

### Requirement: Listas de invitados dentro de la ficha del evento

Las listas de invitados de un evento SHALL gestionarse como sección de
`/productor/eventos/[id]` (carga directa del evento, filtros, pager y
CTA "Nueva lista"). Las rutas `/productor/listas/nueva?eventId=` y
`/productor/listas/[id]` SHALL conservar el contexto: preseleccionan el
evento y su back vuelve a la ficha. `/productor/listas` SHALL redirigir
al listado de eventos.

#### Scenario: crear lista desde el evento

- WHEN el productor presiona "Nueva lista" en la sección de la ficha
- THEN llega a `listas/nueva?eventId=<id>` con el evento
  preseleccionado y al crearla vuelve a la ficha del evento

#### Scenario: deep-link viejo

- WHEN alguien abre `/productor/listas` o `listas/[id]` directo
- THEN el listado redirige a `/productor/eventos` y la ficha de lista
  sigue funcionando con back al evento dueño

### Requirement: Reservas de mesa operativas en la ficha

La sección de reservas de `/productor/eventos/[id]` SHALL permitir al
productor aprobar o cancelar solicitudes REQUESTED y modificar mesa
asignada y tamaño de grupo en reservas CONFIRMED ("Guardar cambios"),
con ocupación referencial (activas vs. `tablesTotal`/`tableSeatsTotal`)
y errores por fila.

#### Scenario: aprobar pendiente

- WHEN el productor confirma una reserva REQUESTED con mesa y tamaño
- THEN `PATCH /table-reservations/:id` la deja CONFIRMED y la sección
  recarga

#### Scenario: modificar confirmada

- WHEN el productor cambia mesa o tamaño de una reserva CONFIRMED y
  guarda
- THEN persiste los cambios sin perder el estado CONFIRMED

### Requirement: Cola de comprobantes masiva

`/productor/comprobantes` SHALL renderizar la cola PENDING completa
primero (vista masiva accionable: cada card navega a la ficha del claim
donde viven aprobar/rechazar), luego un historial resuelto acotado y el
FilterBar; con cero pendientes y sin filtros SHALL mostrar un empty
state explícito - nunca una página en blanco.

#### Scenario: cola con pendientes

- WHEN el productor abre comprobantes con N claims PENDING
- THEN ve los N pendientes primero y debajo el historial resuelto

#### Scenario: cola vacía

- WHEN no hay claims ni filtros activos
- THEN la página muestra un mensaje de cola vacía con su descripción

### Requirement: Aviso de venta al productor

Al liquidar una orden de tickets (PAID) el sistema SHALL notificar al
productor del evento con `type:"ticket.sale"`, title corto de outcome
("Nueva venta"), body `${comprador} · ${cantidad} entrada(s) ·
${evento} · ${monto}` y `data.path` a la ficha del evento; MUST NOT
avisar cuando el comprador es el propio productor.

#### Scenario: compra de tercero

- WHEN un bailarín compra entradas de un evento del productor
- THEN el productor recibe la notificación "Nueva venta" con el nombre
  del comprador, la cantidad, el evento y el monto

#### Scenario: compra propia

- WHEN el productor compra entradas de su propio evento
- THEN solo recibe su confirmación de compra - no el aviso de venta

### Requirement: Tour guiado de primera visita del productor

En `/inicio` con lente PRODUCER la app SHALL correr un tour de primera
visita (`onboarding["productor"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre las secciones del dashboard
(KPIs del mes, cobros por revisar, tops de eventos), el destino
Eventos y un paso de navegación acorde al chrome visible: la
hamburguesa/drawer en `<lg` y la sidebar en `≥lg`. Los pasos cuyo
target no exista (cola de cobros vacía, tops vacíos, destino no
visible en el viewport) SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el dashboard del productor

- **GIVEN** un productor que nunca vio el tour
- **WHEN** abre `/inicio` con lente PRODUCER
- **THEN** el tour recorre los KPIs, las secciones visibles del
  dashboard, el destino Eventos y la navegación del chrome, y al
  cerrarse marca `onboarding["productor"]`

#### Scenario: secciones vacías no bloquean

- **GIVEN** un productor sin comprobantes pendientes ni tops
- **WHEN** corre el tour
- **THEN** los pasos de cobros por revisar y tops se omiten y el tour
  completa el resto
