# Delta; payments/notifications

## ADDED Requirements

### Requirement: Asunto del resguardo en voz de compra

El asunto del mail de resguardo SHALL ser `Pagaste: <producto>` donde
`<producto>` es la etiqueta del producto liquidado (ej.
`Pagaste: Esencial, Clave Timba` para membresías). El `<title>` del
HTML SHALL usar el mismo prefijo.

#### Scenario: Mail de membresía liquidada

- **WHEN** un Payment MEMBERSHIP transiciona a PAID
- **THEN** el mail sale con asunto `Pagaste: <plan>, <academia>`
