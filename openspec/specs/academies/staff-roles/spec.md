# academies/staff-roles Specification

## Purpose
TBD - created by archiving change academy-staff-roles. Update Purpose after archive.

## Requirements

### Requirement: Colaboradores con capacidades granulares

`AcademyStaff { academyId, personId, canStudents, canPayments, canPlans,
canSchedule, canProfile, canTeam, canBilling }` SHALL representar a un
colaborador delegado de la academia. `@@unique([academyId, personId])`.
El owner de la academia (`Academy.ownerId`) SHALL tener todas las
capacidades implícitamente sin necesitar una fila staff. ADMIN de
plataforma (`admin.access`) SHALL pasar cualquier check de capacidad.

Las capacidades SHALL mapear a familias de endpoints:

- `students` — enrollments (alta, PATCH vigencia, listado de alumnos),
  listados de asistencia.
- `payments` — cola/aprobación/rechazo de `PaymentClaim`, CRUD de
  `AcademyPaymentMethod`, stream de comprobantes, payouts.
- `plans` — CRUD de `MembershipPlan`.
- `schedule` — CRUD de `ClassSeries`, `ClassSlot`, clases manuales,
  videos de clase.
- `profile` — `PATCH /academies/:id/settings` (perfil público).
- `team` — mantenedor de colaboradores e instructores (incl.
  `commissionPct`).
- `billing` — suscripción SaaS de la academia (subscribe/cancel/pago).

#### Scenario: staff con flag pasa, sin flag 403

- **GIVEN** staff con `canPayments: true` y `canSchedule: false`
- **WHEN** llama `POST /academies/:id/claims/:c/approve` THEN pasa
- **WHEN** llama `POST /academies/:id/series` THEN recibe 403

#### Scenario: instructor no gana capacidades

- **GIVEN** un `AcademyInstructor` sin fila `AcademyStaff`
- **WHEN** llama un endpoint de capacidad THEN recibe 403
- **WHEN** llama un endpoint `requireManage` (asistencia) THEN pasa

### Requirement: Resolución de acceso del viewer

`GET /academies/:id/access` SHALL responder a cualquier usuario con
sesión `{isOwner, isInstructor, isStaff, caps:{students,payments,plans,
schedule,profile,team,billing}}` — owner y ADMIN devuelven todas las
caps en true. La consola lo usa para ocultar secciones sin permiso.

#### Scenario: staff ve solo sus capacidades

- **WHEN** un staff con solo `canStudents` consulta `/access`
- **THEN** recibe `caps.students=true`, resto false, `isStaff=true`

### Requirement: Mantenedor de equipo

Bajo `/academies/:id/staff` (capacidad `team`):

- `GET` SHALL listar colaboradores con nombre/email y sus flags.
- `POST {email, caps...}` SHALL: normalizar el email; si existe Person
  crear/actualizar la fila staff; si no existe crear Person stub
  `{email, name}` (name = parte local del email si falta) + fila staff +
  enviar email de invitación con magic link (TTL largo, ≥72h). Re-enviar
  a un email ya staff SHALL actualizar flags sin duplicar.
- `PATCH /:personId {caps...}` SHALL actualizar flags.
- `DELETE /:personId` SHALL eliminar la fila (el staff pierde acceso a la
  consola pero conserva su cuenta).
- Un staff con `team` SHALL NOT poder eliminarse ni editarse a sí mismo
  (evita auto-bloqueo del último gestor) — 400 `cannot_modify_self`.
  `academy.ownerId` SHALL NOT ser objetivo de DELETE/PATCH (no es fila).

#### Scenario: invitar email nuevo

- **WHEN** owner hace POST staff con email inexistente y `canPayments`
- **THEN** se crea Person stub + AcademyStaff y se envía email con link
  de acceso de larga duración; al verificar el link la persona entra con
  su cuenta y ve la consola con `payments` habilitado

#### Scenario: quitar colaborador

- **WHEN** owner hace DELETE sobre un personId staff
- **THEN** la fila se elimina y sus llamadas a endpoints de capacidad
  responden 403 de inmediato

### Requirement: Auditoría de revisión de cobros

`PaymentClaim.reviewedBy` SHALL ser relación a `Person` (nullable).
`GET /academies/:id/claims` SHALL incluir en cada claim terminal
(APPROVED/REJECTED) `reviewedBy:{id,name}`, `reviewedAt` y `reviewNote`.
La consola de cobros SHALL mostrar quién revisó cada claim.

#### Scenario: dos revisores distintos

- **GIVEN** staff A aprueba claim1 y staff B rechaza claim2
- **WHEN** el owner lista la cola
- **THEN** claim1 muestra a A como reviewer y claim2 muestra a B

### Requirement: Magic token de larga duración para invitaciones

`AuthService.createMagicToken(email, consent?, ttlSeconds?)` SHALL
aceptar un TTL explícito (default = comportamiento actual ~15min). Los
emails de invitación (staff y futuros imports de alumnos) SHALL usar
TTL ≥72h; el endpoint `GET /auth/verify` no cambia.

#### Scenario: link de invitación no expira en 15min

- **WHEN** se genera el link de invitación de staff
- **THEN** el token verifica correctamente a las 48h

### Requirement: Mantenedor de profesores

Bajo `/academies/:id/instructors` (capacidad `team`, mismas reglas de
acceso que el mantenedor de colaboradores):

- `GET` SHALL listar los `AcademyInstructor` de la academia con
  `person:{id,name,email}`, el acuerdo económico (`payType`, `payAmount`,
  `payClasses`, `commissionPct` con valor solo bajo `COMMISSION`) y
  `createdAt`, ordenados por alta.
- `POST {email, name?, payType?, payAmount?, payClasses?,
  commissionPct?}` SHALL normalizar el email; si existe `Person`
  crear/actualizar la membresía; si no existe crear `Person` stub
  `{email, name}` + membresía + enviar email de invitación con magic
  link de TTL ≥72h. Re-enviar a un email ya instructor SHALL actualizar
  el acuerdo (si se envía) sin duplicar la fila. `commissionPct` SHALL
  ser entero 0–100 cuando se envía y solo aplica con
  `payType=COMMISSION`.
- `DELETE /:personId` SHALL eliminar la membresía: la persona pierde
  acceso de instructor a esa academia pero conserva su cuenta. 404 si
  no existe.
- `academy.ownerId` SHALL NOT ser objetivo de POST/DELETE (el dueño no
  es instructor de su propia academia por fila). El actor SHALL NOT
  gestionarse a sí mismo (`cannot_modify_self`).

La membresía `AcademyInstructor` SHALL ser suficiente para los
endpoints de instructor (`/classes/teaching`, asistencia de sus clases)
sin requerir `PersonRole INSTRUCTOR`.

#### Scenario: invitar profesor nuevo

- **WHEN** owner hace POST instructors con email inexistente y
  `payType=COMMISSION, commissionPct=20`
- **THEN** se crea Person stub + AcademyInstructor con ese acuerdo y se
  envía email de invitación; al entrar por el link la persona puede
  llamar `/classes/teaching` de esa academia

#### Scenario: quitar profesor

- **WHEN** owner hace DELETE instructors/:personId de un instructor
- **THEN** la fila se elimina y sus llamadas de instructor a esa
  academia responden 403

#### Scenario: staff sin team no gestiona profesores

- **WHEN** un staff sin `canTeam` llama GET/POST/DELETE instructors
- **THEN** recibe 403

### Requirement: Consola de instructor fuera de la lente owner

`/academia/clases` (consola "Mis clases" del instructor) MUST NOT
aparecer en la navegación del rol ACADEMY_OWNER (drawer móvil ni
sidebar desktop). Una persona navegando con la lente ACADEMY_OWNER que
llegue a esa ruta SHALL ser redirigida a `/inicio`. La lente INSTRUCTOR
(y quienes tengan ambos roles y la elijan) conserva el acceso.

La navegación del instructor SHALL reducirse a sus destinos operativos:
tab bar = Inicio, Mis clases, Alumnos y Perfil. "Mis clases" SHALL ser
un tab normal — MUST NOT renderizarse como acción central destacada
(`center`): hereda el estilo de los demás tabs y solo se acentúa cuando
está activo. El hub `/academia` ("Mi academia"), Clases particulares y
Videos MUST NOT aparecer en la navegación del instructor (tab bar,
drawer ni sidebar); las rutas siguen existiendo para owner/staff.

El instructor MUST NOT renderizar hamburguesa ni drawer overlay en
`<lg` (mismo criterio que DANCER: todo cabe en el tab bar). En `≥lg`
el instructor MUST NOT renderizar sidebar — el tab bar inferior sigue
visible en todos los breakpoints como su única navegación, y el
contenido no reserva el padding lateral de la sidebar.

`/academia/clases` SHALL mostrar solo el listado de clases del
instructor: MUST NOT renderizar el strip de KPIs de academia
(`AcademyKpiStrip`).

El home del instructor MUST NOT mostrar la card "Mi academia"; SHALL
mostrar una sección "Próximas clases" con las próximas clases que dicta
(reuso de la card de clase del home del alumno) enlazando a
`/academia/clases/:id`.

#### Scenario: owner entra a mis clases

- **GIVEN** una persona con rol ACADEMY_OWNER navegando con esa lente
- **WHEN** abre `/academia/clases`
- **THEN** es redirigida a `/inicio` y el drawer nunca lista el módulo

#### Scenario: instructor conserva la consola

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** abre `/academia/clases`
- **THEN** ve sus clases asignadas sin strip de KPIs

#### Scenario: instructor navega a alumnos

- **GIVEN** una persona con lente INSTRUCTOR
- **WHEN** mira el tab bar
- **THEN** hay un tab "Alumnos" que abre `/academia/alumnos`, no existe
  tab "Mi academia", "Mis clases" es un tab normal (no central verde) y
  en `<lg` no hay hamburguesa ni drawer

#### Scenario: instructor en desktop sin sidebar

- **GIVEN** una persona con lente INSTRUCTOR en viewport ≥lg
- **WHEN** carga cualquier página de la app
- **THEN** no hay sidebar lateral ni padding lateral reservado; el tab
  bar inferior (Inicio, Mis clases, Alumnos, Perfil) es la navegación

#### Scenario: home del instructor

- **GIVEN** una persona con lente INSTRUCTOR en `/inicio`
- **WHEN** la página carga
- **THEN** no hay card "Mi academia" y la sección "Próximas clases"
  lista las próximas clases que dicta, cada una enlazando a su roster

### Requirement: Detalle de miembro de equipo y profesor

Las cards de equipo SHALL navegar a páginas de detalle en vez de exponer
acciones inline:

- Colaborador → `/academia/equipo/[personId]`: datos de contacto,
  rol, permisos vigentes y enlace a edición de permisos (nivel 3).
- Profesor → `/academia/equipo/profesor/[personId]`: datos de contacto,
  acuerdo económico, estadísticas (clases impartidas total/mes,
  asistencias del mes), próximas clases y enlace a edición del acuerdo.

#### Scenario: Owner edita permisos del colaborador

- **WHEN** PATCH `/academies/:id/staff/:personId` con `permissions[]`
- **THEN** el set de permisos se reemplaza y responde el miembro
  actualizado

### Requirement: Acuerdo económico del profesor

La relación económica con el profesor SHALL configurarse al crear/editar
el profesor (desde Equipo), con tres modalidades: `PER_CLASS` (pago por
clase), `MONTHLY` (mensual por una cantidad de clases pactada) o
`COMMISSION` (porcentaje que la academia retiene de cada clase
particular). Campos: `payType`, `payAmount`, `payClasses` (obligatorio
en MONTHLY), `commissionPct` (0–100, obligatorio en COMMISSION). Un solo
subtipo SHALL estar activo — los campos de los demás subtipos quedan en
null.

#### Scenario: Profesor por clase

- **WHEN** POST/PATCH instructor con `payType=PER_CLASS`,
  `payAmount=15000`
- **THEN** se persiste el acuerdo y el detalle muestra "$15.000/clase"

#### Scenario: Profesor a mensualidad

- **WHEN** POST/PATCH instructor con `payType=MONTHLY`,
  `payAmount=400000`, `payClasses=20`
- **THEN** se persiste el acuerdo y el detalle muestra "$400.000/mes por
  20 clases"

#### Scenario: Profesor a comisión

- **WHEN** POST/PATCH instructor con `payType=COMMISSION`,
  `commissionPct=25`
- **THEN** se persiste el acuerdo y el detalle muestra que la academia
  retiene 25% por particular

### Requirement: Alumnos consultables por el instructor

`GET /academies/:id/students` y `GET /academies/:id/students/:personId`
SHALL ser accesibles para cualquier `AcademyInstructor` de la academia
(vía `requireManage`), en modo solo-lectura: el instructor no puede
crear enrollments ni mutar `status`/`endsAt` (la capacidad `students`
sigue siendo de owner/staff). El listado SHALL soportar búsqueda por
nombre (`q`, ≥2 chars) y la ficha SHALL incluir el historial de clases
del alumno (`history`: `attended`/`booked`/`cancelled` sobre clases
pasadas) y sus próximas reservas (`upcoming`).

La página `/academia/alumnos` con lente INSTRUCTOR MUST NOT mostrar el
strip de KPIs, la sección Insights (top asistencia / top pagadores),
el card de importación ni el CTA de nueva inscripción. Los filtros de
fecha MUST NOT aparecer en esta vista para ninguna lente (permanecen
disponibles en el motor de analítica).

Las restricciones de la lente INSTRUCTOR SHALL aplicar por lente
activa, no por los roles reales de la persona: quien posea además
ACADEMY_OWNER, ADMIN o una fila staff ve, bajo la lente INSTRUCTOR,
exactamente lo que vería un instructor puro. La única mutación
habilitada para la lente INSTRUCTOR es marcar asistencia, y el backend
solo la acepta para clases cuyo plantel lo incluye
(`POST /classes/:id/attendance` y `POST /academies/:id/attendance`
rechazan a quien no es instructor efectivo de la clase salvo ADMIN de
plataforma).

`GET /academies/:id/students/insights` MUST NOT exponer montos a quien
no tiene la capacidad `payments`: `topPayersMonth` SHALL devolverse
solo a owner/ADMIN/staff con `canPayments`; para el resto (incl.
instructor) SHALL responder `topPayersMonth: []`.

#### Scenario: instructor busca un alumno

- **GIVEN** un instructor de la academia A
- **WHEN** llama `GET /academies/A/students?q=mar`
- **THEN** recibe los enrollments de A cuyo nombre contiene "mar"
  (insensitive) y puede abrir la ficha con su historial de asistencias

#### Scenario: instructor no edita alumnos

- **GIVEN** un instructor de la academia A sin capacidad `students`
- **WHEN** llama `PATCH /enrollments/:id`
- **THEN** recibe 403

#### Scenario: vista de alumnos del instructor

- **GIVEN** una persona con lente INSTRUCTOR en `/academia/alumnos`
- **WHEN** la página carga
- **THEN** solo ve búsqueda + filtros (sin fechas) y la tabla de
  alumnos: sin KPIs, sin Insights, sin "Nueva inscripción" y sin
  "Importar alumnos"

#### Scenario: admin bajo la lente instructor

- **GIVEN** una persona con rol ADMIN navegando con la lente INSTRUCTOR
- **WHEN** abre `/academia/alumnos` o la ficha `/academia/alumnos/[id]`
- **THEN** ve la misma superficie que un instructor puro: sin KPIs ni
  Insights en el listado y sin el editor de estado/fecha en la ficha

#### Scenario: insights sin datos de pago para el instructor

- **GIVEN** un instructor de la academia A sin capacidad `payments`
- **WHEN** llama `GET /academies/A/students/insights`
- **THEN** recibe `topAttendance` con datos y `topPayersMonth: []`

#### Scenario: staff con payments ve el ranking de pagos

- **GIVEN** un staff de la academia A con `canPayments`
- **WHEN** llama `GET /academies/A/students/insights`
- **THEN** recibe `topPayersMonth` con el top 5 por monto del mes

### Requirement: Tour guiado de primera visita del instructor

En `/inicio` con lente INSTRUCTOR la app SHALL correr un tour de
primera visita (`onboarding["instructor"]`, marcado una vez por
persona vía `POST /me/onboarding`) con pasos sobre su home (KPIs de la
semana, próximas clases que dicta), sus tabs (Mis clases, Alumnos) y
la campana de notificaciones. Los pasos cuyo target no exista (sin
clases próximas, tab no visible) SHALL omitirse sin bloquear el tour.

#### Scenario: tour del instructor

- **GIVEN** un instructor que nunca vio el tour
- **WHEN** abre `/inicio` con lente INSTRUCTOR
- **THEN** el tour recorre sus KPIs, la sección de próximas clases,
  los tabs Mis clases y Alumnos, la campana y el perfil, y al cerrarse
  marca `onboarding["instructor"]`
