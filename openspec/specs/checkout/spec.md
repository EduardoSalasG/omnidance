# checkout Specification

## Purpose
TBD - created by archiving change private-class-checkout. Update Purpose after archive.

## Requirements

### Requirement: Checkout de clase particular con proceso unificado

La compra de clase particular SHALL usar el mismo proceso de checkout
que membresía: página de revisión de orden (academia + producto +
precio), selección de medio de pago (pasarela o método propio de la
academia), breakdown del total y CTA de acción al final del flujo.
El CTA de la compra inline SHALL navegar al checkout, no crear la
orden en el mismo lugar.

#### Scenario: comprar particular por pasarela

- **WHEN** el alumno confirma en `/academias/[id]/checkout/particular`
  con la pasarela elegida
- **THEN** se crea la orden PRIVATE y sigue el flujo de pasarela
  (stub → poll + devSim; real → redirect a paymentUrl)

#### Scenario: particular por método propio de la academia

- **WHEN** el alumno elige un método propio (transferencia, link,
  efectivo) y confirma el intento
- **THEN** queda un claim AWAITING de kind PRIVATE_CLASS reanudable;
  al subir el comprobante pasa a PENDING en la cola del owner y el
  alumno vuelve a la ficha de la academia con el aviso

#### Scenario: aprobar claim de particular materializa la clase

- **WHEN** el owner aprueba un claim PRIVATE_CLASS
- **THEN** se crea el Payment MANUAL PAID y la PrivateLesson
  "por asignar" (igual que el settle PRIVATE de la pasarela)
