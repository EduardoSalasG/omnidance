# Proposal — series-engagement

## Why

Los eventos que pertenecen a una serie carecen de social proof
verificable. El modelo "Civitatis de baile" requiere que el bailarín
pueda evaluar con datos reales si una serie vale la pena antes de ir —
especialmente el viajero que no conoce la escena local.

## What Changes

- Nuevo modelo `SeriesReview` (score 1-5 + comentario, único por
  persona×serie): solo puede evaluar quien tenga **check-in válido**
  en un evento de la serie — reviews probadas por asistencia real.
- `GET /events/series/:id/engagement` (sesión): stats agregadas de la
  serie — asistencia promedio por evento, ratio género (M/F/OTHER/
  sin declarar) y ratio leader/follower de asistentes con perfil de
  baile declarado — más score agregado de reviews (promedio + conteo)
  y flag `myReview`.
- `POST /events/series/:id/review`: upsert de la review propia
  (score obligatorio, comentario opcional) — gateado por check-in.
- `GET /events/series/:id/reviews` (productor/admin): lista de
  comentarios individuales — **privado**, nunca expone el autor al
  público (regla de plataforma: evaluaciones agregadas/privadas).
- UI: card de engagement en la ficha del evento cuando pertenece a
  serie (stats + score + formulario si el usuario hizo check-in);
  los comentarios quedan visibles solo para el productor.
