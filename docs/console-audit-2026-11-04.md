# Auditoría consola academia: cobertura del polish + gaps

Fecha: 2026-11-04. Audita el commit `25e1cea8` (change
`academy-console-views-polish`) contra `console-patterns` + `ui-lists` +
patrón expand "Ver todo" de `series/[id]` (LIST_PREVIEW=5 + botón
`seeAll/showLess`). 7 agentes herdr en paralelo (briefs en
`docs/audit-briefs/`), read-only.

## Cobertura del polish

Pages de las secciones pulidas **no tocadas** por el commit, con estado
real verificado:

| Page | Estado |
|---|---|
| `alumnos/nuevo` | ya conforme (ConsoleHeader, gates, ActionNotice) |
| `planes/nueva` | ya conforme (Suspense fallback vacío, notFound sin CTA: nits) |
| `promos/nueva` | parcial: vuelve a ficha en vez de listado tras crear |
| `equipo/page` | parcial: gaps dentro de Staff/InstructorSection |
| `equipo/nuevo` | conforme |
| `cobros/page` | parcial: errores silenciosos en colas (ver bloqueantes) |
| `videos/page` | parcial: delete inline en card, empty sin `query.empty` |
| `configuracion/niveles` | no tocada (llegó en change previo), la más divergente |
| `configuracion/*` resto | conforme vía componentes pulidos |
| `analitica/consultas` | redirect, OK |

Nota: varios `page.tsx` sin diff igual recibieron polish vía componentes
(`academy-settings`, `academy-profile`, `academy-billing`,
`payment-methods-admin`, `import-section`, `students-section/insights`,
`enrollment-form`).

## Bloqueantes (2)

1. **Colas de `/academia/cobros` tragan errores de fetch** → renderizan
   vacío/colapsado sin `role="alert"` + retry: `claims-queue.tsx:77-79`,
   `order-claims-queue.tsx:82`, `cobros-history.tsx:76-90`. En una cola
   operativa el fallo es indistinguible de "nada que validar".
2. **`/analitica/usuarios` sin `ConsoleHeader backHref="/analitica"`**
   (usuarios/page.tsx:41-46) — subpage sin navegación de vuelta.

## Mejoras transversales (patrones que repiten)

- **Busy como texto** `tc("loading")` en vez de `Spinner` inline:
  `staff-form.tsx:271`, `video-form.tsx:137`, `preventas/[id]:304,355`,
  `alumnos/[personId]` botón Guardar.
- **`role="status"`/`alert` mal puesto**: empty con `role="status"`
  (preventas:83); forbidden con `role="alert"` (video-form:72).
- **Forbidden colapsado en error genérico** (401/403/404 → mismo error)
  en fichas cobros claim/orden/pago; y 403 por cap degradado a empty con
  copy falso en staff/instructor sections.
- **`hover:border-neon/40`** en vez de `/60`: staff-section:188,
  instructor-section:110, payment-methods-admin:127.
- **`<section>` landmark sin nombre**: equipo `[id]:124`,
  `profesor/[id]:156`, `planes/[id]:128` (debería ser `<div>` o
  `aria-label`).
- **Cross-refs como texto**: `claim.person.name` y `orden` sin Link a
  ficha alumno (claim:197, orden:211); `fieldOrderRef` sin link a
  `pago/[id]` (orden:233-238); filas historial/próximas de
  `alumnos/[personId]` traen `classId` pero no linkean a
  `/academia/clases/[id]`; ids de actores en `analitica/usuarios/[id]`
  como texto (663-811).
- **Zona destructiva no canónica**: `metodos-de-pago/[methodId]:294-303`
  (sin `border-t pt-6`, rojo `/80`, botón crudo); `niveles` (delete por
  fila sin ConfirmSheet + target <44px, alta/edición inline).
- **Deltas KPI** en planes con neon/warn en vez de green-400/red-400.
- **CTA `+ Nuevo` a la izquierda** en students-section vs convención
  `justify-end` (planes/promos).
- **`ThemeToggle` segmented `min-h-9`** < min-h-11 (afecta apariencia +
  drawer, componente compartido).
- **`queueMicrotask` para academyId** en promos: funciona pero la
  convención es módulo hijo con prop (planes/series); eliminaría el hack.
- **InstructorSection sin FilterBar** (staff sí lo tiene).
- **Convención no uniforme**: raíces de drawer sin ConsoleHeader
  (planes, promos, niveles) vs series que sí lo monta; documentar la
  excepción en la skill.
- **`QueryTable` sin drill** a ficha de usuario desde resultados.
- **`videos`**: delete inline en card sin ficha donde vivir (decidir
  excepción documentada o edit/ficha mínima).

## Expand: dónde falta preview + "Ver todo"

- `alumnos/[personId]`: Pagos/enrollments sin cap (378-406), Historial
  hasta 50 (466-488), Próximas sin cap (506-529).
- `planes/[id]`: alumnos vigentes sin preview (192-212).
- `preventas/[id]`: códigos emitidos sin preview (311-341).
- `cobros` claims-queue: cola PENDING sin filtro renderiza hasta ~200
  cards; discutible (cola de trabajo) pero un cap visual ayuda.
- `profesor/[id]` CourseSurveyResults: grupos mes×serie y comentarios
  sin cota en API (academies.controller:1408-1412,1469) — el más riesgoso.
- `analitica/usuarios/[personId]`: producers, byAcademy/byStyle/byGenre,
  roleHistory, academies, activeEnrollments sin cap server.
- `importar`: tabla de resultados CSV sin acotar (transitoria, bajo).
- `preventas/page`: cola sin bound de historial resuelto.
- Ya acotados server-side (OK): favoriteEvents/topEvents (5), eventos DJ
  (20), invoices (24), frequentSlots (6), history (50), upcoming
  instructor (10), ExpiringList (6 + "Ver todos").
- Sin expands redundantes ni drill inline indebido en ninguna sección.

## Secciones fuera del alcance del polish

`asistencia`, `horarios` (sin ConsoleHeader ni skeletons),
`clases`/`particulares` (parcial), `series` + `clases/[id]` (conformes,
canónicas). Pendientes para una pasada futura.
