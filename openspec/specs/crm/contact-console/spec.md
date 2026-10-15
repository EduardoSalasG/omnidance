# crm/contact-console Specification

## Purpose
TBD - created by archiving change crm-console-v1. Update Purpose after archive.

## Requirements

### Requirement: Ficha de contacto CRM

`GET /crm/people/:personId` SHALL responder el perfil del contacto dentro
del universo del actor (`actorType`+`actorId` por query, validado por el
mismo `assertActorAccess`): person brief, score, segmento, computedAt,
tags del actor, resumen de actividad (attendance, spend, referrals,
firstAt, lastAt) y las últimas acciones recientes (PRODUCER: checkins y
pagos PAID en sus eventos con nombre de evento; ACADEMY: enrollments con
nombre de plan y attendances con nombre de serie). Una persona fuera del
universo del actor responde 404.

#### Scenario: contacto del productor

- **WHEN** el productor pide la ficha de una persona con checkins en sus
  eventos
- **THEN** recibe score/segmento/tags, el resumen de actividad y la lista
  de acciones recientes con nombre del evento y fecha

#### Scenario: contacto ajeno

- **WHEN** el actor pide la ficha de una persona sin score, tag ni
  actividad en su universo
- **THEN** responde 404

### Requirement: Ordenación del listado de personas

`GET /crm/people` SHALL aceptar `sort` ∈ `score_desc` (default),
`score_asc` y `name_asc` aplicado sobre el universo filtrado antes de
paginar.

#### Scenario: ordenar por nombre

- **WHEN** el owner lista con `sort=name_asc`
- **THEN** la página responde ordenada alfabéticamente por nombre de
  persona (personas sin nombre al final)

### Requirement: Detalle de campaña

`GET /crm/campaigns/:id` SHALL responder la campaña si el caller pasa
`assertActorAccess` sobre su actor dueño; en caso contrario 403/404
según el guard.

#### Scenario: campaña propia

- **WHEN** el actor pide su campaña
- **THEN** recibe nombre, estado, segmento, acción, resultado y createdAt

### Requirement: Consola CRM alineada al patrón

La UI del CRM SHALL seguir el patrón de consola: crear campaña/trigger
como páginas dedicadas, cards de personas y campañas clickeables hacia
su ficha, envío de campaña en la ficha con diálogo de confirmación
focus-trapped (no `window.confirm`), edición de tags en la ficha del
contacto, un solo `h1` por página y componentes de icono en vez de
caracteres unicode.

#### Scenario: navegación contacto

- **WHEN** el actor toca un card de persona en `/crm`
- **THEN** navega a `/crm/personas/[personId]` con su ficha y edición de
  tags

#### Scenario: envío de campaña

- **WHEN** el actor abre la ficha de una campaña DRAFT
- **THEN** el botón Enviar abre un diálogo de confirmación accesible y
  tras enviar muestra el resultado

### Requirement: Breakdown del score en la ficha del contacto

`GET /crm/people/:personId` SHALL incluir `breakdown` (el Json de
`RelationshipScore.breakdown`, null si no existe). La UI de la ficha del
contacto SHALL mostrar el desglose de componentes cuando
`breakdown != null` y solo número + segmento cuando es null.

#### Scenario: contacto recomputado con fórmula nueva

- **GIVEN** un contacto con `breakdown` poblado
- **WHEN** el actor abre su ficha en `/crm/personas/[id]`
- **THEN** ve el desglose por componente bajo el score

### Requirement: Filtro por segmento guardado

El listado `/crm/personas` SHALL soportar filtrado por segmento
guardado además de segmento computado, tag y texto: el parámetro
`segmentId` restringe a miembros de `ActorSegmentMembership`. El
selector del UI SHALL ofrecer los segmentos guardados del actor junto
a los computados.

#### Scenario: filtro por segmento guardado

- **GIVEN** un segmento guardado "VIP" con 5 miembros
- **WHEN** el actor filtra el listado por "VIP"
- **THEN** solo ve esas 5 personas

### Requirement: Canal WhatsApp por campaña

`GET /crm/campaigns/:id/whatsapp?text=` SHALL devolver
`{items:[{personId,name,phone,url}], total, withoutPhone}` para la
audiencia de la campaña: `result.audienceIds` si está SENT, o la
audiencia resuelta por `resolveSegment` si está DRAFT/SCHEDULED.
`url` SHALL ser `https://wa.me/<digits>?text=<encoded>` con el texto
provisto; personas sin `phone` quedan en `withoutPhone`. La ficha de
campaña SHALL ofrecer componer el texto y abrir cada chat.

#### Scenario: exportar chats

- **GIVEN** una campaña SENT a 5 personas, 3 con teléfono
- **WHEN** el actor pide los links con texto "Hola"
- **THEN** obtiene 3 items con url wa.me codificada y withoutPhone=2

### Requirement: Digest semanal al owner

El job `crm.digest` (default lunes 09:00 America/Santiago) SHALL
enviar al owner de cada actor CRM con universo (`RelationshipScore`)
una notificación con el total de personas y los conteos por segmento
(`NEW`, `AT_RISK`, `BRINGS_PEOPLE`, `CORE`). No notifica a las
personas ni a actores sin filas.

#### Scenario: resumen del lunes

- **GIVEN** una academia con 40 personas: 10 CORE, 5 AT_RISK, 3 NEW,
  1 BRINGS_PEOPLE y 21 sin segmento
- **WHEN** corre `crm.digest`
- **THEN** el owner recibe una notificación con esos conteos

#### Scenario: actor sin universo

- **GIVEN** un productor sin RelationshipScore
- **WHEN** corre `crm.digest`
- **THEN** no se genera notificación para ese actor

### Requirement: Acciones masivas sobre personas

`/crm/personas` SHALL permitir seleccionar múltiples filas y aplicar
acciones en lote: agregar o quitar un tag a la selección (`POST
/crm/people/tags/bulk {personIds, tag, op:"add"|"remove"}`, idempotente)
y crear campaña con `personIds` = selección. El listado conserva la
navegación a ficha por fila (checkbox no rompe el card clickeable).

#### Scenario: etiquetar selección

- **GIVEN** 3 filas seleccionadas
- **WHEN** el actor aplica el tag "VIP" en lote
- **THEN** las 3 personas quedan taggeadas y re-aplicar no duplica

#### Scenario: campaña a seleccionados

- **WHEN** el actor elige "nueva campaña" con la selección activa
- **THEN** el formulario de campaña llega con `personIds` = los
  seleccionados en su audiencia

### Requirement: Campaña programada

`createCampaign` SHALL aceptar `scheduledAt` futuro → status
`SCHEDULED`. El job `crm.campaigns` (default cada 5 minutos,
America/Santiago) SHALL enviar las campañas SCHEDULED vencidas.
`POST /crm/campaigns/:id/cancel` SHALL revertir SCHEDULED→DRAFT
(limpiando scheduledAt). `sendCampaign` manual SHALL aceptar DRAFT y
SCHEDULED.

#### Scenario: envío programado

- **GIVEN** una campaña SCHEDULED con scheduledAt en el pasado
- **WHEN** corre el job `crm.campaigns`
- **THEN** la campaña se envía y queda SENT con su result

### Requirement: Atribución de campaña

`GET /crm/campaigns/:id` SHALL incluir `metrics`: `sent` (del result),
`redemptions` (payments PAID con `discountCodeId` del código de la
campaña desde el envío) y `engaged` (personas de la audiencia enviada
con checkin/attendance en el universo del actor posterior al envío).
La audiencia materializada SHALL persistirse en `result.audienceIds`
al enviar.

#### Scenario: métricas tras enviar

- **GIVEN** una campaña DISCOUNT_CODE enviada a 10 personas
- **WHEN** 3 canjean el código y 2 vuelven a asistir
- **THEN** metrics muestra sent=10, redemptions=3, engaged=2

### Requirement: Keys de trigger restringidas por actor

`createTrigger` SHALL rechazar con BAD_REQUEST las keys cuya semántica
no aplica al `actorType`: `TRIAL_EXPIRING` solo ACADEMY,
`REGULAR_NO_PRESALE` solo PRODUCER. El formulario de triggers SHALL
ofrecer solo las keys aplicables al actor seleccionado y las keys
restringidas SHALL indicar su alcance en su etiqueta/descripción.

#### Scenario: key de academia en productor

- **WHEN** un productor intenta crear `TRIAL_EXPIRING`
- **THEN** el API responde 400 y el select no la ofrece

#### Scenario: key de productor en academia

- **WHEN** una academia intenta crear `REGULAR_NO_PRESALE`
- **THEN** el API responde 400 y el select no la ofrece
