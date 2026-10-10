# Proposal: Consola de alumnos del instructor

## Qué y por qué

La lente INSTRUCTOR hoy navega por un tab "Mi academia" (`/academia`,
hub de módulos) + un drawer con Mis clases, Particulares, Alumnos y
Videos. El rol real del profesor es más acotado: llegar a sus clases
(marcar asistencia) y **conocer a sus alumnos** — buscarlos y ver a qué
clases asistieron. El módulo de alumnos ya existe y ya le sirve al
instructor (`GET /academies/:id/students` + `students/:personId` con
`requireManage`, búsqueda `q`, historial `attended/booked/cancelled`),
pero quedaba escondido en el drawer detrás del hub.

Se simplifica la navegación del instructor a tres destinos y se retira
el drawer móvil (mismo criterio que la lente DANCER: todo cabe en el
tab bar). Además, `/perfil` deja de listar los roles bajo la identidad
cuando son más de dos — la sección "Interactuar como" ya los muestra.

## Alcance

- **Tab bar INSTRUCTOR**: `Mi academia` se reemplaza por `Alumnos`
  (`/academia/alumnos`). Tabs finales: Inicio, Mis clases (central),
  Alumnos + Perfil.
- **Drawer móvil INSTRUCTOR**: se elimina por completo (sin hamburguesa)
  — Mis clases y Alumnos ya son tabs; Videos y Clases particulares
  salen de la navegación del instructor (las páginas siguen existiendo
  para owner/staff).
- **Sidebar desktop INSTRUCTOR**: queda con el grupo del rol (Inicio,
  Mis clases, Alumnos) + Cuenta — es la única navegación en `≥lg`.
- **Alumnos para instructor**: sin cambios de API — la página, la
  búsqueda `q`, la ficha y el historial de asistencias ya funcionan con
  `requireManage` (el instructor lee, no edita).
- **Perfil**: los badges de rol bajo nombre/correo se muestran solo si
  hay ≤2; con más roles se omite la lista (están en "Interactuar como").

## Fuera de alcance

- Endpoints nuevos: no se necesitan (students/studentDetail ya cubren
  búsqueda e historial para el instructor).
- Permisos de edición de alumnos para instructor (sigue read-only).
- Navegación de otros roles (owner/productor/admin intacta).
