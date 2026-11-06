# Delta: academies/console-lists

## ADDED Requirements

### Requirement: Búsqueda de persona en el alta de alumno

El alta de enrollment (`/academia/alumnos/nuevo`) SHALL resolver la
persona por búsqueda (nombre o email) y nunca por id tipeado a mano.
`GET /academies/:id/students/candidates?q=` SHALL responder los
candidatos (`{id, name, email}`) filtrados por `q` de al menos 2
caracteres sobre nombre o email (contains, case-insensitive),
ordenados por nombre y acotados a 10, excluyendo cuentas con
`deletedAt`. El endpoint SHALL exigir la capacidad `students` (owner,
ADMIN o staff con el flag), la misma que autoriza el POST de
enrollment. La UI SHALL debouncear la consulta (~300ms), mostrar
nombre y email de cada coincidencia y, si el término no encuentra a
nadie, un estado vacío honesto ("sin coincidencias"), distinto del
estado de error. Al elegir un candidato, el formulario fija su id
internamente y muestra la identidad elegida (nombre/email) con opción
de cambiar; el `personId` nunca se expone ni se edita como texto.

#### Scenario: candidatos por nombre

- **GIVEN** personas "María Paz" y "Mariano" registradas
- **WHEN** el owner escribe "mar" y espera el debounce
- **THEN** el dropdown lista ambas con nombre y email

#### Scenario: término corto no consulta

- **WHEN** el owner escribe "m" (1 carácter)
- **THEN** la UI no dispara el fetch ni muestra dropdown

#### Scenario: sin coincidencias

- **GIVEN** ninguna persona que contenga "zzzz"
- **WHEN** el owner busca "zzzz"
- **THEN** la UI muestra el estado "sin coincidencias" y el alta no
  puede enviarse hasta elegir una persona

#### Scenario: selección fija el id

- **GIVEN** el dropdown con candidatos
- **WHEN** el owner elige "María Paz"
- **THEN** el form muestra su nombre/email como selección (con opción
  de cambiar) y el POST envía su `personId` real

#### Scenario: sin capacidad students

- **WHEN** un instructor sin cap `students` llama
  `GET /academies/:id/students/candidates?q=ma`
- **THEN** recibe 403

### Requirement: "Pagado hasta" sugerido por el plan en el alta

Al elegir plan en el formulario de alta, la UI SHALL pre-rellenar
`endsAt` con la vigencia que corresponde al tipo y duración del plan,
misma regla que aplica el backend al cobrar (`membershipEndsAt`):
MONTHLY → fin del mes calendario en curso; QUARTERLY → fin del 3er
mes; SEMIANNUAL → fin del 6º; PERIOD y TRIAL → inicio + `periodDays`
(si el plan lo define); SINGLE → día siguiente; CLASS_PACK → sin
fecha. La fecha sugerida SHALL quedar editable (override manual) y
recomputarse al cambiar de plan solo si el usuario no la editó a mano.

#### Scenario: plan mensual sugiere fin de mes

- **GIVEN** un plan MONTHLY y el alta abierta el 12 de octubre
- **WHEN** el owner elige el plan
- **THEN** `endsAt` se pre-rellena al 31 de octubre y queda editable

#### Scenario: plan por período sugiere inicio + días

- **GIVEN** un plan PERIOD con `periodDays=30`
- **WHEN** el owner lo elige
- **THEN** `endsAt` se pre-rellena al inicio + 30 días

#### Scenario: override manual no se pisa

- **GIVEN** el owner editó `endsAt` a mano
- **WHEN** cambia el plan seleccionado
- **THEN** su fecha manual se conserva

### Requirement: Contacto y método de pago en la ficha del alumno

`GET /academies/:id/students/:personId` SHALL incluir `email` y
`phone` de la persona y, por cada enrollment del historial de pagos,
`method` con el último método de pago conocido: el `methodLabel` del
claim más reciente ligado a ese enrollment; si no hay claim, el
método del pago PAID de pasarela de esa persona y plan
(`methodLabel` de la orden o `gatewayMedia`); `null` si no hay
registro. La ficha SHALL mostrar email y teléfono junto a los datos
del alumno (cuando existan) y el método en cada fila de pagos. En
viewport mobile la línea "pagado hasta" SHALL ocupar su propia fila
(tercera, bajo el chip de estado) en vez de competir por ancho con
los badges.

#### Scenario: enrollment pagado por transferencia

- **GIVEN** un enrollment con claim APPROVED cuyo `methodLabel` es
  "Transferencia"
- **WHEN** se abre la ficha
- **THEN** su fila de pagos muestra "Transferencia"

#### Scenario: enrollment sin registro de pago

- **GIVEN** un enrollment cargado a mano por el staff, sin claim ni
  pago asociado
- **WHEN** se abre la ficha
- **THEN** su fila no muestra método (no inventa uno)

### Requirement: Edición de inscripción tras gesto explícito

El editor de inscripción de la ficha (estado + "pagado hasta") SHALL
estar bloqueado por defecto: los campos se presentan como lectura y
un botón "Editar" habilita el modo editable con Guardar y Cancelar.
Guardar con éxito o Cancelar SHALL devolver el bloque a lectura;
Cancelar además revierte los drafts a los valores vigentes.

#### Scenario: bloqueado por defecto

- **GIVEN** un owner con cap `students` abre la ficha
- **THEN** ve estado y vigencia como datos + botón "Editar", sin
  inputs activos

#### Scenario: editar y guardar

- **WHEN** presiona "Editar", cambia el estado y guarda
- **THEN** el PATCH corre, el bloque vuelve a lectura y los valores
  nuevos quedan visibles

#### Scenario: cancelar revierte

- **WHEN** edita campos y presiona "Cancelar"
- **THEN** el bloque vuelve a lectura con los valores previos intactos

### Requirement: pageSize responsivo en listados de consola

Los listados pesados de la consola SHALL pedir `pageSize=20` en
viewport desktop (≥1024px) y `pageSize=10` en mobile; el cambio de
viewport SHALL resetear la página a 1. El listado de alumnos SHALL
aplicar esta regla usando el hook compartido `useConsolePageSize`.

#### Scenario: mobile pagina de a 10

- **GIVEN** un owner en un viewport <1024px con 35 alumnos
- **WHEN** abre el listado
- **THEN** la primera página trae 10 y el Pager refleja 4 páginas

#### Scenario: rotar a desktop repagina

- **GIVEN** el listado abierto en mobile en página 3
- **WHEN** el viewport cruza a ≥1024px
- **THEN** la vista vuelve a página 1 y pide `pageSize=20`

### Requirement: Chips del card de alumno legibles

El card del listado de alumnos SHALL comunicar la vigencia con texto
explícito además del color: el chip del plan conserva su color por
estado de pago (al día / vencido / sin fecha registrada) y la fecha
se acompaña de una frase legible con ícono: "Venció el {date}" si la
vigencia ya pasó, "Pagado hasta el {date}" si está vigente, "Sin
fecha de término" si no hay `endsAt`. El color nunca es el único
portador de significado.

#### Scenario: plan vencido se lee sin color

- **GIVEN** un alumno cuyo plan venció el 12 de octubre
- **WHEN** se renderiza su card
- **THEN** se lee "Venció el 12 oct" junto al chip del plan

#### Scenario: plan vigente

- **GIVEN** un alumno con `endsAt` futuro
- **WHEN** se renderiza su card
- **THEN** se lee "Pagado hasta el {date}" junto al chip del plan
