# academies/console-lists Specification

## Purpose
TBD - created by archiving change academy-console-v3. Update Purpose after archive.

## Requirements

### Requirement: Envelope paginado en endpoints de listado

Los endpoints de listado de la consola SHALL aceptar `page` y
`pageSize` (opcionales) y responder `{items, total, page, pageSize}`;
ninguna vista operativa descarga la tabla completa. `page` se
normaliza a ≥1 (default 1); `pageSize` se normaliza a ≥1 (default 25)
y se capa a un máximo por endpoint (100 por defecto; 200 en claims).
Valores no numéricos caen al default sin error. Los filtros
existentes (q, status, enums, fechas) SHALL aplicarse antes de
paginar: el `total` refleja el filtro, no la tabla entera.

Endpoints cubiertos (además de los ya existentes en otros cambios):

- `GET /academies/:id/students`
- `GET /academies/:id/plans`
- `GET /academies/:id/series`
- `GET /academies/:id/staff`
- `GET /academies/:id/instructors`
- `GET /academies/:id/private-lessons`
- `GET /academies/:id/claims` (pageSize máx 200)
- `GET /payments/by-academy/:academyId`
- `GET /producer/claims` (conserva la clave `claims` + total/page/pageSize)
- `GET /crm/people` (agrega filtros server-side `q`/`segment`/`tag` y
  devuelve `segmentCounts`/`allTags` del universo completo)
- `GET /crm/campaigns`
- `GET /events/mine` (stats por evento sobre los ids de la página)
- `GET /discount-codes`
- `GET /events/:id/guest-lists`
- `GET /academies/:id/videos`

Cuando un filtro de búsqueda (`q`) depende de un join (nombre de
persona vía FK plana), el endpoint SHALL resolver los IDs que matchean
antes de paginar; paginar y filtrar después produce páginas vacías
incorrectas. Cuando el filtro se resuelve en memoria tras el join
(`guest-lists`: q sobre dueño/invitado/etiqueta), el corte de página
SHALL aplicarse sobre el resultado ya filtrado y el `total` refleja
ese universo.

#### Scenario: primera página por defecto

- **GIVEN** 60 alumnos activos
- **WHEN** la UI pide `GET /students` sin params
- **THEN** responde `{items: ≤25, total: 60, page: 1, pageSize: 25}`

#### Scenario: filtro antes de paginar

- **GIVEN** 60 alumnos, 7 con plan "Mensual"
- **WHEN** se pide `GET /students?planId=X&pageSize=25`
- **THEN** `total=7` e `items` trae solo los del plan

#### Scenario: búsqueda por nombre paginada

- **GIVEN** 30 staff y 5 cuyo nombre contiene "maría"
- **WHEN** se pide `GET /staff?q=maría&page=1&pageSize=4`
- **THEN** `total=5` e `items` trae 4 personas maría (no 4 staff
  cualquiera filtrados después)

#### Scenario: eventos del productor paginados

- **GIVEN** un productor con 30 eventos
- **WHEN** pide `GET /events/mine?page=2&pageSize=25`
- **THEN** responde `{items: 5, total: 30, page: 2, pageSize: 25}` y
  cada item trae sus `stats` calculados sobre los ids de la página

#### Scenario: guest-lists con q post-join

- **GIVEN** un evento con 10 listas, 3 que calzan `q=maría`
- **WHEN** se pide `GET /events/:id/guest-lists?q=maría`
- **THEN** `total=3` e `items` contiene las 3 listas que calzan

#### Scenario: videos paginados con máscara locked

- **GIVEN** un alumno sin acceso a videos restringidos
- **WHEN** pide `GET /academies/:id/videos?page=1`
- **THEN** `items` trae la página con la máscara locked aplicada por
  item y `total` del universo filtrado

#### Scenario: picker con pageSize acotado

- **GIVEN** un selector de eventos que necesita el universo
- **WHEN** pide `GET /events/mine?pageSize=100`
- **THEN** recibe hasta 100 eventos más recientes por `startsAt` desc

#### Scenario: pageSize por sobre el tope

- **GIVEN** un picker que pide `pageSize=500`
- **WHEN** el endpoint lo procesa
- **THEN** `pageSize` se capa a su máximo y la respuesta lo refleja

#### Scenario: filtrar resetea la página

- **GIVEN** el productor en página 3 de eventos
- **WHEN** cambia el filtro de estado
- **THEN** la vista vuelve a `page=1` y recarga

### Requirement: Pager compartido en vistas de listado

Las vistas de listado de la consola SHALL renderizar el componente
`Pager` (prev/next + "Página X de Y" + total) y resetear la página a 1
ante cualquier cambio de filtro u orden. Los consumidores que
necesitan el universo completo (pickers, selects de audiencia) SHALL
pedir un `pageSize` acotado explícito o usar un endpoint de detalle;
no recorrer la lista.

#### Scenario: cambiar de página

- **GIVEN** la lista de alumnos con total > pageSize
- **WHEN** el owner presiona "Siguiente"
- **THEN** se pide `page=2` con los mismos filtros y se renderiza la
  segunda página

#### Scenario: filtrar resetea la página

- **GIVEN** el owner en página 3 de alumnos
- **WHEN** cambia el filtro de estado
- **THEN** la vista vuelve a `page=1` y recarga

### Requirement: Flujo crear → detalle → editar en consolas

Las consolas por rol (dueño de academia, productor, admin) DEBEN (SHALL) seguir
el mismo flujo de navegación: el alta de una entidad se inicia desde un
botón de acción en el listado que abre una página dedicada de creación;
cada card o fila del listado es completamente navegable al detalle del
elemento; el detalle expone los datos, la edición y las acciones
relevantes; la edición vive en una página o modo propio detrás de un
CTA "Editar" en el detalle.

#### Scenario: crear desde el listado

- WHEN el usuario con capacidad de escritura ve un listado de consola
- THEN existe un CTA primario "Nuevo/Crear" que navega a una página
  dedicada de creación (no un form inline en el listado)

#### Scenario: card navegable

- WHEN el usuario activa un card o fila del listado (click o Enter)
- THEN la app navega a la página de detalle del elemento completo

#### Scenario: detalle accionable

- WHEN el usuario abre el detalle de un elemento
- THEN ve sus datos, un CTA de edición y las acciones disponibles para
  su rol sobre ese elemento

### Requirement: Acciones destructivas en zona dedicada

Toda acción destructiva o de baja (eliminar, quitar del equipo, baja de
medio de pago) DEBE (SHALL) vivir en la página de detalle del elemento, en una
zona al pie centrada y con color destructivo (rojo), nunca como control
inline del listado ni dentro del action row de acciones comunes.

#### Scenario: eliminar desde el detalle

- WHEN el usuario con permiso abre el detalle y presiona la acción
  destructiva al pie de la página
- THEN se le pide confirmación y la acción se ejecuta con feedback

#### Scenario: listado sin controles destructivos

- WHEN el usuario ve un listado de consola
- THEN ningún card muestra controles destructivos inline; el card
  completo navega al detalle

### Requirement: Estados y accesibilidad de consola

Las páginas de consola DEBEN (SHALL) cumplir el estándar de carga y
accesibilidad: skeleton del layout conocido durante la carga (nunca
`<Spinner>` desnudo de panel), estado vacío con próximo paso cuando
aplica, error con retry, `role="alert"` en errores, `role="status"` en
feedback exitoso, h1 único provisto por el chrome, back link
predecible al padre en subpáginas, y foco visible + touch targets
≥44px en todo control.

#### Scenario: error con retry

- WHEN un fetch de consola falla
- THEN la página muestra el error con `role="alert"` y un botón
  "Reintentar" que relanza la carga

#### Scenario: carga con skeleton

- WHEN una página o sección de consola está cargando datos
- THEN muestra un skeleton que anticipa la estructura, nunca un
  spinner desnudo ni texto "Cargando…"

#### Scenario: h1 único

- WHEN una página de consola renderiza
- THEN existe exactamente un `h1` - el provisto por el chrome del
  appbar; las páginas no declaran `h1` propios (los títulos de sección
  son `h2`/`h3`)

### Requirement: Opciones de filtro sin duplicados por etiqueta

Los selects de filtros de la consola de academia que cosechan opciones
desde filas listadas (academia, serie, plan) SHALL deduplicar sus
opciones por `value` y por etiqueta normalizada (trim + case-fold +
colapso de espacios): dos filas distintas con el mismo nombre visible
renderizan una sola opción.

#### Scenario: academia duplicada en la fuente

- **GIVEN** `/academies/mine` devuelve dos filas con nombre "Mambo
  Madness" e ids distintos
- **WHEN** el selector de academia renderiza
- **THEN** muestra una sola opción "Mambo Madness"

#### Scenario: planes con el mismo nombre

- **GIVEN** dos planes distintos llamados "Ilimitado"
- **WHEN** el filtro Plan renderiza
- **THEN** aparece una sola opción "Ilimitado"

### Requirement: Score en el listado de alumnos

`GET /academies/:id/students` SHALL incluir en cada ítem `score`
(number|null) y `segment` (string|null) leídos de `RelationshipScore`
con `actorType=ACADEMY, actorId=<id de la academia>, personId=<alumno>`.
Alumnos sin score computado SHALL responder `score: null,
segment: null`. El join SHALL resolverse en un solo query por los
personIds de la página (no N+1) y MUST NOT alterar el `total` ni el
orden vigente.

#### Scenario: fila con score

- **GIVEN** un alumno con RelationshipScore `score=72, segment=CORE`
  para la academia
- **WHEN** el owner lista `/academies/:id/students`
- **THEN** su ítem trae `score: 72, segment: "CORE"`

#### Scenario: fila sin score

- **GIVEN** un alumno que nunca fue recomputado
- **WHEN** se lista
- **THEN** su ítem trae `score: null, segment: null`

### Requirement: crear otra academia desde la consola

El owner con rol ACADEMY_OWNER (APPROVED o SANDBOX) SHALL ver un CTA
"Nueva academia" en su consola aunque ya tenga una o más academias;
junto al selector de academia cuando hay varias, solo cuando hay una.
La consola del owner es `/inicio` (AcademyDashboard embebido en
HomeHub): el selector y el CTA SHALL renderizarse ahí. El hub
`/academia`, consola de staff/instructor/ADMIN, SHALL conservar el
mismo selector para quienes tienen membresía en más de una academia.
El CTA navega a una página dedicada `/academia/nueva` (crear = página,
no form inline en el listado). Tras crear, la academia nueva queda
seleccionada (`omnidance:academy-id`) y la navegación vuelve al home.

#### Scenario: owner con una academia crea la segunda

- **WHEN** un owner con una academia abre su home `/inicio`, toca
  "Nueva academia" dentro del selector, completa el nombre y confirma
- **THEN** `POST /academies` crea la fila, la selección persiste la
  nueva y la consola muestra el selector con dos opciones y la nueva
  activa

#### Scenario: owner multi-academia cambia de academia

- **GIVEN** un owner con dos o más academias propias
- **WHEN** abre `/inicio` y elige otra academia en el selector
- **THEN** la selección persiste en `omnidance:academy-id`, el
  dashboard y los módulos de la consola muestran la academia elegida

#### Scenario: staff multi-academia en el hub

- **GIVEN** un staff con membresía en dos academias (ninguna propia)
- **WHEN** abre `/academia`
- **THEN** el selector sigue disponible en el hub y la grilla de
  módulos refleja la academia elegida

#### Scenario: deep-link sin permiso

- **WHEN** una persona sin rol ACADEMY_OWNER entra a `/academia/nueva`
- **THEN** ve el estado "sin acceso" con CTA de salida; el form no se
  monta

#### Scenario: CTA oculto para no-owner

- **WHEN** un instructor o staff (sin ACADEMY_OWNER) entra a la
  consola
- **THEN** no ve el CTA "Nueva academia"

### Requirement: Colas operativas con historial resuelto acotado

Las colas operativas de la consola (`/academia/cobros`,
`/academia/preventas`) SHALL separar trabajo pendiente de historial
resuelto: sin filtro explícito la vista muestra los ítems accionables
y un historial resuelto acotado por preview expandible (`LIST_PREVIEW`
+ "Ver todo"); con filtro de status explícito se comporta como
listado. La cola PENDING también acota su render por preview cuando
excede el umbral visual, expandible en la misma página.

#### Scenario: preventas separa pendientes de resueltos

- **GIVEN** 4 acuerdos INVITED y 30 resueltos
- **WHEN** el owner abre `/academia/preventas` sin filtro
- **THEN** ve los 4 pendientes completos y el historial resuelto
  acotado a 5 con "Ver todo (30)"

#### Scenario: cola de claims con muchos pendientes

- **GIVEN** 60 claims PENDING
- **WHEN** el owner abre `/academia/cobros` sin filtro
- **THEN** ve el preview acotado con "Ver todo (60)" en vez de 60
  cards de corrido

### Requirement: FilterBar en todas las secciones de listado

Toda sección de listado de la consola SHALL exponer el `FilterBar`
compartido con su `EntityDef`/`QueryFilters` cuando el endpoint
soporta búsqueda (`q`) o filtros — sin secciones con solo `Pager`
(instructor-section debe igualar a staff-section).

#### Scenario: búsqueda de instructores

- **WHEN** el owner filtra por nombre en la sección de profesores
- **THEN** el `FilterBar` aplica `q` y el `Pager` refleja el total
  filtrado

### Requirement: Back link contextual con `?from=`

Las páginas de edición y las fichas abiertas desde otra ficha de la
consola SHALL devolver al origen real, no al listado genérico. El
patrón es el ya existente del roster de clase: el link de origen pasa
`?from=<ruta interna>` y el `ConsoleHeader` del destino la usa como
`backHref` tras sanitizarla (`safeInternalPath`). Casos cubiertos:

- `/academia/planes/nueva?edit=<id>` SHALL volver a
  `/academia/planes/<id>` (la ficha del plan), no al listado.
- `/academia/series/nueva?edit=<id>` SHALL volver a
  `/academia/series/<id>` (la ficha de la serie), no al listado.
- Los links de alumno dentro de la ficha del plan SHALL llevar
  `from=/academia/planes/<id>` y la ficha de alumno
  (`/academia/alumnos/[personId]`) SHALL usarlo como back.
- Los links de clase dentro de la ficha del profesor
  (`/academia/equipo/profesor/[id]`) SHALL llevar
  `from=/academia/equipo/profesor/<id>` y el roster
  (`/academia/clases/[id]`) SHALL preferirlo sobre su padre canónico.

Un `from` ausente, vacío o no interno SHALL degradar al padre
canónico de cada página sin error.

#### Scenario: editar plan vuelve a su ficha

- **GIVEN** el owner en `/academia/planes/nueva?edit=abc`
- **WHEN** presiona el back del header
- **THEN** navega a `/academia/planes/abc`

#### Scenario: alumno abierto desde un plan

- **GIVEN** el owner en la ficha del plan `abc`
- **WHEN** toca un alumno de la lista "Alumnos con este plan" y luego
  el back de la ficha de alumno
- **THEN** vuelve a `/academia/planes/abc`

#### Scenario: clase abierta desde la ficha del profesor

- **GIVEN** el owner en `/academia/equipo/profesor/xyz`
- **WHEN** toca una próxima clase y luego el back del roster
- **THEN** vuelve a `/academia/equipo/profesor/xyz`

#### Scenario: `from` inválido

- **WHEN** el owner abre `/academia/alumnos/p1?from=https://evil.test`
- **THEN** el back va al padre canónico `/academia/alumnos`

### Requirement: Copy de consola sin tecnicismos

El copy visible para el owner SHALL usar lenguaje de negocio, no
nombres de campo, flags ni enums crudos. En particular: el hint de la
KPI "Planes activos" SHALL describir que son los planes comprables
ahora (no `active=true`); el hint de las KPI por plan SHALL describir
"alumnos con ese plan vigente"; el pie del card "Niveles y cupos"
SHALL reflejar la regla vigente de un nivel por tipo (sin disclaimers
de doble conteo); los tipos de plan del form SHALL tener labels
claros y una ayuda breve por tipo, y con tipo `SINGLE` el input de
clases SHALL ocultarse enviando `classCount=1` implícito.

#### Scenario: hints de KPI legibles

- **WHEN** el owner abre `/academia/planes`
- **THEN** las leyendas de las KPI cards no contienen `active=true`
  ni describen un ranking: la primera explica "planes comprables" y
  las de plan, "alumnos con ese plan vigente"

#### Scenario: clase única sin input de clases

- **WHEN** el owner crea un plan y elige el tipo "Clase única"
- **THEN** el input de clases no se muestra y el POST envía
  `classCount: 1`

### Requirement: Listado de series ignora respuestas fuera de orden

El fetch del listado `/academia/series` SHALL aplicar solo el
resultado del request más reciente: una respuesta (éxito o error)
que llega después de un request más nuevo SHALL descartarse, para
que una falla tardía no pise datos ya cargados ni un éxito viejo
pise filtros más recientes.

#### Scenario: falla tardía no pisa la lista

- **GIVEN** dos requests del listado en vuelo (doble efecto en dev o
  cambio rápido de filtros)
- **WHEN** el request más nuevo resuelve OK y luego el viejo falla
- **THEN** la lista cargada se conserva sin banner de error

### Requirement: Paginación 20/10 en listas pesadas

Toda lista pesada de las consolas SHALL paginar con 20 ítems por página
en desktop (viewport ≥1024px) y 10 en mobile, resuelto en cliente vía
media query (`useConsolePageSize`). El tamaño de página viaja como
`pageSize` del envelope paginado; al cambiar de página o de tamaño el
listado re-consulta.

#### Scenario: reporte en mobile

- **WHEN** el owner abre `/academia/cobros/reporte` en un viewport
  <1024px con 25 cobros
- **THEN** la lista muestra 10 por página y el `Pager` ofrece 3 páginas

### Requirement: Preview expandible en "planes que vencen"

La lista de inscripciones por vencer SHALL expandir sus ítems ocultos
en el lugar con `SeeAllRow` (preview acotado, "Ver todos" alterna a
"Mostrar menos"), nunca navegando a otro listado. Las filas siguen
llevando a la ficha del alumno.

#### Scenario: expandir vencimientos

- **GIVEN** más ítems por vencer que el preview
- **WHEN** el owner toca "Ver todos"
- **THEN** la misma sección muestra la lista completa sin salir de la
  página

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
misma regla rodante que aplica el backend al cobrar
(`membershipEndsAt`): MONTHLY → inicio + 1 mes; QUARTERLY → inicio + 3
meses; SEMIANNUAL → inicio + 6 meses; PERIOD → inicio + `periodDays`
(si el plan lo define); SINGLE → inicio + 1 día; CLASS_PACK → sin
fecha. La fecha sugerida SHALL quedar editable (override manual) y
recomputarse al cambiar de plan solo si el usuario no la editó a mano.

#### Scenario: plan mensual sugiere fin de mes

- **GIVEN** un plan MONTHLY y el alta abierta el 12 de octubre
- **WHEN** el owner elige el plan
- **THEN** `endsAt` se pre-rellena un mes después (12 de noviembre,
  vigencia rodante) y queda editable

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

### Requirement: Tamaño de página por viewport

Las listas pesadas de la consola SHALL paginar 20 ítems por página en
desktop (viewport ≥ lg = 1024px) y 10 en mobile. La regla aplica por
igual a listados server-side (`pageSize` del query) y a listas
client-side ya descargadas (slice + `Pager` solo cuando exceden el
tamaño): roster de clase (reservados y lista de espera), listado de
clases particulares y próximas clases de la ficha de profesor. El
hook compartido `useConsolePageSize` (lib) SHALL resolver el valor
con `useSyncExternalStore` + `matchMedia`, y un cambio de viewport
SHALL volver a la primera página.

#### Scenario: roster largo en mobile

- **GIVEN** una clase con 24 reservados en un teléfono
- **WHEN** se abre `/academia/clases/[id]`
- **THEN** se ven 10 filas por página con `Pager`, y la numeración de
  la lista de espera conserva el offset de página

#### Scenario: mismo listado en desktop

- **GIVEN** el mismo roster en desktop ≥1024px
- **WHEN** se abre la ficha
- **THEN** caben 20 filas por página

#### Scenario: próximas clases del profesor

- **GIVEN** un profesor con 30 clases próximas
- **WHEN** se abre `/academia/equipo/profesor/[id]`
- **THEN** la lista se pagina 20/10 con `Pager` dentro de la card

### Requirement: Orden de secciones del drawer del owner

El drawer de la lente ACADEMY_OWNER SHALL ordenar sus secciones de
operación antes que el setup: Enseñanza → Alumnos → Administración →
CRM → Analítica → Configuración.

#### Scenario: Analítica después de CRM, Configuración al final

- **WHEN** un Academy Owner abre el drawer en la lente ACADEMY_OWNER
- **THEN** la sección Analítica aparece inmediatamente después de CRM
- **AND** la sección Configuración es la última del drawer

### Requirement: Export del reporte de cobros

`/academia/cobros/reporte` SHALL ofrecer export en CSV y PDF del
dataset filtrado actual, vía `GET /academies/:id/billing-report.csv`
y `.pdf` con los mismos filtros (from/to/planId/status) y `lang`
(es default, en soportado). El filename SHALL ser descriptivo:
`{reporte-cobros|billing-report}-{slug-academia}-{YYYY-MM-DD}.{ext}`.
El PDF SHALL usar la plantilla de marca: banda superior con wordmark,
título con aire bajo la banda, academia + período (en UTC, sin
desfase de día), filtros aplicados, KPIs como cards visuales con la
misma UI del reporte web (Facturado y Alumnos en la fila principal;
los métodos de pago abren fila propia y todos aparecen con wrap de 4)
y la tabla `#`/Fecha/Alumno/Plan/Método/Estado/Monto numerada con
valores localizados. Los métodos SHALL mostrarse normalizados (nunca
crudos como `credit_card`).

#### Scenario: export con filtros aplicados

- **WHEN** el owner filtra por un plan y rango de fechas y descarga
  el PDF
- **THEN** el archivo declara academia, período y filtros en la
  cabecera, KPIs resumidos y solo las filas del subconjunto

#### Scenario: idioma del usuario

- **WHEN** la app corre en `es-CL`
- **THEN** headers, estados, métodos, filename y formatos de
  fecha/moneda del export se generan en español (y `lang=en` produce
  su equivalente en inglés)

#### Scenario: marca heredada en todos los PDF

- **WHEN** se exporta cualquier PDF de la consola (cobros, analítica,
  eventos)
- **THEN** todos comparten la banda de marca, accent violeta y el
  pie con paginación

### Requirement: Registro parcial con invitación en el alta de alumno

`POST /academies/:id/enrollments` SHALL aceptar `email`+`name` como
alternativa a `personId`. Sin personId el email es requerido (400 si
falta). Con email inexistente se SHALL crear un stub de Person y
enviar magic link de invitación (best-effort) para que complete su
cuenta; la respuesta incluye `invited: true`. El resto del flujo
(plan, estado, vigencia, niveles iniciales) es idéntico al alta por
personId.

#### Scenario: alta con persona inexistente

- **GIVEN** un owner en /academia/alumnos/nuevo cuya búsqueda no
  encuentra candidatos
- **WHEN** registra email+nombre y envía el alta
- **THEN** se crea el stub + la inscripción y la persona recibe la
  invitación por mail

#### Scenario: email existente no duplica

- **WHEN** el email ya pertenece a una Person
- **THEN** se reutiliza su registro sin crear stub ni enviar
  invitación (`invited: false`)

### Requirement: Selector de academia en la navegación del owner

La lente ACADEMY_OWNER SHALL montar un selector de academia arriba de
los grupos del drawer móvil y de la sidebar desktop cuando el owner
tiene más de una academia propia (`ownerId === me.id`) o alguna
academia propia cubre la feature `multiAcademy` (misma regla de
negocio que `POST /academies`, con bypass de admin de plataforma).
El selector SHALL listar el mismo universo que el del hub
(`/academies/mine` con dedup por id y por nombre normalizado) y la
opción "Nueva academia" SHALL seguir la misma regla del hub (rol
ACADEMY_OWNER en estado APPROVED o PENDING + `multiAcademy` en alguna
propia, o admin de plataforma). La selección SHALL persistir en
`localStorage["omnidance:academy-id"]` y propagarse sin recarga de
página a `AcademyGate` y a los entitlements de la lente mediante un
evento de selección. Owners con una sola academia propia y sin
`multiAcademy` MUST NOT ver el selector: no aporta ninguna acción.

#### Scenario: owner multi-academia cambia desde la sidebar

- **GIVEN** un owner con dos academias propias en lente ACADEMY_OWNER
- **WHEN** elige la otra academia en el selector de la sidebar
  (desktop) o del drawer (mobile)
- **THEN** la selección persiste en `omnidance:academy-id` y la
  página de consola visible y los ítems gateados por feature reflejan
  la academia elegida sin recarga completa

#### Scenario: owner mono-academia sin multiAcademy no ve el selector

- **GIVEN** un owner con una sola academia propia en un tier sin
  `multiAcademy`
- **WHEN** abre el drawer o ve la sidebar
- **THEN** no se renderiza el selector de academia

#### Scenario: tier multiAcademy muestra el selector con una academia

- **GIVEN** un owner con una sola academia propia cuyo tier cubre
  `multiAcademy`
- **WHEN** abre el drawer o ve la sidebar
- **THEN** el selector aparece con su academia y la opción "Nueva
  academia", que navega a `/academia/nueva`

#### Scenario: membresías ajenas no habilitan el selector

- **GIVEN** un owner con una sola academia propia sin `multiAcademy`
  que además es instructor de otra academia
- **WHEN** abre el drawer o ve la sidebar
- **THEN** no se renderiza el selector: la regla de visibilidad mira
  academias propias, no membresías
