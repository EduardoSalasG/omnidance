# academy-website-link

## Why

La ficha pública de la academia (`/academias/:id`) muestra Instagram y
WhatsApp como canales de contacto, pero no hay campo para el sitio web —
academias con página propia no pueden enlazarla. El modelo `Academy` ya
tiene `instagram`/`whatsapp`; falta `website` de punta a punta.

## What Changes

- **`Academy.website String?`** — campo opcional, migración versionada.
- **`PATCH /academies/:id/settings`** acepta `website` (undefined no
  toca; "" / null limpia; normaliza a URL http(s) — sin esquema se asume
  `https://`; URL inválida → 400).
- **`GET /academies/:id/profile`** incluye `website` en la respuesta.
- **Ficha pública**: chip "Sitio web" junto a Instagram/WhatsApp, solo si
  hay website publicado (ambos opcionales).
- **Formulario de perfil** (`/academia` → AcademyProfile): campo website
  editable por owner/ADMIN.

## Capabilities

### New Capabilities

- `academies/public-profile`: contacto público de la academia —
  descripción, dirección/coords, instagram, whatsapp y website
  (opcionales), editables por owner/ADMIN y visibles en la ficha
  pública.
