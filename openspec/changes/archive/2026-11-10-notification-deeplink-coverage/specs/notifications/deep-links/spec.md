# notifications/deep-links

## MODIFIED Requirements

### Requirement: Deep link compartido por tipo

El mapa tipo → destino SHALL vivir en una única fuente consumida por
el centro `/notificaciones` y por el toast en tiempo real. El tap del
toast SHALL navegar al mismo deep link que la card del centro para el
mismo tipo; cuando el tipo no tiene destino resuelto, el tap cae a
`/notificaciones` (comportamiento vigente). La X del toast SHALL
seguir descartando sin navegar. Los efectos de tap propios del tipo
(p.ej. consumo + lente de `academy.invite`) SHALL correr igual desde
ambas superficies. El tap del cuerpo del toast SHALL además marcar la
notificación como leída (`POST /notifications/:id/read`,
fire-and-forget best-effort) al navegar, para que no reaparezca como
pendiente al volver al centro.

Cobertura y resolución:

- Un `type` con múltiples payloads SHALL discriminar el destino por
  `data`: `payment.paid` resuelve `/clases/:classId` (clase suelta),
  `/clases?scope=reservadas` (clase particular), `/perfil/pagos`
  (cobro de plataforma) o `/eventos?view=mios` (ticket) según los
  campos presentes.
- Un `type` emitido a audiencias distintas SHALL poder discriminar
  por `category` (p.ej. `academy.private_lesson.assigned`:
  OPERATIONAL instructor → `/academia/particulares`, resto →
  `/clases?scope=reservadas`; `crm.segment.enter|exit`: OPERATIONAL →
  `/crm/segmentos/:segmentId`, MARKETING al actor → sin destino) o el
  emisor SHALL mandar `data.path` resuelto por rama cuando el front
  no puede distinguirlas (`payment_claim_*`,
  `academy.sale_deal.responded`).
- El fallback genérico SHALL leer `data.path` o `data.url`
  (`safeInternalPath` en ambos) - un solo destino por notificación
  sirve al tap in-app y al click del push de dispositivo, que SHALL
  leer `data.url` con fallback a `data.path` antes de caer a
  `/notificaciones`.
- Tipos operativos/MARKETING sin superficie destino (`lead.new`,
  `crm.campaign`, avisos a admins sin consola específica) quedan en
  el centro por diseño.

#### Scenario: toast con deep link

- **GIVEN** una notificación entrante cuyo tipo tiene destino
  (p.ej. `ticket.claimed` con `eventId`)
- **WHEN** la persona toca el cuerpo del toast
- **THEN** el toast se descarta, la notificación queda marcada leída
  y navega al deep link del tipo (no a `/notificaciones`)

#### Scenario: toast sin deep link

- **WHEN** la persona toca un toast cuyo tipo no resuelve destino
- **THEN** queda marcada leída y navega a `/notificaciones` como
  antes

#### Scenario: misma fuente que el centro

- **WHEN** se compara el destino de un tipo en el toast y en la card
  del centro
- **THEN** ambos resuelven el mismo path (una sola tabla compartida)

#### Scenario: payment.paid discrimina por payload

- **WHEN** llega `payment.paid` de una clase suelta (`classId`), una
  particular (`lessonId`), un cobro de plataforma (`orderType`) o un
  ticket (`eventId`)
- **THEN** el tap navega a `/clases/:id`, `/clases?scope=reservadas`,
  `/perfil/pagos` o `/eventos?view=mios` respectivamente

#### Scenario: mismo tipo, audiencias distintas

- **WHEN** `payment_claim_new` llega al owner de la academia, al
  productor o a un admin de plataforma
- **THEN** cada uno aterriza en su propia cola de validación porque
  el emisor resolvió `data.path` por rama

#### Scenario: push de dispositivo con path

- **GIVEN** una notificación cuyo `data` trae `path` pero no `url`
  (p.ej. `role.approved`)
- **WHEN** la persona toca la notificación del sistema operativo
- **THEN** el service worker abre el `path` (no `/notificaciones`)
