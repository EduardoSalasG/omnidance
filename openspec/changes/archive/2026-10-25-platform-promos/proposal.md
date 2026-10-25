# Change: platform-promos

## Why

Los precios de suscripción (academias/productor) no admiten
flexibilidad comercial: toda academia paga el precio del param, sin
forma de ofrecer descuentos para captación o retención. Las
alternativas descartadas por romper normalización o no cubrir
pre-venta: override en el actor (Academy/Person) y override en la sub
(solo existe post-contratación).

## What Changes

- Nueva entidad `PlatformPromo` (admin-managed): nombre, scope por
  línea (ACADEMY/PRODUCER/null=ambas), tipo de descuento
  (PERCENT|FIXED_CLP), valor, ventana validFrom/validUntil, maxCycles
  (número de cobros con descuento, null=ilimitado dentro de la ventana),
  whitelist opcional de actores (academies/producers), enabled.
- El billing aplica la promo vigente al calcular el monto del ciclo:
  descuento sobre el mensual base del tier; si hay whitelist, solo
  aplica a actores listados; si maxCycles se agotó (conteo de invoices
  pagados bajo la promo), vuelve al precio lleno.
- La página de suscripción del actor muestra la promo activa si aplica
  (precio tachado + precio oferta + vencimiento).
- Admin: pantalla para crear/editar/listar promos (patrón de consola:
  crear = CTA → página; sin coupon-input para el cliente final).
- MRR en /admin/finanzas refleja el precio efectivo con promo.
