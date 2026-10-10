# Delta: events/producer-console

## MODIFIED Requirements

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

## ADDED Requirements

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
