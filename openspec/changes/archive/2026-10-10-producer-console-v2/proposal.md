# Proposal — producer-console-v2

## Why

La consola del productor tenía una página de "Comisión y defaults"
monolítica (comisión + mesas + preventa + Producer Pro + pasarela +
medios propios + tema), las listas de invitados eran un módulo de
sidebar desconectado del evento que las usa, la cola de comprobantes
podía renderizar vacía sin estado, y el productor no se enteraba de
ventas nuevas. Además el seed no daba volumen realista para probar la
consola (eventos sin aforo ni reservas).

## What Changes

- **Configuración se divide en páginas dedicadas** (mismo patrón que
  `/academia/configuracion/*`): `parametros` queda como "Valores por
  defecto" (mesas reservables + aforo sentable + corte de preventa);
  `/productor/medios-pago` nuevo (pasarela propia + medios de cobro
  directos); `/productor/suscripcion` nuevo (Producer Pro + comisión
  todo incluido read-only; el retorno Flow `?pro=ok` aterriza acá);
  `/productor/apariencia` nuevo (tema). El grupo "Configuración" del
  drawer/sidebar lista las cinco entradas.
- **Listas de invitados dentro de la ficha del evento**: nueva sección
  `EventListsSection` en `/productor/eventos/[id]`; el ítem de sidebar
  se elimina, `/productor/listas` redirige a `/productor/eventos`, y
  `nueva?eventId=`/`[id]` mantienen contexto del evento (back a la
  ficha, evento preseleccionado).
- **Reservas de mesa operativas en la ficha**: además de
  aprobar/cancelar pendientes, las CONFIRMED se pueden modificar
  (mesa asignada y tamaño) con "Guardar cambios".
- **Comprobantes como cola masiva**: la página muestra la cola PENDING
  completa primero (accionable, navega a ficha), luego historial
  resuelto y filtros; con 0 pendientes hay empty state explícito.
- **Dashboard**: los tops por facturación y por asistencia comparten
  fila en desktop (facturación izquierda, asistencia derecha), con la
  cola de cobros por revisar como sección propia.
- **Notificación de venta al productor**: al liquidar una orden de
  tickets (PAID) el productor recibe `ticket.sale` ("Nueva venta ·
  comprador · cantidad · evento · monto", deep-link a la ficha del
  evento); no se avisa cuando el comprador es el propio productor.
- **Seed enriquecido**: todos los eventos PUBLISHED/LIVE/CLOSED
  reciben 150-350 entradas determinísticas por hash (vie/sáb 250-350),
  pagos PAID y ~85% de check-ins en eventos pasados; MuéveteOnTour
  gana edición pasada CLOSED, lista de invitados, cola de claims
  PENDING y eventos con mesas reservables (REQUESTED/CONFIRMED).
- Botón "Nuevo código" y "Nuevo evento" como `primary` (acento de la
  lente).

## Out of scope

- Analítica: la paginación del query engine vive en el change
  `analytics-query-engine` (mismo workspace).
- Nuevos endpoints de agregación más allá de `/producer/dashboard`.
