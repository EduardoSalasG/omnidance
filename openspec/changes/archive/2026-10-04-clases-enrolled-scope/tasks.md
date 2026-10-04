# Tasks

## 1. API

- [x] 1.1 `browse`: param `scope=enrolled` → filtrar por Enrollment vigente (ACTIVE/TRIAL/ONLINE); `enrolled: boolean` por item (Set de academyIds vigentes)
- [x] 1.2 `GET /classes/:id` (detail): flag `enrolled` con la misma regla
- [x] 1.3 `POST /classes/:id/book`: gate de inscripción vigente → 403; ampliar select con `slot.academyId`
- [x] 1.4 Tests e2e/classes: browse scope, book 403/200, detail enrolled

## 2. Web /clases

- [x] 2.1 Vistas: `view=explore` nuevo; `view=mine` → redirige a `list+scope=reservadas`
- [x] 2.2 `scope=mias` → `scope=reservadas` (alias legado aceptado); toggle Todas|Reservadas visible en list además de calendar
- [x] 2.3 list/calendar cargan `browse?scope=enrolled`; reservadas cargan `/classes/mine` (cards wallet + QR)
- [x] 2.4 Header: ícono marcador → brújula → view=explore; explore renderiza parrilla con todas las academias y CTA condicionado por `cls.enrolled` (estado "Requiere inscripción" en vez de Reservar)
- [x] 2.5 Empty state sin inscripciones vigentes en list/calendar → CTA a explore
- [x] 2.6 `ClassBookingCta` (ficha /clases/[id]): estado "Requiere inscripción" cuando `enrolled=false`

## 3. i18n + docs

- [x] 3.1 Keys: `viewExplore`, `scopeBooked` (Reservadas), `requiresEnrollment`, `notEnrolledEmpty*`; renombrar `scopeMine`; pasos del tour (`cl-mine` → explore)
- [x] 3.2 `omni-dance.md`: regla "reserva exige inscripción vigente (ACTIVE/TRIAL/ONLINE)"; `docs/architecture.md` endpoints
- [x] 3.3 Regenerar `docs/openapi.json` + postman (API viva)

## 4. Verificación

- [x] 4.1 tsc api + web; suite afectada (classes e2e + specs que toquen book)
- [x] 4.2 Smoke API viva: browse scope enrolled vs all; book con/sin inscripción
- [x] 4.3 Diff limpio, handoff en docs/, commit(s) acotados en dev
