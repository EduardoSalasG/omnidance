# crm/contact-console — delta crm-channels-digest

## ADDED Requirements

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
