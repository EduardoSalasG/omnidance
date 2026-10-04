# academy-saas-billing — de fee-por-venta a plataforma de gestión (SaaS)

## Por qué

Hoy la plataforma monetiza con cargos por venta (`service_fee.*` al
comprador, `platform_fee.*_pct` al productor). El pivote de negocio:
posicionarnos como **plataforma de gestión** para academias con
suscripción mensual por tier de alumnos (referencia: BoxMagic Chile,
SaaS de gyms con tiers por clientes activos), y para productores
mantener la comisión por venta más una suscripción Pro opcional por las
herramientas premium.

## Qué cambia

- **Academia**: `PlatformSubscription` (kind=ACADEMY) con tiers por
  alumnos activos; cobro recurrente vía el mismo motor Flow de
  `MembershipSubscription` (infra existente).
  El cargo de servicio al comprador en productos de academia desaparece;
  la academia absorbe el costo Flow (~3.19%) en su payout.
  Mora: 5 días gracia → bloqueo (sin consola, fuera de explorar, sin
  reservas nuevas de sus alumnos).
- **Productor**: `platformFeePct` sigue como monetización por venta +
  suscripción **Producer Pro** mensual opcional que habilita las
  herramientas premium.
- **Bailarín**: `service_fee` de entradas se mantiene; en productos de
  academia ya no paga cargo.

## Alcance (IN/OUT)

IN: modelo de datos, tiers, ciclo de facturación, enforcement de mora,
quitar fee comprador en productos academia, deducir costo Flow del
payout de academia, Producer Pro (suscripción + gating), pantallas de
consola (estado de suscripción, contratación), migración de academias
existentes (grace de lanzamiento).

OUT: pasarela multi-merchant (la academia sigue cobrando por nuestra
cuenta Flow), facturación tributaria/SII, metered billing por alumno
(documentado como alternativa descartada).
