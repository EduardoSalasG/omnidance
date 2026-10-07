## Context

Las consolas B2B (`/academia/*`, `/productor/*`, `/staff/*`) incrustan
formularios de creación/edición dentro de las páginas de listado: algunos
siempre visibles (`plans-section`, `videos`, `students-section`,
`staff-section` de academia, `codigos`) y otros tras toggle inline
(`productor/eventos`, `productor/listas`, `academia/series`,
`payment-methods-*`). El bailarín ya usa el patrón "CTA → página dedicada"
(`/practicas/nueva`). Ver proposal.md para el inventario normativo.

## Goals / Non-Goals

- Goals: una única forma de crear/editar entidades gestionadas; listados
  limpios; deep-linkable; empty states con CTA; reutilizar los formularios
  existentes moviéndolos de lugar, no reescribirlos.
- Non-goals: cambios de API/contratos; rediseño visual; responsive desktop
  (eso es `responsive-app-shell`); tocar los formularios-excepción listados
  en el spec.

## Decisions

- **Ruta dedicada por entidad** (`/nueva`/`/nuevo`), no sheet ni modal:
  decisión del usuario — los formularios de consola son largos (plan tiene 8
  campos, evento ~15) y la página completa permite validación, scroll y
  deep-link. El patrón dancer ya lo usa (`/practicas/nueva`).
- **Crear y editar comparten página** con `?edit=<id>`: un solo formulario
  por entidad; la página en modo edición fetchea la entidad, precarga y hace
  PATCH en vez de POST. Alternativa descartada: rutas `[id]/editar` —
  duplica wiring sin ganancia.
- **Extracción, no reescritura**: cada formulario inline se extrae a un
  componente `*-form.tsx` compartido entre listado (que ya no lo renderiza)
  y la nueva página — el submit (POST/PATCH) ya existe y se reutiliza.
- **Navegación post-submit**: crear → `router.push` de vuelta al listado
  (o al detalle si aplica) con aviso `role="status"`. El listado refetchea
  al montar (las páginas ya fetchean en `useEffect`, así que basta volver).
- **CTA en header**: el botón "＋ Crear" va en `ConsoleHeader` vía prop
  `actions` (ya existe el patrón en `productor/codigos`) o como botón
  superior derecho cuando la página no usa ConsoleHeader.
- **`?crear=1` del productor**: el tab central navega a
  `/productor/eventos/nuevo` directamente (actualizar `TABS_BY_ROLE`); se
  mantiene compat leyendo `?crear=1` como redirect a la nueva ruta.
- **Edición de evento**: el toggle `editing` del detalle `/productor/eventos/[id]`
  navega a `/productor/eventos/nuevo?edit=<id>`; `EventForm` se reusa tal cual.
- **Staff del evento** (`producer/staff-section`): alta por email va a
  `/productor/eventos/[id]/staff/nuevo`; toggles de rol/estado por fila
  quedan inline (acción por fila).
- **Slots dentro de series** (`+ addSlot` por serie): se queda — es acción
  contextual dentro de la card de una serie específica, ya button-gated.

## Risks / Trade-offs

- [Páginas `/nueva` duplican fetch de catálogos (venues, styles, planes,
  slots)] → aceptable: los catálogos son chicos y la página dedicada los
  pide una vez; mismo patrón que `/practicas/nueva`.
- [Estado perdido al volver (scroll/filtros)] → mitigado: las listas son
  cortas y refetchean; no hay paginación compleja en estas pantallas.
- [deep-links viejos `?crear=1` rotos] → redirect desde la página lista.

## Migration Plan

Feature por feature, en orden: academia (planes→videos→alumnos→equipo→
series) luego productor (eventos→codigos→listas→staff). Cada migración es
independiente y commiteable. Rollback: revert del commit — sin datos.
