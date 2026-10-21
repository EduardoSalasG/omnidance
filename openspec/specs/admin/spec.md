# admin Specification

## Purpose
TBD - created by archiving change admin-billing-documents. Update Purpose after archive.

## Requirements

### Requirement: emisión idempotente de documento por liquidación

El sistema SHALL emitir un `BillingDocument` por payout con folio
correlativo único asignado atómicamente (sin saltos ni duplicados bajo
concurrencia). Emitir dos veces sobre el mismo payout SHALL devolver
el documento existente, sin crear otro ni consumir folio.

#### Scenario: generar sobre payout nuevo

- **WHEN** el admin genera el documento de un payout con líneas de
  cargo (PLATFORM_FEE_*, OWN_METHOD_FEE_*, GATEWAY_FEE_PASSTHROUGH)
- **THEN** se crea el documento ISSUED con folio correlativo, líneas
  agregadas por tipo, net/IVA/total del payout y snapshot del receptor
  (RUT/razón social de FiscalProfile si existe, si no nombre), queda
  auditado BILLING_ISSUE y el PDF se persiste en storage privado

#### Scenario: doble generación concurrente

- **WHEN** dos requests generan sobre el mismo payout
- **THEN** el segundo obtiene el documento existente (payoutId único),
  ningún folio se consume dos veces

#### Scenario: payout sin cargos

- **WHEN** el payout no tiene líneas de cargo
- **THEN** responde 400 sin emitir documento

### Requirement: anulación auditable

El sistema SHALL marcar VOID un documento (requiere motivo), conservando
el PDF como evidencia y auditando BILLING_VOID. Un VOID no puede
re-emitirse como ISSUED; la emisión posterior sobre el mismo payout
sigue devolviendo el documento existente.

#### Scenario: void con motivo

- **WHEN** el admin anula un documento con motivo no vacío
- **THEN** status=VOID + voidReason + BILLING_VOID auditado; el PDF
  sigue descargable como evidencia

### Requirement: acceso del actor a sus documentos

El sistema SHALL exponer al actor sus propios documentos ISSUED
(`GET /me/billing`) y su PDF (`GET /me/billing/:id/pdf`), sin acceso
a documentos ajenos ni a estados VOID por la vista de actor.

#### Scenario: listado propio

- **WHEN** el productor consulta /me/billing
- **THEN** ve solo sus BillingDocument ISSUED; documentos ajenos y
  VOID quedan fuera

### Requirement: registro declarativo de jobs programados

El sistema SHALL mantener una fila `ScheduledJob` por cada trabajo
programado registrado en código (`JOB_REGISTRY`), con `key` única,
label, descripción, `cronExpr`, `defaultCron`, `timezone`, `enabled`,
`orphaned` y contadores de última corrida. En bootstrap se hace upsert
por key: los jobs nuevos se crean con su default y los existentes solo
actualizan metadatos - el `cronExpr`/`enabled`/`timezone` editados por
el admin NUNCA se sobrescriben. Un job cuyo key desaparece del
registry queda `orphaned` (visible, sin historial borrado, no corre).

#### Scenario: bootstrap registra los jobs del sistema

- **WHEN** la API arranca
- **THEN** existen filas `ScheduledJob` para los jobs registrados en
  código (renewal reminders, subscriptions reconcile, CRM triggers,
  tickets day-of, mail campaign dispatch) con sus defaults de cron

#### Scenario: re-boot no pisa la edición del admin

- **WHEN** el admin editó el `cronExpr` o pausó un job y la API
  reinicia
- **THEN** el upsert conserva `cronExpr`/`enabled`/`timezone` de la DB
  y solo refresca label/descripción/defaultCron

#### Scenario: handler eliminado del código

- **WHEN** un `ScheduledJob.key` ya no está en el registry tras un
  deploy
- **THEN** el job queda `orphaned: true`, no se ejecuta y su
  historial se conserva

### Requirement: ejecución centralizada con historial

El sistema SHALL ejecutar los jobs desde un runner central (tick por
minuto) que dispara todo job `enabled && !orphaned && nextRunAt <=
now`, calculando `nextRunAt` con su `cronExpr` y `timezone`. Cada
corrida persiste un `JobRun` (RUNNING→OK|ERROR, trigger, actorId en
manuales, duración y meta de contadores) y actualiza
lastRunAt/lastStatus/lastError/runCount del job. Un job vencido
mientras el proceso estaba detenido corre una vez al arrancar
(catch-up), no salta corridas.

#### Scenario: job vencido corre y registra resultado

- **WHEN** un job enabled tiene `nextRunAt <= now` al tick
- **THEN** se crea un `JobRun` RUNNING, corre el handler, el run
  termina OK con meta o ERROR con mensaje, y `nextRunAt` se recalcula

#### Scenario: servidor caído a la hora programada

- **WHEN** la API estuvo detenida durante el horario de un job y
  reinicia
- **THEN** el primer tick detecta `nextRunAt` vencido y ejecuta el
  job una vez

#### Scenario: job pausado nunca corre

- **WHEN** un job tiene `enabled: false`
- **THEN** el tick lo ignora aunque su `nextRunAt` esté vencido; al
  reactivarlo se recalcula `nextRunAt` al futuro (sin catch-up de
  corridas perdidas por pausa)

### Requirement: consola admin de jobs

El admin SHALL ver todos los jobs con su horario, próxima corrida y
último resultado, y MUST poder editar `cronExpr`/`timezone`, pausar/
reactivar, disparar una corrida manual y ver el historial de corridas
- todo bajo `admin.access` y auditado en `AuditLog`.

#### Scenario: editar el horario de un job

- **WHEN** `PATCH /admin/jobs/:key` con un `cronExpr` válido
- **THEN** el job guarda la expr y `nextRunAt` recalculado; una expr
  inválida responde 400 sin tocar el job

#### Scenario: corrida manual

- **WHEN** `POST /admin/jobs/:key/run` sin corrida activa
- **THEN** se crea un `JobRun` MANUAL con actorId del admin y el
  handler corre en background; si ya hay un run RUNNING responde 409

#### Scenario: historial visible

- **WHEN** `GET /admin/jobs/:key/runs`
- **THEN** devuelve las corridas recientes con status, trigger,
  duración, error y meta

### Requirement: claim atómico de corrida multi-instancia

La toma de un job para ejecutarlo MUST ser atómica a nivel DB —
`updateMany` condicional sobre `runningRunId IS NULL` — de modo que
con N instancias de API a lo sumo una ejecuta la corrida. La instancia
que pierde la carrera descarta el `JobRun` creado: en trigger CRON el
skip es silencioso; en MANUAL responde 409 "ya tiene una corrida
activa".

#### Scenario: dos instancias disputan el mismo job

- **WHEN** dos procesos ejecutan `tick` y el mismo job está vencido
- **THEN** solo el claim que gana el `updateMany` ejecuta el handler;
  el otro descarta el run creado y sigue con el siguiente job

#### Scenario: corrida manual sobre job tomado

- **WHEN** se invoca `runNow` para un job que otra instancia acaba de
  tomar
- **THEN** responde 409 y no queda un JobRun RUNNING huérfano

### Requirement: Scores por actor en la ficha de usuario admin

El detalle de usuario del admin SHALL incluir la lista de
`RelationshipScore` de la persona: por cada fila `{actorType, actorId,
score, segment, computedAt, breakdown}` ordenada por score descendente,
con el nombre del actor resuelto (academia/venue por su tabla; producer
por `Person.name`). La UI `/admin/usuarios/[personId]` SHALL mostrar una
sección "Scores por actor" con score, segmento y desglose por fila; si
la persona no tiene scores la sección MUST NOT renderizarse.

#### Scenario: alumno de dos academias

- **GIVEN** una persona con RelationshipScore en academias A y B
- **WHEN** el admin abre su ficha
- **THEN** ve ambas filas con nombre de academia, score, segmento y
  desglose

#### Scenario: sin scores

- **WHEN** el admin abre la ficha de una persona sin scores
- **THEN** la sección "Scores por actor" no se renderiza

### Requirement: Salud de alumnos por academia en /admin

El sistema SHALL exponer `GET /admin/academies/score-health`: por cada
academia con al menos un `RelationshipScore` computado, `{academyId,
academyName, students, avgScore, segments: {CORE, AT_RISK, NEW,
BRINGS_PEOPLE, NONE}, top: [{personId, name, score}] (máx 3), atRisk:
[{personId, name, score}] (máx 5)}`, ordenado por `avgScore`
descendente.

La UI SHALL tener la página `/admin/academias` listando esa salud por
academia (card/fila clickeable que expanda o enlace a la tabla de
alumnos con scores de esa academia) accesible desde el hub /admin.

#### Scenario: dos academias con scores

- **GIVEN** academia A (avg 70, 2 CORE) y B (avg 40, 3 AT_RISK)
- **WHEN** el admin abre `/admin/academias`
- **THEN** ve A primero con su distribución y en B el bloque "en riesgo"
  con hasta 5 personas

### Requirement: buscador de personas paginado en /admin

`GET /admin/users` SHALL aceptar `q` (texto libre sobre nombre, email o
teléfono), `role` (key del catálogo RBAC), `page` y `pageSize`, y
responder el envelope `{items,total,page,pageSize}` — nunca un array
plano ni la tabla completa. `page` normaliza a ≥1 (default 1) y
`pageSize` a default 25 capado en 100; valores no numéricos caen al
default sin error.

Sin `q` de ≥2 caracteres ni `role` válido, el endpoint SHALL responder
un envelope vacío (`items: []`, `total: 0`) — nunca un listado masivo.

#### Scenario: página de resultados por rol

- **WHEN** el admin pide `role=DANCER&page=2&pageSize=25`
- **THEN** recibe `{items[≤25], total, page: 2, pageSize: 25}` con los
  titulares del rol ordenados por `createdAt` desc y `total` = conteo
  completo del filtro

#### Scenario: sin término ni rol

- **WHEN** el admin pide `GET /admin/users` sin `q` ni `role` (o `q` de
  1 carácter)
- **THEN** recibe `{items: [], total: 0, page, pageSize}` sin consultar
  la tabla

#### Scenario: rol inexistente

- **WHEN** el admin pide `role=FOO_BAR` que no existe en el catálogo
- **THEN** recibe 400 (misma validación actual)

#### Scenario: q y rol combinados

- **WHEN** el admin pide `q=ana&role=INSTRUCTOR`
- **THEN** los items cumplen ambos criterios (texto ∧ titular del rol) y
  `total` refleja la intersección

### Requirement: UI /admin/usuarios con paginación y filtro por rol

La página SHALL mantener el estado vacío inicial (sin fetch hasta tener
`q`≥2 o un rol), mostrar el total de resultados y permitir navegar
páginas con el `Pager` compartido. Cambiar `q` o el filtro de rol SHALL
volver a página 1. El select de rol SHALL poblar sus opciones desde el
catálogo RBAC vivo (`GET /admin/roles`), no de una lista hardcodeada.

#### Scenario: explorar un rol completo

- **WHEN** el admin selecciona el rol PRODUCER sin escribir texto
- **THEN** la lista muestra la primera página de productores, el total
  del filtro y el `Pager` habilita navegar al resto

#### Scenario: cambio de filtro resetea página

- **WHEN** el admin está en la página 3 y cambia el rol o el texto
- **THEN** la consulta vuelve a `page=1`

#### Scenario: entrada sin resultados masivos

- **WHEN** el admin entra a `/admin/usuarios`
- **THEN** no se dispara fetch de usuarios hasta que exista `q`≥2 o un
  rol seleccionado

### Requirement: listas de actividad por rol con expand tras 5

En la ficha `/admin/usuarios/[personId]`, cada lista dentro de las
cards de "Actividad por rol" SHALL mostrar máximo 5 filas por defecto;
cuando la lista supera las 5, un toggle centrado SHALL permitir ver
todas ("Ver las {count}") y volver a colapsar ("Ver menos") — mismo
patrón que las fichas de `/admin/academias/[id]`.

#### Scenario: lista larga colapsada

- **WHEN** un productor tiene 14 eventos pasados
- **THEN** la lista "Eventos pasados" muestra 5 filas y el toggle
  "Ver las 14"

#### Scenario: expansión y colapso

- **WHEN** el admin toca "Ver las 14" y luego "Ver menos"
- **THEN** la lista muestra todas las filas y vuelve a 5
  respectivamente

#### Scenario: lista corta sin toggle

- **WHEN** la lista tiene ≤5 filas
- **THEN** no se renderiza toggle

### Requirement: contadores de actor en el listado de usuarios

Cada item de `GET /admin/users` SHALL incluir `academiesCount`
(cantidad de `Academy` con `ownerId` = la persona) y `eventsCount`
(cantidad de `Event` con `producerId` = la persona). El card del
listado SHALL mostrar "N academia(s)" y/o "N evento(s)" únicamente
cuando el contador es mayor a cero.

#### Scenario: owner multi-academia

- **WHEN** un usuario es dueño de 3 academias
- **THEN** su card muestra "3 academias"

#### Scenario: bailarín sin producción

- **WHEN** un usuario tiene 0 academias y 0 eventos creados
- **THEN** su card no muestra línea de contadores

#### Scenario: sin N+1

- **WHEN** la página trae 25 personas
- **THEN** los contadores se resuelven con agregaciones sobre los ids
  de la página (no una query por persona)

### Requirement: mantenedor de catálogos legible en móvil

Las secciones de `/admin/catalogos` SHALL listar sus valores como filas
de lectura (nombre truncable a la izquierda; metadatos y acciones
agrupados en la zona derecha) — no cards de contenido variable. El alta
de un valor SHALL hacerse en una página dedicada
`/admin/catalogos/nuevo?cat=<catalogo>` alcanzada por un CTA por
sección — nunca un form inline en el listado.

#### Scenario: fila legible en 320px

- **WHEN** el admin ve "Niveles de clase" en un teléfono de 320px
- **THEN** cada fila muestra el nombre (truncado si hace falta), su
  orden y los botones Editar/Eliminar sin desbordar

#### Scenario: alta por sección

- **WHEN** el admin toca "＋ Nuevo" en "Estilos de baile"
- **THEN** llega a `/admin/catalogos/nuevo?cat=styles`, ve el campo
  género, crea el valor y vuelve al listado que lo muestra

#### Scenario: cat inválido o ausente

- **WHEN** el admin abre `/admin/catalogos/nuevo` sin `cat` o con un
  valor desconocido
- **THEN** el form corresponde a la primera sección (estilos)

### Requirement: edición de catálogo en página dedicada

La acción "Editar" de una fila de `/admin/catalogos` SHALL navegar a
`/admin/catalogos/[cat]/[id]/editar` — página con `ConsoleHeader` de
vuelta al listado, form prellenado (nombre + campo extra del catálogo),
PATCH al endpoint y regreso a `/admin/catalogos`. El listado SHALL NOT
renderizar forms de edición inline. `cat` desconocido cae a `styles`;
`id` inexistente muestra estado no-encontrado.

#### Scenario: editar un nivel

- **WHEN** el admin toca "Editar" en el nivel "Intermedio"
- **THEN** llega a `/admin/catalogos/levels/<id>/editar` con nombre y
  orden prellenados, guarda y vuelve al listado actualizado

#### Scenario: id inexistente

- **WHEN** el admin abre `/admin/catalogos/styles/no-existe/editar`
- **THEN** ve el estado "Valor no encontrado"

### Requirement: cola de validación de perfiles

`/admin/perfiles-por-validar` SHALL listar PersonRole PENDING de
ACADEMY_OWNER/PRODUCER con el checklist de perfil (nombre, email
verificado, teléfono, datos del actor completados). Aprobar SHALL
exigir el checklist completo (409 si falta algo) y pasar el rol a
APPROVED; rechazar SHALL retirar el rol.

#### Scenario: aprobar perfil completo

- **WHEN** admin abre la cola y un owner tiene todos los datos
- **THEN** el botón Aprobar está habilitado; al aprobar el rol pasa a
  APPROVED y su academia/eventos quedan visibles

#### Scenario: perfil incompleto no aprueba

- **WHEN** un productor PENDING no tiene teléfono ni datos de actor
- **THEN** Aprobar está deshabilitado con el checklist marcando lo
  faltante; forzar el endpoint responde 409

### Requirement: cola de academias con checklist preprocesado

`GET /admin/academy-review-queue` SHALL devolver academias
PENDING/REJECTED con el checklist ya evaluado por el servidor
(`academyChecks`), el owner y su estado de rol. `/admin/perfiles-por-validar`
SHALL ganar una segunda sección "Academias" que lista esa cola con los
checks como badges — sin trabajo manual: la mayoría se auto-aprueba al
completar datos.

`POST /admin/academy-review-queue/:academyId/approve` SHALL forzar
`reviewStatus = APPROVED` aunque el checklist esté incompleto
(override explícito, auditable). `POST .../reject` SHALL ponerla en
REJECTED (oculta aunque completa).

#### Scenario: admin ve faltantes sin evaluar a mano

- **WHEN** el admin abre `/admin/perfiles-por-validar`
- **THEN** la sección Academias muestra cada PENDING con los checks
  en rojo/verde ya evaluados — no hay que abrir la ficha para saber
  qué falta

#### Scenario: override de aprobación

- **GIVEN** una academia PENDING con checklist incompleto
- **WHEN** el admin aprueba igualmente
- **THEN** queda APPROVED y aparece en público; audit log registra
  ACADEMY_APPROVE con el id

#### Scenario: rechazo oculta aun completa

- **GIVEN** una academia con checklist completo (auto-visible)
- **WHEN** el admin la rechaza
- **THEN** queda REJECTED y desaparece de público hasta re-aprobación

### Requirement: Baja lógica de usuario

`DELETE /admin/users/:personId` SHALL marcar la cuenta como desactivada
(`Person.deletedAt`) sin eliminar filas — el grafo de datos (academias,
eventos, tickets, roles, historial) queda intacto. Una cuenta
desactivada MUST NO poder autenticarse por ningún mecanismo (sesión,
password, magic link, OTP) y MUST NO aparecer en superficies públicas
de personas (búsqueda, perfil público, amigos, listas, pases,
prácticas). Su email SHALL seguir ocupado (re-registro → 409).
`POST /admin/users/:personId/reactivate` SHALL restaurarla (deletedAt
null) con sus datos intactos. Ambas acciones MUST quedar en AuditLog
(`USER_DELETE` / `USER_REACTIVATE`). Auto-eliminación SHALL seguir
rechazada con 400.

#### Scenario: Desactivar conserva el grafo

- WHEN un admin desactiva un usuario con roles, academia y estilos
- THEN la fila `Person` persiste con `deletedAt` set y todas las
  filas relacionadas siguen existiendo

#### Scenario: Auth bloqueada

- WHEN la cuenta desactivada intenta login por password, magic link,
  OTP o usa una sesión previa
- THEN todas las rutas rechazan (401 genérico de credenciales para
  login, 401 para sesión, 401 para verify)

#### Scenario: Email ocupado tras desactivación

- WHEN alguien registra con el email de una cuenta desactivada
- THEN recibe 409 emailTaken — el email no se libera

#### Scenario: Reactivación restaura el acceso

- WHEN un admin llama `POST /admin/users/:personId/reactivate` sobre
  una cuenta desactivada
- THEN `deletedAt` queda null y el usuario puede autenticarse de
  nuevo con sus datos intactos

### Requirement: Modelo de flags de funcionalidad

El sistema SHALL persistir `FeatureFlag {key, label, description?,
enabled, updatedById?, updatedAt}` como catálogo global de
funcionalidades activables, seedado desde código con defaults por
flag (un flag nuevo nace con el default que declare su seed —
`social_pass` nace `enabled:false`). `FeatureFlagsService.isEnabled`
SHALL responder desde una cache corta (≤60s) e invalidarse al
escritura.

#### Scenario: Flag nuevo en seed

- **WHEN** el seed registra `social_pass` con default `false`
- **THEN** existe el flag apagado y re-correr el seed no reactiva un
  flag que el admin encendió (upsert por key preserva `enabled`)

#### Scenario: Lectura caliente tras toggle

- **WHEN** un admin apaga un flag y otra request consulta
  `isEnabled` en el mismo proceso
- **THEN** responde el valor nuevo sin esperar expiración de cache

### Requirement: API de administración y gating

`GET /admin/feature-flags` (`admin.access`) SHALL devolver el
catálogo con label, descripción, estado y última modificación.
`PATCH /admin/feature-flags/:key {enabled}` SHALL flippear el flag,
persistir `updatedById` y auditar `FEATURE_FLAG_TOGGLE` — flag
inexistente → 404. `GET /features` SHALL ser público y devolver el
mapa `{key: enabled}` de todos los flags (los flags son metadatos de
producto, no secretos), cacheado a nivel HTTP.

#### Scenario: Toggle auditable

- **WHEN** un admin enciende `social_pass`
- **THEN** el flag queda `enabled:true`, `updatedById` = su personId
  y existe AuditLog `FEATURE_FLAG_TOGGLE` con `{flag, enabled}`

#### Scenario: Front oculta superficie apagada

- **WHEN** el front obtiene `GET /features` con
  `{social_pass:false, trip_planner:true, ...}`
- **THEN** las superficies gated por `social_pass` no se renderizan
  ni enlazan, y las de `trip_planner` sí

### Requirement: Sección de admin dedicada

`/admin/funcionalidades` (`admin.access`) SHALL listar los flags en
cards con toggle por estado, descripción y última modificación;
el toggle aplica sin confirmación (operación reversible) con
feedback inline/spinner y SHALL manejar errores sin dejar el toggle
en estado inconsistente.

#### Scenario: Error al flippear

- **WHEN** el PATCH falla (red o 403)
- **THEN** el toggle vuelve a su estado previo y se muestra el error
  — nunca queda "encendido" visualmente contra el estado real

### Requirement: Guía editorial por ciudad

El sistema SHALL persistir `CityGuide {cityId @unique, intro,
nightlife, practical, updatedById, updatedAt}` — una guía por ciudad
con tres secciones de texto. `GET /admin/city-guides` SHALL listar las
ciudades con su estado de guía (vacía/borrador/completa: completa =
las 3 secciones con texto); `GET /admin/city-guides/:cityId` devuelve
el contenido; `PUT /admin/city-guides/:cityId {intro?, nightlife?,
practical?}` (`admin.access`) SHALL upsertear, persistir `updatedById`
y auditar `CITY_GUIDE_UPDATE`. Ciudad inexistente → 404.

#### Scenario: Publicar guía

- **WHEN** un admin guarda intro+nightlife+practical para Santiago
- **THEN** la guía queda "completa", `updatedById` = su personId y
  `GET /cities/:slug` pública incluye `guide` + `hasGuide:true`

### Requirement: Render público en landing

`GET /cities/:slug` SHALL incluir `guide:{intro,nightlife,practical}`
y `hasGuide:true` cuando la ciudad tiene guía con al menos una
sección con texto, respetando el flag `city_guides` (apagado → la
guía no viaja ni se enlaza). `hasGuide` SHALL ser `false` sin guía
o con todas las secciones vacías.

#### Scenario: Guía parcial

- **WHEN** una ciudad tiene solo `intro` escrito
- **THEN** `hasGuide:true` y la landing muestra solo la sección con
  contenido — nunca secciones vacías al visitante

### Requirement: Editor admin

`/admin/ciudades` (`admin.access`) SHALL listar ciudades con estado
de guía y llevar a una ficha con editor por sección (textarea +
contador), guardado explícito con feedback y protección contra
salida con cambios sin guardar.

#### Scenario: Guardado exitoso

- **WHEN** el admin edita una sección y guarda
- **THEN** el PUT persiste, el estado de la ciudad actualiza y se
  muestra confirmación inline
