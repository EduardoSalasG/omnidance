# Design: admin-acquisition-report

## Context

La consola de consultas ya resuelve todo lo que un reporte nuevo
necesita: catálogo data-driven (`QUERY_CATALOG` en shared), handlers
por lente (`ADMIN_ENTITIES` en `apps/api/src/query/entities/admin.ts`),
preview paginado, export CSV/PDF (`exportTable`) y consultas
guardadas. `GET /analytics/summary` existe pero quedó sin consumidor
en web (la consolidación dejó `/analitica` como superficie única), así
que agregar una sección ahí sería data-write-only.

Fuentes: `Person.acquisitionSource` (string ya normalizado por
`resolveAcquisition()` en el alta) y `Referral` (referredId → source).

## Goals / Non-Goals

**Goals:**

- Una entidad `acquisition` en el lente ADMIN que responda "¿de qué
  canal vienen las altas del período?" con export y guardado incluidos.
- Canal único por alta con precedencia referral > acquisitionSource >
  sin_dato (los altas por invite nunca escriben acquisitionSource, su
  canal es el Referral - misma semántica que la spec de capture).

**Non-Goals:**

- CAC monetario (costo ÷ altas): no existe spend por campaña todavía.
  El nombre del reporte es "altas por canal"; cuando haya spend se
  enriquece esta misma entidad (columna costo/cac) o una hermana.
- Drill a la lista de personas de un canal: las filas son agregadas;
  la entidad `people` sigue siendo el listado por persona.
- Desglose del detalle crudo (`acquisitionDetail`: medium/campaign/
  content/term): queda para cuando el volumen lo amerite; `utm:*`
  agrupa por source, que es el nivel accionable hoy.
- Ninguna página ni endpoint nuevo.

## Decisions

- **Fila = canal, no alta**: el reporte preguntado es por canal.
  Alternativa (listar cada alta con su canal) duplica `people` y
  fuerza al admin a sumar a ojo. El agregado es la respuesta.
- **`Referral` gana sobre `acquisitionSource`**: los altas por invite
  no escriben el campo orgánico por diseño (la atribución es el
  referral); sin esta precedencia los invites inflarían `sin_dato`.
  Se toma la referral más antigua por si hubiera más de una.
- **`kind` enum multi con prefijos**: los canales `utm:*`/`ref:*`/
  `landing:*` son abiertos; el filtro por prefijo cubre "solo pagado/
  solo orgánico" sin enumerar valores dinámicos ni un segundo filtro
  de texto (q queda sin uso; los canales ya vienen normalizados).
- **Sin `personId` ni `objects` en el resultado**: filas agregadas,
  sin sujeto; `objects` no se expone porque la entidad no alimenta
  `/admin/browse` (solo el registry del query engine lo consume).
- **pct calculado en el handler** sobre el total del período filtrado,
  redondeado a entero (coherente con `occupancyPct` y otros pct del
  código).

## Risks / Trade-offs

- **Volumen de Person**: la agregación trae `id/createdAt/
  acquisitionSource` de las personas del rango + sus referrals en dos
  queries (no hay groupBy por prefijo posible en SQL portable sobre el
  prefijo del string). En la escala actual (miles de personas) es
  trivial; si crece se puede pasar a `groupBy` por `acquisitionSource`
  exacto + mapeo de prefijo en app.
- **`sin_dato` mezcla dos mundos**: cuentas pre-capture y altas donde
  el capture no llegó. Es la realidad del dato; la label i18n lo
  dice explícito ("sin dato / anteriores").
- **Referral LINK vs acquisition**: si una persona referida por LINK
  además declaró utm, manda el referral (atribución de relación sobre
  la de click - decisión consistente con el dominio, documentada en
  la spec delta).
