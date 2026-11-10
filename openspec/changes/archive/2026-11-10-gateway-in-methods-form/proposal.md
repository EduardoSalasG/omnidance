# Proposal: alta de pasarela dentro del flujo de métodos de pago

## Resumen

Hoy `/academia/configuracion/metodos-de-pago` (y su espejo de
productor `/productor/medios-pago`) muestran DOS superficies: el
admin de métodos manuales (`PaymentMethodsAdmin`, CTA "+ Agregar
método" → `/nuevo`, cards clickeables → ficha `[methodId]`) y la
sección aparte de pasarela BYO (`AcademyGatewaySection`:
select provider + apiKey + secret condicional). El owner pide
**unificar**: la pasarela se agrega DENTRO del mismo flujo de
métodos de pago, desde el botón "Agregar método".

## Alcance

- La página `/nuevo` (o el flujo de alta equivalente) ofrece elegir
  el tipo: **método manual** (transferencia/efectivo/etc, lo
  existente) o **pasarela** (FLOW/MERCADOPAGO/FINTOC con sus campos
  de credencial actuales: apiKey + secret solo para FLOW/FINTOC,
  accessToken único para MP).
- La cuenta de pasarela configurada aparece **en la misma lista de
  métodos** como card (badge de tipo pasarela, mask de la key,
  webhookUrl visible para pegar en el panel del provider) y su
  edición/disable sigue el patrón de ficha de consola.
- Se elimina la sección separada `AcademyGatewaySection` de la
  página (su lógica de form se mueve al flujo /nuevo + ficha).
- Espejo en `/productor/medios-pago` (misma unificación con
  `ProducerGatewaySection`).
- Sin cambios de API ni de schema: `GET|PUT|DELETE
  /academies/:id/gateway-account` y el de productor ya existen; la
  lista de métodos puede componer la card de pasarela desde
  `GET .../gateway-account` (view mask) o listarla junto a los
  métodos manuales en el mismo payload - decisión del
  implementador, preferir lo mínimo.

## Fuera de alcance

- Cambios en `gateway-accounts.service`, DTOs ni endpoints.
- STUB en el select (es dev-only; la UI ya lo omite hoy si aplica).
