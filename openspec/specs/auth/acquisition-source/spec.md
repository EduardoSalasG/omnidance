# auth/acquisition-source Specification

## Purpose
TBD - created by archiving change organic-acquisition-source. Update Purpose after archive.

## Requirements

### Requirement: fuente de adquisición en altas orgánicas

Toda creación de `Person` por registro directo (`POST /auth/register`,
`GET /auth/verify`, `POST /auth/otp/verify` con persona nueva) SHALL
persistir la fuente de adquisición declarada por el cliente en
`acquisitionSource` (canal normalizado) y `acquisitionDetail`
(capture crudo). El cliente SHALL poder declarar `acquisition` con
`utmSource|utmMedium|utmCampaign|utmContent|utmTerm|referrer|
landingPath` (todo opcional) en el body del register y del
magic-link; en magic-link el dato viaja como claim del token y en la
fila del OTP igual que `role`/`consent`/`next`. La normalización la
hace el servidor: `utm:<utmSource>` si hay utm_source, si no
`ref:<host del referrer externo>`, si no `landing:<landingPath>`,
si no `direct`. Una cuenta existente MUST NOT pisar la fuente ya
registrada.

#### Scenario: alta orgánica con utm

- **WHEN** un visitante llega a `/para-academias?utm_source=instagram`,
  se registra con password y declara `acquisition` en el body
- **THEN** su `Person.acquisitionSource` = `utm:instagram` y
  `acquisitionDetail` conserva la captura cruda

#### Scenario: alta por magic link con referrer externo

- **WHEN** una persona pide magic link desde una landing a la que
  llegó por un link externo y verifica creando cuenta nueva
- **THEN** `acquisitionSource` = `ref:<host>` y el dato viajó en el
  claim del token / fila del OTP sin que el cliente lo redeclare

#### Scenario: alta sin contexto capturable

- **WHEN** el registro declara `acquisition` vacío o sin campos
  útiles
- **THEN** `acquisitionSource` = `direct`; y cuando el campo no llega
  en absoluto (cliente viejo, token de invite) queda null sin fallar
  el alta

#### Scenario: cuenta existente no pisa la fuente

- **WHEN** una Person ya creada verifica otro magic link o se
  re-registra
- **THEN** `acquisitionSource`/`acquisitionDetail` conservan los
  valores del alta original

#### Scenario: línea de vida registra el canal

- **WHEN** `person.registered` se emite con fuente capturada
- **THEN** `data.acquisitionSource` lleva el canal normalizado junto
  a `data.via` existente
