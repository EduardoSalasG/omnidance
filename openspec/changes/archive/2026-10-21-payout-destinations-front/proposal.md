# Change: payout-destinations-front

## Por qué

El backend de `payout-rails` ya expone `POST/GET /me/payout-destinations`
(onboarding Connect Express + estado) pero no hay superficie — el
productor no puede declarar su cuenta de desembolso sin llamar la API
a mano. Esta es la pieza UI del flujo multipaís.

## Qué cambia

- Sección **"Cuenta de desembolso"** en `/productor/pagos` (página
  existente, patrón consola): lista los `PayoutDestination` del actor
  con estado (PENDING/ACTIVE/DISABLED), moneda y fecha de onboarding.
- CTA **"Conectar con Stripe"**: `POST /me/payout-destinations
  {actorType:"PRODUCER", actorId:<personId>, country}` → redirige al
  `onboardingUrl` (Account Link). Vuelve a `/productor/pagos`; el
  `GET` refresca estado (PENDING→ACTIVE al completar en Stripe).
- Selector de país ISO-2 en el alta (whitelist Connect Express);
  estados vacío/error/cargando según estándar de carga percibida
  (Skeleton en contenido conocido, Spinner inline en acción).
- i18n `es-CL` para todo string nuevo; `qa-flows-inventory` actualizado.

## Fuera de scope

- Destinos ACADEMY/VENUE desde UI (el endpoint los soporta; la UI v1
  cubre el caso PRODUCER que es el real hoy — el POST ya valida
  ownership y se puede extender con un selector de actor después).
- Desvincular/desactivar un destino desde UI (DISABLED queda por
  admin/ops).
