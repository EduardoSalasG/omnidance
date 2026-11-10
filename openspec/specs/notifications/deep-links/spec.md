# notifications/deep-links Specification

## Purpose
Las superficies in-app que muestran una notificación (toast en tiempo
real y centro de notificaciones) resuelven el mismo destino por tipo
desde una única fuente, para que el tap lleve al contexto correcto.

## Requirements

### Requirement: Deep link compartido por tipo

El mapa tipo → destino SHALL vivir en una única fuente consumida por
el centro `/notificaciones` y por el toast en tiempo real. El tap del
toast SHALL navegar al mismo deep link que la card del centro para el
mismo tipo; cuando el tipo no tiene destino resuelto, el tap cae a
`/notificaciones` (comportamiento vigente). La X del toast SHALL
seguir descartando sin navegar. Los efectos de tap propios del tipo
(p.ej. consumo + lente de `academy.invite`) SHALL correr igual desde
ambas superficies.

#### Scenario: toast con deep link

- **GIVEN** una notificación entrante cuyo tipo tiene destino
  (p.ej. `ticket.claimed` con `eventId`)
- **WHEN** la persona toca el cuerpo del toast
- **THEN** el toast se descarta y navega al deep link del tipo (no a
  `/notificaciones`)

#### Scenario: toast sin deep link

- **WHEN** la persona toca un toast cuyo tipo no resuelve destino
- **THEN** navega a `/notificaciones` como antes

#### Scenario: misma fuente que el centro

- **WHEN** se compara el destino de un tipo en el toast y en la card
  del centro
- **THEN** ambos resuelven el mismo path (una sola tabla compartida)
