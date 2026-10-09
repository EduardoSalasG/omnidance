# Delta — academies/staff-roles (instructor-commission-subtype)

El mantenedor de profesores acepta el acuerdo completo (incluido el
subtipo COMMISSION) y el acuerdo deja de tratar la comisión como
deprecada.

## MODIFIED Requirements

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
