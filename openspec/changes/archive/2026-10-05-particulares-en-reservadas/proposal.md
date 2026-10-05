# Proposal — particulares-en-reservadas

## Why

La bandeja "Mis particulares" (`/clases/particular`) es una superficie
separada que duplica mentalidad: una clase particular comprada **es**
una reserva del alumno. Debe aparecer en "Reservadas" de `/clases`
como una clase más, no en una página aparte.

## What Changes

- **`/clases` reservadas** (`scope=mias`, sub-filtro `reservadas`):
  fetch paralelo de `/private-lessons/mine` junto a `/classes/mine`.
  Las particulares activas (REQUESTED/CONFIRMED) se intercalan por
  fecha entre las reservas de clase; las sin fecha ("por agendar") van
  en un grupo fijado arriba. Card propia: academia, instructor (o
  "por asignar"), estado, cancelar (REQUESTED/CONFIRMED — misma
  acción que tenía la bandeja).
- **Historial**: las particulares DONE/CANCELLED se agregan al scope
  `historial` (paridad con reservas canceladas).
- **Calendario de reservadas**: las particulares agendadas pintan dot
  y card en su día, igual que una reserva.
- **Eliminar** `/clases/particular` (página), el chip "Mis
  particulares" en `/clases`, la entrada del sheet `+` en BottomNav y
  el redirect de notificaciones `academy.private_lesson.*` → ahora
  apunta a `/clases?scope=reservadas`.
- **`PrivateLessons`** queda solo staff+instructor (consola
  `/academia/particulares`): se retira la sección alumno ("mis
  clases particulares") — su contenido vive en reservadas.
- **API**: `GET /private-lessons/mine` (rama alumno) incluye
  `academy: {id, name}` para que la card no necesite un fetch extra
  del directorio.

## Impact

- Backend: `PrivateLessonsController.mine` (join academy en rama
  alumno). Contrato aditivo — ningún consumidor se rompe.
- Web: `clases/page.tsx` (fetch+merge+card), borrado de
  `clases/particular/`, `BottomNav`, `notificaciones`,
  `private-lessons.tsx` (sin rama alumno), i18n.
- Sin cambios de schema ni migraciones.
