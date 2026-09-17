# prime-time-reveal

## Purpose

Reveal del Prime Time: ganadores Mejor Leader / Mejor Follower por score bayesiano sobre sesiones confirmadas y evaluadas antes del reveal, más "Pareja de la noche" — con premio de corona 👑 en el QR por 1 semana (spec §6, §7).

## ADDED Requirements

### Requirement: Calcular ganadores

El sistema SHALL computar los ganadores del reveal usando solo sesiones confirmadas **y evaluadas** antes del reveal, con score bayesiano por rol (el promedio simple no basta — ver scoring §6). Sesiones `retroDeclared` no participan.

#### Scenario: reveal con umbral alcanzado

- **WHEN** el evento desbloqueó el premio (contador ≥ umbral) y se consulta `GET /events/:id/prime-time/reveal`
- **THEN** devuelve Mejor Leader, Mejor Follower y Pareja de la noche (o los que apliquen con datos suficientes)

#### Scenario: sin desbloqueo no hay premio

- **WHEN** el contador nunca alcanzó el umbral
- **THEN** el reveal responde que no hubo premio esa noche

#### Scenario: umbral de muestra

- **WHEN** un candidato tiene menos evaluaciones que el mínimo de agregación
- **THEN** no aparece como ganador aunque su promedio sea alto

### Requirement: Corona del ganador

Al publicarse el reveal, el sistema SHALL otorgar a los ganadores el badge de corona como `PersonBadge` con `expiresAt` a +1 semana — el status vive en el ritual del escaneo, no escondido en el perfil.

#### Scenario: corona con expiración

- **WHEN** se publica el reveal
- **THEN** los ganadores reciben `PersonBadge` de corona Prime Time con `expiresAt` = reveal + 7 días

#### Scenario: corona expirada no se exhibe

- **WHEN** pasaron más de 7 días
- **THEN** la corona deja de aparecer como badge activo en el QR (queda en el historial de colección)

#### Scenario: reveal idempotente

- **WHEN** el reveal ya fue publicado para el evento
- **THEN** consultarlo de nuevo devuelve los mismos ganadores sin duplicar coronas

### Requirement: Pareja de la noche

El sistema SHALL reconocer la pareja mejor evaluada *mutuamente* (ambos se puntuaron alto) — premia conexión, no técnica individual, y no puede farmearse solo.

#### Scenario: pareja mutua

- **WHEN** una pareja A↔B tiene las mejores evaluaciones mutuas combinadas del evento
- **THEN** aparece como "Pareja de la noche" en el reveal
