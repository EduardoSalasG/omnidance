# dancer-profile-survey-analytics — Perfil de baile + encuesta post-social + analítica por evento

## Why

El producto necesita métricas reales de la pista: saber quién baila qué rol (leader/follower) y cómo fue cada social (gente, temperatura, música, evaluación general). Hoy `PersonStyleRole` y `EventRating` existen pero sin superficie para que el bailarín los declare/evalúe, sin género para proporciones, y sin analítica por evento para el productor. Además, analítica debe ser módulo propio en el sidebar, no parte de administración.

## What Changes

- **`Person.gender`** (`M|F|OTHER`, nullable) — nuevo campo declarado en perfil. **BREAKING** (schema).
- **`EventRating.overall`** (`Int?` 1-5) — puntuación general del social. **BREAKING** (schema).
- **Perfil bailarín**: sección "Cómo bailas" — género + estilos con rol (`LEADER`/`FOLLOWER`/`SWITCH`) y nivel; `PATCH /api/me/profile` + `GET /api/styles` (catálogo por género).
- **Encuesta post-social**: para asistentes con check-in real, ventana 24h post-`endsAt`. Activación por card en `/inicio` + `notifySafe` (in-app + push best-effort). UI `/eventos/[id]/evaluar` con `StarRating`: `overall` obligatorio + 3 dims bipolares con etiquetas (Música, Gente "Vacío↔Lleno", Temperatura "Frío↔Caluroso") + expandible "Evaluar más" (organization/floorComfort/lightingSound).
- **Analítica por evento**: `GET /api/events/:id/analytics` (owner/admin) → asistentes, proporción género, proporción leader/follower (de `PersonStyleRole` de asistentes), resultados de la encuesta (k-anonymity ≥3). Sección en `/productor/eventos/[id]`.
- **Sidebar**: analítica como módulo propio (`/analitica`); el lens admin por rol vive bajo analítica, no bajo administración.

## Capabilities

### New Capabilities
- `dancer-dance-profile`: declaración de género + estilos con rol de baile en el perfil.
- `post-event-survey`: encuesta 1-5 post-social para asistentes con check-in, activada por card + notificación.
- `event-analytics`: analítica por evento para productor (asistentes, género, roles de baile, encuesta) y módulo de analítica en sidebar.

## Impact

- **Schema**: `Person.gender`, `EventRating.overall` — migración versionada.
- **API**: `PATCH /me/profile`, `GET /styles`, `GET /events/:id/analytics`, trigger de notificación post-evento (lazy, en `GET /home/stats` o similar — sin cron nuevo).
- **Web**: `/perfil` sección "Cómo bailas", `/inicio` card de encuesta, `/eventos/[id]/evaluar`, `/productor/eventos/[id]` sección analítica, sidebar con módulo analítica.
- **Docs**: architecture.md, openapi/postman.
