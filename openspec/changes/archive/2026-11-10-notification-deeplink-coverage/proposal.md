# Proposal: notification-deeplink-coverage

## Why

Auditoría del mapa tipo→destino (`notification-nav`, ~14 tipos
cubiertos de ~77 emitidos) reveló tres clases de problemas:

- **Destinos equivocados**: `payment.paid` es polimórfico (ticket /
  clase suelta / clase particular / cobro de plataforma) y las tres
  variantes no-ticket navegan a `/eventos?view=mios`;
  `academy.private_lesson.cancelled_paid` va al owner pero apunta a la
  vista del alumno (`/clases?scope=reservadas`).
- **Cobertura baja**: familias enteras sin destino (`membership.*`,
  `academy.billing_*`, `academy.subscription_*`, `producer.pro_*`,
  `academy.collections_*`, `payment_claim_*`, `table.*`, `crm.*`
  operativos, `academy.sale_deal.*`, `academy.plan_*`) aterrizan en el
  centro en vez de la consola o ficha que corresponde.
- **Canales asimétricos**: los emisores que mandan `data.path`
  resuelven el tap in-app pero no el click del push de dispositivo
  (el SW solo lee `data.url`), y viceversa (`ticket.day_of`,
  `class.reminder` mandan `url` sin `path`).

## What Changes

- `notification-nav`: `payment.paid` discrimina por `data`
  (`classId`→clase, `lessonId`→reservadas, `orderType`→perfil/pagos,
  resto→mis entradas); `NavNotification` gana `category` para
  discriminar audiencia (private_lesson instructor vs alumno,
  crm.segment owner vs persona); el fallback lee `data.path` o
  `data.url`; se agregan los mapeos de las familias sin destino.
- `academy.private_lesson.cancelled_paid` y `sold` →
  `/academia/particulares` (consola del owner, no la vista alumno).
- Emisores con mismo `type` y audiencias distintas mandan `data.path`
  por rama: `payment_claim_new` (owner→cobros/claim, productor→
  comprobantes/claim, admin→facturacion/comprobantes),
  `payment_claim_approved|rejected` (alumno→ficha academia,
  comprador→perfil/pagos), `academy.sale_deal.responded`
  (productor→ficha del acuerdo cuando el alcance es evento).
- `sw.js`: el click del push lee `data.url` con fallback a
  `data.path` - los 8 emisores que ya mandan `path` ganan deep link
  en dispositivo sin tocar el API.
- Tipos operativos sin página destino (`lead.new`, `crm.campaign`,
  MARKETING genéricas) quedan en el centro por diseño: queda
  documentado en el spec.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `notifications/deep-links`: el mapa cubre las familias faltantes,
  `payment.paid` discrimina por payload, el fallback acepta
  `data.url`, el tap puede discriminar por `category` y el SW cae a
  `data.path`. Emisores multi-audiencia resuelven `data.path` por
  rama.

## Impact

- Web: `lib/notification-nav.ts` (mapa + discriminadores),
  `public/sw.js` (fallback path).
- API: `academy-claims.service.ts`, `producer-claims.service.ts`,
  `academy-sales.service.ts` (solo `data.path` aditivo en payloads
  existentes - sin cambio de contrato).
- Compatibilidad: aditivo; notificaciones viejas sin `path`/`url`
  siguen cayendo al centro.
- Docs: `qa-flows-inventory.md` §Notificaciones, `architecture.md`
  (mapa tipo→destino).
