# crm/contact-console — delta crm-campaign-ops

## ADDED Requirements

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
