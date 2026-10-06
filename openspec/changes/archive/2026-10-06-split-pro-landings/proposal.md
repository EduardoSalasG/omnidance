# split-pro-landings

## Why

`/pro` habla a 4 roles con un solo copy genérico - el mensaje no calza
con nadie. Separar por audiencia (academia vs productor) permite copy
específico por rol, mejora SEO (keywords por nicho) y baja fricción
del lead form (rol fijo, sin multiselect).

## What Changes

- Nuevas landings `/para-academias` y `/para-productores`: mismo
  esqueleto de `Landing`, copy por rol (hero, PAS, features del
  módulo, CTA), rol fijo en el lead form y acento sutil propio
  (academia = verde del modo Academy, productor = violeta de marca).
- `/pro` se convierte en selector de audiencia: dos cards a las
  landings + form compacto para DJ/VENUE (los roles sin landing).
- `ProLeadForm` gana `fixedRole` (oculta el fieldset y manda rol único)
  y `roleOptions` (restringe el multiselect).
- SEO: meta title/description/canonical por landing, sitemap con las
  nuevas rutas, link cruzado entre landings pro en footer y CTA.

## Capabilities

### New Capabilities

- `landing-marketing`: landings de captación por audiencia (academia,
  productor, selector pro para DJ/venue).

## Impact

- `Landing.tsx` (variantes), `ProLeadForm.tsx` (props), `pro/page.tsx`
  (selector), dos pages nuevas, `landing.json`, `sitemap.ts`.
- Sin cambios de API - `/api/leads` ya acepta `roles[]`.
