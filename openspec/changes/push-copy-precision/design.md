# Diseño — convención de copy push

## Reglas

1. **Title** = el outcome, no la categoría. Nada de "Pago confirmado — …"
   como prefijo: "Ticket listo" dice lo mismo en 12 chars. Objetivo ≤ 40
   chars tras interpolar nombres típicos.
2. **Body** = hechos clave separados por ` · ` (nombre · monto · fecha).
   Fragmentos, no oraciones. Acción pendiente al final tras `—`.
3. **Quién/qué primero según contexto**: en sociales/disponibilidad el
   nombre va en el title (`Ana te invitó a bailar`); en confirmaciones de
   pago va en el body (el outcome importa más que el objeto).
4. Sin punto final en titles. `type`/`category`/`data` no cambian — solo
   los literales visibles.

## Tabla verbatim (antes → después)

TRANSACTIONAL / pagos (`payment-settlement.service.ts`):

| type / contexto | title nuevo | body nuevo |
|---|---|---|
| `payment.paid` ticket | `Ticket listo` | `${event.name}` |
| `payment.paid` clase BOOKED | `Cupo reservado` | `${series.name} · ${clp}` |
| `payment.paid` clase WAITLIST | `En lista de espera` | `${series.name} · ${clp}` |
| `payment.series_pass` | `Pase de serie activo` | `${series.name} · ${order.month}` |
| `payment.membership` | `Plan activo` | `${plan.name} · ${academy.name} · ${clp}` |
| `payment.paid` private lesson | `Clase particular comprada` | `${academy.name} · ${clp}` |
| `payment.failed` | `Pago fallido` | `${event.name}` (sin "Para ") |
| `payment.amount_mismatch` (admin) | `Monto distinto al de la orden` | igual: `Pago ${refId}: esperado $X · reportado $Y` |
| `table.requested` (venue) | `Nueva solicitud de mesa` | igual: `${buyer} · ${n} personas · ${event}` |
| `ticket.gifted` | `${buyerName} te regaló una entrada` | igual: `Para ${event.name}` |

Suscripciones (`subscriptions.service.ts`):

| type | title nuevo | body nuevo |
|---|---|---|
| `membership.subscription_active` ×2 | `Suscripción activa` | `${plan.name} · ${academy.name}` |
| `membership.subscription_canceled` | `Suscripción cancelada` | `${plan.name} · ${academy.name} — acceso hasta fin del período pagado` |
| `membership.renewal_reminder` | `Renovación mañana` | `${plan.name} · ${academy.name}` |
| `membership.renewal_failed` | `Cobro fallido` | `${plan.name} · ${academy.name} — reintentaremos; revisa tu tarjeta` |

Academies (`classes`, `private-lessons`, `class-series` controllers):

| type | title nuevo | body nuevo |
|---|---|---|
| `class.waitlist.promoted` | `Conseguiste cupo` | `${series.name ?? academy.name}` |
| `class.series.resumed` | `${series.name} retomó sus clases` (igual) | — |
| `academy.private_lesson.assigned` alumno | `Clase particular agendada` | df igual |
| `academy.private_lesson.assigned` instructor | `Clase particular asignada` | df igual |
| `academy.private_lesson.cancelled_paid` | `Clase particular cancelada` | `Reembolsar el pago al alumno` |
| `academy.private_lesson.sold` (owner) | `Clase particular vendida` | `${academy.name} · ${clp} — asigna fecha e instructor` |
| `private_lesson.commission_paid` | `Comisión liquidada` | clp igual |

Events / social / misc:

| type | title nuevo | body nuevo |
|---|---|---|
| `table.confirmed` | `Mesa confirmada` | igual: `${n} personas · Mesa N · ${event}` |
| `table.cancelled` | `Mesa no confirmada` | igual: `${event.name}` |
| `ticket.claimed` | `${claimant} reclamó tu entrada` | igual: `Para ${event.name}` |
| `waitlist.promoted` (evento) | `Cupo liberado` | `${event.name}` (sin "Para ") |
| `session.invite` | `${inviter} te invitó a bailar` (igual) | — |
| `session.confirmed` | `${actor} aceptó bailar contigo` (igual) | — |
| `session.declined` | `${actor} no pudo bailar` | — |
| `friend.request` | `${name} te envió solicitud de amistad` | — |
| `lead.new` | `Nuevo lead: ${name}` (igual) | igual |
| `account.complete_profile` | `Completa tu perfil` (igual) | `Faltan datos para activar tu cuenta` |

CRM campaign/trigger defaults: **sin cambios** (copy del operador).

## Riesgos

- Ningún test aserta `title`/`body` (verificado con grep sobre specs).
- Notificaciones históricas en DB conservan el copy viejo — aceptable.
- La convención queda espec'd para que futuros call sites la sigan.
