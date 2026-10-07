## Why

Las consolas de gestión (ACADEMY_OWNER, INSTRUCTOR, PRODUCER, STAFF) muestran
formularios de creación/edición siempre visibles dentro de las páginas de
listado, mientras que las superficies del bailarín ya adoptaron el patrón
"acción detrás de un CTA" (botón Crear → página dedicada, ej. `/practicas/nueva`).
La inconsistencia rompe el modelo mental de la app, deja formularios ocupando
pantalla en contextos de lectura y dificulta deep-linking y estados vacíos.

## What Changes

- Toda creación o edición de entidad gestionada desde una consola SHALL
  iniciarse desde un botón "＋ Crear/Editar" que navega a una página dedicada
  (`…/nueva`, `…/nuevo`, con `?edit=<id>` para edición), reemplazando los
  formularios siempre visibles o toggles inline.
- Migraciones de rutas:
  - `/academia/planes` → crear/editar plan en `/academia/planes/nueva` (`?edit=<planId>`).
  - `/academia/videos` → `/academia/videos/nuevo`.
  - `/academia/alumnos` → alta de enrollment en `/academia/alumnos/nuevo`.
  - `/academia/equipo` → alta de colaborador en `/academia/equipo/nuevo`.
  - `/academia/series` → crear/editar serie en `/academia/series/nueva` (`?edit=<seriesId>`).
  - `/productor/eventos` → crear en `/productor/eventos/nuevo`; editar en
    `/productor/eventos/nuevo?edit=<eventId>` (reemplaza `?crear=1` y el form
    inline del detalle).
  - `/productor/codigos` → `/productor/codigos/nuevo`.
  - `/productor/listas` → crear lista en `/productor/listas/nueva` (agregar
    personas a una lista existente queda como acción por fila).
  - `/productor/eventos/[id]` staff → alta de staff en
    `/productor/eventos/[id]/staff/nuevo`.
- Estados vacíos de listado SHALL ofrecer el CTA de creación como acción
  principal (patrón del bailarín).
- Tras crear/editar con éxito: feedback breve y redirect a la lista o al
  detalle con aviso `role="status"`/`aria-live`.
- Excepciones que permanecen inline (acción primaria de la pantalla o
  settings, no creación de entidad): registro rápido de asistencia
  (`/academia/asistencia`), alta manual en consola de puerta
  (`/staff/[eventId]`), settings (quórum, perfil de academia, parámetros del
  productor, métodos de pago ya toggled), acciones por fila
  (reagendar/asignar particulares, aprobar/rechazar cobros, agregar persona a
  lista, toggles de capacidades), y el form de creación de academia del gate
  (solo aparece cuando no hay academia).

## Capabilities

### New Capabilities
- `console-crud-flows`: flujos de creación/edición de entidades en las
  consolas B2B — CTA "Crear" → página dedicada, estados vacíos con CTA,
  feedback post-submit, excepciones inline documentadas.

### Modified Capabilities
- (ninguna: el cambio es de superficie/flujo, no de contratos ni reglas de
  negocio cubiertas por specs existentes)

## Impact

- Solo `apps/web`: nuevas rutas `*/nueva|nuevo`, refactor de las secciones
  `components/academy/*` y `components/producer/*` que hoy incrustan el form
  en el listado, y de las páginas afectadas.
- Sin cambios de API, contratos, schema ni migraciones.
- i18n: keys nuevas de títulos/CTAs en `messages/es-CL.json` +
  `src/i18n/parts/*.json`.
- Deep-link `?crear=1` del tab central del productor se redirige a la nueva
  ruta (el tab sigue funcionando como CTA de creación).
