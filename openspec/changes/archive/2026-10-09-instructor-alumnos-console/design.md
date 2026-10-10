# Design: Consola de alumnos del instructor

## Decisiones

**El módulo ya existía — el cambio es de acceso por navegación, no de
funcionalidad.** `GET /academies/:id/students` (con `q`, status, planId,
from/to, paginación) y `GET /academies/:id/students/:personId`
(enrollments + `history` attended/booked/cancelled + `upcoming`) ya
pasaban por `requireManage`, que cubre al `AcademyInstructor`. La ficha
exponía `canEdit` aparte (cap `students`) — el instructor lee sin poder
mutar. No se toca el API ni los permisos.

**"Mi academia" sale, "Alumnos" entra como tab.** El tab INSTRUCTOR
queda `[Inicio, Mis clases(center), Alumnos]` + Perfil — 4 slots,
dentro del tope de 5 del tab bar. `STUDENTS_TAB` usa `nav.students`
(nueva clave i18n) e icono `users`.

**Sin drawer móvil.** `DRAWER_BY_ROLE.INSTRUCTOR = []` y la condición
"sin drawer" se amplía de `DANCER` a `DANCER || INSTRUCTOR` — sin
hamburguesa ni overlay, ni siquiera la sección Cuenta (Perfil ya es
tab). En `≥lg` la sidebar muestra el grupo del rol (los 3 tabs) +
Cuenta: sigue siendo la única navegación de escritorio.

**Videos y Particulares fuera de la navegación del instructor.**
Salen del drawer (eliminado) y de la grilla del hub `/academia` para el
instructor puro (flag `noInstructor` en MODULES — owner/staff/admin las
conservan; `videos` además sigue detrás de la cap `schedule`). Las
rutas no se bloquean: siguen existiendo para quien tenga acceso; solo
dejan de anunciarse al instructor.

**Hero del home apunta a la consola real.** `/inicio` con lente
INSTRUCTOR enlazaba al hub `/academia`; ahora va a `/academia/clases`.

**Badges de rol en /perfil: tope 2.** `roleStates` se eleva a const
compartida con `approvedRoles`; la lista de badges solo renderiza con
`length <= 2`. Con más roles la identidad queda limpia y "Interactuar
como" (que ya lista los APPROVED) hace de fuente.

## Riesgos

- Instructor con rol mixto (staff+instructor en la misma academia):
  `pureInstructor` exige `!isStaff && !isAdmin && !access.isOwner` —
  sigue viendo Particulares.
- Rutas quitadas de la nav siguen resolviendo por URL directa — es
  deliberado (las comparten otros roles).
