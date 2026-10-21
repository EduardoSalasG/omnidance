# Change: city-guides

## Por qué

La landing por ciudad muestra datos duros (eventos, venues) pero la
propuesta multipaís para el viajero necesita contenido editorial:
dónde se baila cada noche, qué nivel predomina, cómo moverse,
qué esperar del dress code — la guía curada que hace útil la app
para planear un viaje. Task 8 del roadmap.

## Qué cambia

- **`CityGuide`** (nuevo modelo): `{cityId @unique, intro, nightlife,
  practical, updatedById, updatedAt}` — tres secciones editoriales
  en markdown-lite (el front ya tiene patrón de texto enriquecido
  simple o se renderiza como párrafos; elegir lo mínimo consistente).
  `hasGuide` en `GET /cities/:slug` pasa a leer de este modelo.
- **API admin**: `GET /admin/city-guides` (lista de ciudades con
  estado de guía), `GET /admin/city-guides/:cityId`,
  `PUT /admin/city-guides/:cityId {intro, nightlife, practical}`
  (`admin.access`, audita `CITY_GUIDE_UPDATE`). Público: la guía
  viaja dentro de `GET /cities/:slug` (`guide:{intro,nightlife,
  practical}` cuando existe — `hasGuide=true`).
- **Front admin**: `/admin/ciudades` — lista de ciudades con
  "completa/borrador/vacía" → ficha con editor por sección
  (textarea con contador, guardar → PUT, ConfirmSheet solo si hay
  cambios sin guardar al salir). Entrada en nav admin.
- **Front público**: en `/ciudades/[slug]`, si `hasGuide`, secciones
  colapsables o tabs con el contenido editorial bajo el hero.
- **Gating**: flag `city_guides` (seed ON) — OFF → admin oculta la
  entrada, `guide` no viaja en la respuesta pública.
- Migración + seed vacío (sin contenido editorial inventado — las
  guías las escribe el equipo; el seed solo prepara la estructura).

## Fuera de scope

- Editor rich-text completo (v1 = texto con saltos de párrafo; el
  markdown-lite se evalúa cuando haya necesidad real).
- Multi-idioma del contenido editorial (es-CL v1, estructura lista
  para campos por locale si se requiere).
- Fotos de ciudades (v1 sin imágenes — consistente con "no hostear
  media").
