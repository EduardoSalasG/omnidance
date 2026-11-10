# Proposal: métodos de pago de academias en la ficha admin de usuario

## Why

El owner lo pidió: en el detalle de usuario del admin
(`/admin/usuarios/[personId]`) hay que ver, por cada academia que la
persona posee, qué métodos de pago tiene implementados. Hoy la ficha
muestra actividad por rol, scores, línea de vida y cobro directo,
pero no hay visibilidad de la configuración de cobro de sus
academias: para diagnosticar por qué una academia no vende online el
admin tiene que entrar a la consola de la academia o a la base de
datos.

## What Changes

- API: `GET /admin/users/:personId/payment-methods` (mismo RBAC
  `admin.access` que los endpoints vecinos de user-intel) devuelve
  por academia (`Academy.ownerId = personId`) sus cuentas de pasarela
  BYO (`ActorGatewayAccount` scope academyId: provider, keyMask,
  status, lastError, verifiedAt, webhookUrl) y sus métodos manuales
  (`AcademyPaymentMethod`: label, type, details, active). Nunca
  devuelve `credentialsEnc`.
- Web: nueva sección "Métodos de pago" en la ficha, una card por
  academia con los dos grupos (pasarela y métodos manuales), badges
  de estado y estados de carga y vacío. La sección se oculta si la
  persona no posee academias.
- i18n: keys `admin.users.payMethods.*` en los 4 catálogos (es-CL,
  en, fr, pt-PT) con paridad.

## Out of scope

- Edición de métodos desde la ficha admin (solo lectura; la gestión
  sigue en `/academia/configuracion/metodos-de-pago`).
- Métodos de pago del productor (`ProducerPaymentMethod` y su cuenta
  BYO): el pedido es solo academias.
