## Purpose

Permite ejercer el flujo completo de suscripciones en desarrollo sin
credenciales ni red: el gateway stub simula el motor de suscripciones de la
pasarela (planes espejo, customers, registro de tarjeta, cobros recurrentes y
cancelación).

## ADDED Requirements

### Requirement: Gateway stub soporta suscripciones

El gateway de desarrollo SHALL implementar el puerto de suscripciones de forma
determinística y sin salir a la red, de modo que el flujo de suscripción
(registro de tarjeta → alta → reconcile → cancelación) sea ejercitable en
localhost. El servicio de suscripciones SHALL aceptar cualquier gateway que
implemente el puerto, no solo Flow.

#### Scenario: Suscripción sin tarjeta registrada

- **WHEN** un usuario se suscribe a un plan recurrente con el gateway stub y su
  customer aún no tiene tarjeta
- **THEN** el sistema responde `needs_card` con una URL de registro que retorna
  al callback local de customer-return con un token stub válido

#### Scenario: Retorno del registro de tarjeta stub

- **WHEN** el browser llega al callback de customer-return con un token stub
  emitido por el registro
- **THEN** el customer stub queda con tarjeta, la suscripción pasa a `ACTIVE` y
  el primer invoice (ya pagado en la simulación) se liquida como una renovación
  normal

#### Scenario: Suscripción con tarjeta ya registrada

- **WHEN** un usuario con customer stub con tarjeta se suscribe a un plan
  recurrente
- **THEN** la suscripción se crea `ACTIVE` con `nextInvoiceAt` según el
  intervalo del plan y su invoice inicial pagado

#### Scenario: Cancelación en stub

- **WHEN** el dueño cancela su suscripción stub
- **THEN** la remota queda marcada cancel-at-period-end (o cancelada si la
  compensación es inmediata) y la local refleja `CANCEL_PENDING`

#### Scenario: Estado del stub tras reinicio del proceso

- **WHEN** el reconcile consulta una suscripción stub que el proceso ya no
  recuerda (estado en memoria perdido)
- **THEN** el stub la reporta cancelada para que la fila local converja a
  `CANCELED` en vez de quedar viva para siempre

### Requirement: Pagos de membresía atribuidos al gateway real

El sistema SHALL persistir en el `Payment.gateway` de una liquidación de
membresía el nombre del gateway efectivamente en uso, no un valor fijo.

#### Scenario: Settle de renovación con stub

- **WHEN** el reconcile liquida un invoice pagado de una suscripción stub
- **THEN** el `Payment` resultante registra `gateway = "STUB"`
