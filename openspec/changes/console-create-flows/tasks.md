## 1. Academia — planes

- [x] 1.1 Extraer el formulario de `components/academy/plans-section.tsx` a un `PlanForm` reutilizable y crear `/academia/planes/nueva/page.tsx` (crear + `?edit=<planId>`); el listado muestra solo lista + botón "＋ Crear plan" y "Editar" por fila que navega. Verificar: `/academia/planes` sin formulario visible; crear edita y vuelve con feedback.

## 2. Academia — videos

- [x] 2.1 Crear `/academia/videos/nuevo` con el form extraído de `components/academy/videos.tsx`; el listado muestra CTA + lista. Verificar: alta de video desde página dedicada y regreso a la lista.

## 3. Academia — alumnos

- [x] 3.1 Crear `/academia/alumnos/nuevo` con el form "newEnrollment" extraído de `students-section.tsx` (la página nueva fetchea `GET /academies/:id/plans` ella misma); el listado muestra CTA solo si `!readOnly`. Verificar: alta de enrollment y estados empty/error del select de planes.

## 4. Academia — equipo

- [x] 4.1 Crear `/academia/equipo/nuevo` con el form de alta extraído de `staff-section.tsx` (email, nombre, capacidades); el listado conserva lista + toggles por fila. Verificar: alta de colaborador desde página dedicada.

## 5. Academia — series

- [x] 5.1 Crear `/academia/series/nueva` con el form de serie (crear + `?edit=<seriesId>`) extraído de `academia/series/page.tsx`; el listado muestra CTA; `+ addSlot` por serie queda inline. Verificar: page.tsx de series adelgaza; crear/editar serie funciona.

## 6. Productor — eventos

- [x] 6.1 Crear `/productor/eventos/nuevo` reusando `EventForm` (crear + `?edit=<id>`); el listado muestra CTA; el detalle reemplaza el toggle `editing` por navegación al edit; el tab `?crear=1` y TABS_BY_ROLE apuntan a la nueva ruta. Verificar: crear evento, editar desde detalle, deep-link del tab central.

## 7. Productor — códigos y listas

- [x] 7.1 Crear `/productor/codigos/nuevo` con el form extraído; `/productor/listas/nueva` para crear lista (addEntry por fila queda). Verificar: crear código y lista desde páginas dedicadas.

## 8. Productor — staff del evento

- [x] 8.1 Crear `/productor/eventos/[id]/staff/nuevo` con el alta extraída de `producer/staff-section.tsx`; la sección muestra CTA + lista + acciones por fila. Verificar: alta de staff desde página dedicada.

## 9. Cierre

- [ ] 9.1 i18n: todas las keys nuevas (títulos, CTAs, feedbacks) en `messages/es-CL.json`/`parts/*.json`; correr el chequeo de keys (ALL_KEYS_OK).
- [ ] 9.2 `pnpm --filter @omnidance/web build` (o typecheck) verde; `impeccable detect --json` sobre los archivos tocados sin findings nuevos.
- [ ] 9.3 Revisar diff completo: sin forms sueltos restantes en los listados migrados, sin `any`/ts-ignore, empty states con CTA.
