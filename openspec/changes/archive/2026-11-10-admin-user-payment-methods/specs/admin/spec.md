# Delta: admin (métodos de pago de academias en la ficha de usuario)

## ADDED Requirements

### Requirement: métodos de pago de academias en la ficha admin de usuario

La ficha admin de usuario (`/admin/usuarios/[personId]`) SHALL
mostrar, por cada academia que la persona posee (`Academy.ownerId`),
los métodos de pago que tiene implementados: cuentas de pasarela BYO
(`ActorGatewayAccount` scope academyId, con provider, mask de la
llave, status y verificación) y métodos manuales
(`AcademyPaymentMethod`, con label, tipo y activo). El backend SHALL
exponerlos por `GET /admin/users/:personId/payment-methods` bajo el
permiso `admin.access` y SHALL NO devolver `credentialsEnc` ni
material de credenciales: el único dato visible de la llave es
`keyMask`.

#### Scenario: academia con pasarela BYO y métodos manuales

- **WHEN** el admin abre la ficha de una persona dueña de una
  academia con cuenta FLOW activa y una transferencia configurada
- **THEN** la sección "Métodos de pago" muestra la cuenta con su
  provider, mask, badge ACTIVE y webhookUrl, más el método manual
  con su label, tipo y estado activo

#### Scenario: persona sin academias

- **WHEN** el admin abre la ficha de una persona que no posee
  academias
- **THEN** la sección "Métodos de pago" no se renderiza

#### Scenario: credenciales nunca expuestas

- **WHEN** se consulta `GET /admin/users/:personId/payment-methods`
- **THEN** la respuesta incluye `keyMask` y metadatos de la cuenta
  pero nunca `credentialsEnc` ni credenciales en plano
