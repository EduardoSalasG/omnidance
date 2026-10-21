# Delta: admin (city-guides)

## ADDED Requirements

### Requirement: Guía editorial por ciudad

El sistema SHALL persistir `CityGuide {cityId @unique, intro,
nightlife, practical, updatedById, updatedAt}` — una guía por ciudad
con tres secciones de texto. `GET /admin/city-guides` SHALL listar las
ciudades con su estado de guía (vacía/borrador/completa: completa =
las 3 secciones con texto); `GET /admin/city-guides/:cityId` devuelve
el contenido; `PUT /admin/city-guides/:cityId {intro?, nightlife?,
practical?}` (`admin.access`) SHALL upsertear, persistir `updatedById`
y auditar `CITY_GUIDE_UPDATE`. Ciudad inexistente → 404.

#### Scenario: Publicar guía

- **WHEN** un admin guarda intro+nightlife+practical para Santiago
- **THEN** la guía queda "completa", `updatedById` = su personId y
  `GET /cities/:slug` pública incluye `guide` + `hasGuide:true`

### Requirement: Render público en landing

`GET /cities/:slug` SHALL incluir `guide:{intro,nightlife,practical}`
y `hasGuide:true` cuando la ciudad tiene guía con al menos una
sección con texto, respetando el flag `city_guides` (apagado → la
guía no viaja ni se enlaza). `hasGuide` SHALL ser `false` sin guía
o con todas las secciones vacías.

#### Scenario: Guía parcial

- **WHEN** una ciudad tiene solo `intro` escrito
- **THEN** `hasGuide:true` y la landing muestra solo la sección con
  contenido — nunca secciones vacías al visitante

### Requirement: Editor admin

`/admin/ciudades` (`admin.access`) SHALL listar ciudades con estado
de guía y llevar a una ficha con editor por sección (textarea +
contador), guardado explícito con feedback y protección contra
salida con cambios sin guardar.

#### Scenario: Guardado exitoso

- **WHEN** el admin edita una sección y guarda
- **THEN** el PUT persiste, el estado de la ciudad actualiza y se
  muestra confirmación inline
