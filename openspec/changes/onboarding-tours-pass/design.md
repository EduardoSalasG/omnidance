# Design: onboarding-tours-pass

## Context

Los 26 tours montados resuelven copy por `useTranslations("tours")`
(catálogo `apps/web/src/i18n/parts/tours.json`, espejos en/fr/pt-PT)
y posicionan con driver.js 1.8 (`popoverClass: "omnidance-tour"`,
theming en `globals.css:308-372`). La auditoría de esta sesión produjo
el inventario de mounts, la tabla de vocabulario UI real y los riesgos
de escape de viewport; las decisiones abajo las aplican.

## Goals / Non-Goals

- Goal: copy preciso y cercano que calce con los labels que el usuario
  ve en pantalla; popover contenido en viewport; tour `admin` montado;
  tours nuevos en `/productor/eventos` y `/academia/series`;
  steps muertos removidos.
- Non-goal: no se agregan tours a fichas, formularios ni páginas de
  configuración (patrón vigente: solo hubs y listados). No se traduce
  vocabulario del resto de la UI (score, jobs, triggers se mantienen
  porque son labels reales). No se toca `TOUR_KEYS` salvo las claves
  nuevas.

## Decisions

### D1. Glosario tour ↔ UI (regla: el tour nombra lo que la pantalla muestra)

Reemplazos (la UI NO muestra el término actual del tour):

| Copy actual | UI real | Nuevo copy |
|---|---|---|
| roster | "Reservados"/"Lista de espera" | "la lista de la clase" |
| card (elemento) | — | el objeto: "cada evento/fila/tarjeta" según caso |
| chip (filtros) | — | "un estilo" / "el filtro de estilo" |
| tabs (puerta) | "Escanear QR"/"Asistentes" | "los botones de abajo" |
| nav | — | "el menú" |
| checklist (academia) | "Primeros pasos" | "Primeros pasos" |
| matrícula | "Inscripción" | "inscripción" / "Agregar alumno" |
| POS | — | "tu caja" |
| digests | — | "resúmenes" |
| RBAC | "Catálogo de roles" | "Permisos y roles" |
| insights (perfil) | "Tu actividad" | "tu actividad" |
| offline | "Sin conexión" | "sin señal"/"sin conexión" |
| corridas/correrlas a mano | — | "ejecuciones"/"ejecutarlas al momento" |
| evidencia | — | "el comprobante" |
| paginado | — | "por páginas" |
| precarga (analítica) | — | "la abre con todo listo" |
| atribución | — | "te muestra quién volvió" |
| retrospectiva | — | "tu resumen de la noche" |

Se mantienen por ser vocabulario real de la UI (subagente de
vocabulario lo verificó por catálogo): score, check-ins, jobs
("Jobs programados"), triggers ("Triggers automáticos"), consola,
staff, lineup, link, tag, CRM, cooldowns, quórum, padrón, nómina,
entidad, consultas, CSV/PDF, campana (icono campana), QR, ticket,
lente ("Sin consultas para este lente" es copy visible).

Además: los 17 ` - ` como separador se reescriben (regla del repo:
punto, punto y coma, dos puntos o paréntesis).

### D2. Contención de viewport (mínima, sin pelear driver.js)

driver.js 1.8 ya auto-flippea y clampea el eje paralelo; los escapes
reales son (a) ancho fijo `max-width: 300px` sin tope `vw` y (b) anchors
fuera de pantalla con rects válidos. Fix:

1. `.driver-popover.omnidance-tour` en `globals.css`:
   `max-width: min(300px, calc(100vw - 24px))`;
   `max-height: calc(100dvh - 24px)`; `overflow-y: auto`.
2. `OnboardingRunner.resolveSteps`: exigir intersección real con el
   viewport (`rect.bottom > 0 && rect.top < innerHeight && rect.right >
   0 && rect.left < innerWidth`), no solo `getClientRects() > 0`. Se
   extrae a helper testeable (`isAnchorVisible`) — TDD: specs de rect
   fuera de pantalla (appbar `translateY(-100%)`), parcial y oculto.
3. `TourStep` suma `align?: "start" | "center" | "end"` pasado al
   popover; se aplica `align: "end"` a los steps anclados al borde
   derecho (`appbar-bell`, `nav-profile`, `staff-counter`).

Alternativa descartada: forzar `.appbar-hidden` off durante el tour —
más invasivo; la intersección ya omite el anchor oculto.

### D3. Tour `admin` en el home

Se monta en `HomeHub` dentro del branch `else` con
`activeRole === "ADMIN"` (donde vive `admin-leads`). Anchors:
`data-tour="admin-kpis"` (nuevo, sobre la sección de KPIs agrupados),
`admin-leads` (existe), `appbar-menu`/`app-sidebar` (chrome), `appbar-bell`.
Copy `admin.*` reescrito a 4 pasos: KPIs, cola de leads, los módulos
desde el menú, la campana. Se eliminan los textos huérfanos s1–s5 del
bloque viejo (describían páginas `/admin/**` no anclables desde el home).

### D4. Steps muertos

`crm.s5` y `academia-alumnos.s6`: no existe elemento al que apuntar
(sin switcher de actor en `/crm`; el import vive en otra página) → se
remueve el step del mount y su copy de los 4 locales. `TOUR_KEYS` no
cambia por esto (las claves de tour persisten).

### D5. Tours nuevos (mismo patrón de mount)

- `/productor/eventos`: anchors `producer-events-filters`,
  `producer-events-list`, `producer-events-new` (wrapper del CTA del
  `ConsoleHeader.actions`). Copy `productorEventos.*` 3 pasos.
- `/academia/series`: anchors `academy-series-filters`,
  `academy-series-list`, `academy-series-new`. Copy `academia-series.*`
  3 pasos (kebab como el resto de keys `academia-*`).

`TOUR_KEYS` += `admin`, `productor-eventos`, `academia-series`.

## Risks / Trade-offs

- [Copy nuevo desdibuja una feature ("lente", "score" mantenidos)]
  → mitigado: se conserva exactamente el vocabulario que la UI muestra;
  la tabla D1 queda en el inventario QA para futuras ediciones.
- [Steps nuevos en páginas con contenido variable] → el runner ya omite
  anchors ausentes; los mounts solo se declaran tras el gate `ready`.
- [`max-height` + `overflow-y` en popover] → driver.js usa `position:
  fixed` + transform; el scroll interno solo aplica con textos largos
  en pantallas bajas (landscape móvil), caso antes roto.
- [Align:"end" en anchors de borde] → si driver no soporta el align en
  ese side, cae al default "start" (comportamiento actual, sin regresión).

## Migration Plan

Sin migración: `onboarding` es un mapa libre por clave; las claves
nuevas (`admin`, `productor-eventos`, `academia-series`) corren el
tour una sola vez por persona la próxima vez que entren a la superficie.
Rollback = revert del commit; tours ya vistos quedan marcados.
