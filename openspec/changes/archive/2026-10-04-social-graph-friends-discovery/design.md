# Design — social-graph-friends-discovery

## Decisiones

### 1. `friends-going` como endpoint separado, no en `GET /events/:id`

`GET /events/:id` es público (sin SessionGuard — la landing anónima lo consume). Meter amigos ahí exigiría auth opcional en el endpoint público. En cambio `GET /events/:id/friends-going` con `SessionGuard` mantiene la frontera de privacidad limpia: la relación social solo se expone autenticado. El server component de `/eventos/[id]` lo fetchea con la cookie del request (mismo patrón que `getMissions`): 401 → null → sección oculta.

### 2. Invitación por link sin endpoints nuevos

El perfil `/amigos/<id>` ya existe, ya muestra "Agregar" para `status: none`, y el middleware ya redirige anónimos a `/login?next=<ruta>`. El link de invitación es simplemente la URL absoluta del perfil propio — se copia/comparte con `navigator.share` (fallback `clipboard.writeText`). Cero estado nuevo en servidor: la amistad nace cuando el receptor toca "Agregar".

### 3. Instagram: columna nullable + `PATCH /me`

- `Person.instagram String?` — nullable, cero riesgo en datos existentes.
- `PATCH /me` nuevo en `people.controller` (junto a `GET /me`), DTO con `@Matches(/^[a-zA-Z0-9._]{1,30}$/)` tras normalizar `@` inicial y trim. Vacío/null → `null`.
- `GET /me` y `GET /people/:id` lo exponen (es dato público voluntario — quien lo pone quiere que lo vean).
- En `/perfil` se edita inline (input + guardar); en `/amigos/[id]` se muestra con un SVG inline del logo de Instagram (no hay librería de iconos de marca — SVG propio, ~1 path).

### 4. Seed

`instagram` a las personas demo con más presencia social (camila, josefa, diego, antonia, valeska, rodrigo) — handles plausibles tipo `camila.dance`.

## Riesgos

- **Privacidad**: instagram es autodeclarado y público por naturaleza; se expone en el perfil público igual que nombre/foto. Los bloqueados siguen sin ver nada (blockedIds ya cubre).
- **friends-going y tickets reclamables**: un ticket con `claimToken` no reclamado pertenece aún al `ownerId` original — si ese owner es amigo del viewer, aparece. Correcto: él decidió ir (pagó). Solo cuenta status ACTIVE.
- **SSR**: el fetch de friends-going es con cookie en el server component — fallo silencioso → sección ausente, nunca error visible.
