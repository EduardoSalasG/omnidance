# Proposal: llegada por invitación de academia activa la lente academy

## Resumen

Hoy el bailarín invitado a una academia por `AcademyInvite` consume el
magic link y aterriza en `/academias/:id` con `viewMode="social"`
(el default persistido en `localStorage["omnidance:view-mode"]`), por
lo que la ficha renderiza con acento nightlife (morado). El contexto
de llegada es academia: la lente consumer SHALL reflejarlo.

## Alcance

- `GET /auth/verify` y `POST /auth/otp/verify`: cuando
  `consumeAcademyInvites` marca al menos una invitación, la respuesta
  setea una cookie de un solo uso `omnidance:lens=academy` (legible
  por JS, vida ~5 min).
- El chrome (`BottomNav`, dueño actual de `data-mode`) lee la cookie
  al montar con sesión resuelta → `setViewMode("academy")` → expira
  la cookie. Aplica a cuenta nueva (pasando por `/bienvenida`) y
  existente (redirect directo a `next`).
- El default global sigue siendo `social` (el funnel principal de
  adquisición es nightlife); solo la llegada con invite consumido
  voltea la lente.

## Fuera de alcance

- El push `academy.invite` de cuenta existente (deep-link que no pasa
  por verify): queda como gap conocido, sin señal de lente.
- Cambiar el modelo de acento por lente ni forzar academy en rutas
  `/academias/*` (una visita casual a la ficha no voltea la lente).
- Crear enrollment desde la invitación (la invitación nunca inscribe;
  decisión vigente).
