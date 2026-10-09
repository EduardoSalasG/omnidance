# crm/contact-console delta

## ADDED Requirements

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
