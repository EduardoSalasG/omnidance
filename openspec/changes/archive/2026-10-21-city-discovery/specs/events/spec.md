# Delta: events (city-discovery)

## ADDED Requirements

### Requirement: Directorio y landing de ciudades

`GET /cities` SHALL devolver las ciudades con al menos un evento
futuro publicado, con `{id, slug, name, country, upcomingEvents}` y
orden por actividad descendente. `GET /cities/:slug` SHALL devolver
la ficha `{id, slug, name, country, lat, lng, upcomingEvents:
EventFeedItem[], venues: {id,name}[], hasGuide}` o 404 si el slug no
existe. Ambos endpoints SHALL respetar el flag `city_landing` (apagado
→ 404).

#### Scenario: Ciudad sin actividad

- **WHEN** una ciudad existe pero no tiene eventos futuros
- **THEN** no aparece en `GET /cities` y `GET /cities/:slug`
  responde con `upcomingEvents: []` y `hasGuide` según corresponda

### Requirement: Búsqueda "cerca de mí"

`GET /events/near?lat=<f>&lng=<f>&radiusKm=<n>` SHALL devolver los
eventos futuros publicados cuya `cityId` pertenece a una ciudad con
`lat/lng` dentro del radio (haversine; `radiusKm` default 25, máx 200),
con el mismo shape del feed público y ordenados por distancia de la
ciudad. Sin `lat`/`lng` válidas → 400. Si ninguna ciudad con
coordenadas cae en el radio → `{events: [], nearestCity?: {...}}` con
la ciudad más cercana si existe (sugerencia, nunca error).

#### Scenario: Usuario en Santiago

- **WHEN** un visitante consulta near con coordenadas de Santiago
  (`-33.45,-70.66`)
- **THEN** recibe los eventos futuros de `city-stgo-cl` ordenados por
  fecha, con `nearestCity` innecesario

#### Scenario: Lejos de toda ciudad

- **WHEN** las coordenadas están a >500km de toda ciudad
- **THEN** `events:[]` y `nearestCity` apunta a la más cercana
