# Design: landings-estaticas

## Context

Las cuatro landings de marketing (`/`, `/pro`, `/para-academias`, `/para-productores`) fetchean el API en cada render server-side: `GET /events` con `revalidate: 300` (strip "esta semana" + JsonLd ItemList) y `GET /academies/public` con `revalidate: 300` (strip de academias). El usuario pidió landings 100% estáticas con la data en catálogos editables, no contenido quemado. Alcance acordado: solo esas cuatro rutas; `/terminos` y `/privacidad` ya son estáticas; `/ciudades`, `/pase`, `/e/[id]`, `/reclamar/[token]` y el resto de `(marketing)` quedan dinámicas (superficies funcionales, no landings).

## Goals / Non-Goals

Goals:

- Cero requests al API en el render server-side de las cuatro landings.
- Data dinámica (eventos destacados, academias) en JSONs commiteados, editables a mano y regenerables por script.
- El snapshot envejece con gracia: el filtro "esta semana" corre en render, así los eventos vencidos dejan de mostrarse sin regenerar.

Non-goals:

- No se tocan `/ciudades`, `/pase`, `/e/[id]`, `/reclamar`, `/login`, `sitemap.ts` ni el middleware: conservan su comportamiento dinámico actual.
- No cambian endpoints del API ni flags runtime.
- No hay pipeline CI/CD de regeneración: el sync es manual/bajo demanda en esta iteración.

## Decisions

### 1. Catálogos en `apps/web/src/content/` consumidos por un loader tipado

Estructura:

```
apps/web/src/content/
  events.json       { generatedAt, events: EventFeedItem[] }
  academies.json    { generatedAt, academies: PublicAcademy[] }
```

`src/lib/marketing-content.ts` exporta `marketingEvents()` (tipado `JsonLdEvent[]`, el feed completo sirve), `marketingAcademies()` (tipado `PublicAcademy`, que se muda acá) y `thisWeek()` (se traslada desde `public-events.ts`). Las páginas importan el loader, no los JSONs directos: el loader es el único punto que conoce la on-disk layout.

Por qué JSONs en `content/` y no en los i18n parts: los i18n parts son strings por locale; la data de eventos/academias es estructurada y agnóstica de locale. JSON commiteado cumple la restricción del usuario ("la data sigue en JSONs/catálogos editables") y `resolveJsonModule` ya viene activo en el tsconfig.

Alternativa considerada: hardcodear la data en el código o en catálogos i18n. Rechazada: mezcla contenido con copy/código, rompe la separación que el propio usuario pidió preservar ("estático ≠ contenido quemado").

### 2. Script `sync-marketing-content.mjs` regenera desde el API público

Script Node plano en `apps/web/scripts/` (mismo patrón que `gen-favicon.mjs` etc.), expuesto como `content:sync` en `apps/web/package.json`. Resolución del API: `API_URL` env > `API_PROXY_TARGET` > `http://127.0.0.1:4000` (default IPv4, mismo criterio que `next.config.mjs` por el bug de `localhost`→`::1` en Windows).

Comportamiento: fetch a `/api/events` y `/api/academies/public` → escribe los JSONs con `generatedAt` nuevo. Si cualquier fetch falla o devuelve no-OK, el script aborta con exit≠0 sin escribir nada (los catálogos previos quedan intactos: nunca se pisa data buena con vacío). Idempotente: misma data → mismo archivo (orden estable, formato `JSON.stringify(x, null, 2)`).

### 3. ISR con `revalidate` para el filtrado temporal, sin fetch

Las cuatro páginas quedan estáticas (sin fetch runtime) y conservan `export const revalidate = 3600`. La regeneración ISR solo re-ejecuta el render sobre el catálogo ya importado: `thisWeek()` se recalcula con `Date.now()` sin tocar el API. Así el strip "N eventos esta semana" y el JsonLd envejecen con gracia entre syncs: un evento que vence desaparece solo en la próxima revalidación.

Alternativa considerada: estático puro sin revalidate. Rechazada: congelaría el conteo semanal y dejaría eventos vencidos visibles hasta el próximo deploy.

### 4. Los lib `public-*.ts` se parten por destino

`public-events.ts` y `public-academies.ts` se eliminan (solo los usaban las landings). `public-cities.ts` se mantiene intacto: lo usan `/ciudades` y `sitemap.ts`, que quedan fuera del alcance y siguen dinámicos. El tipo `PublicAcademy` se muda a `marketing-content.ts` (único consumidor restante: `Landing.tsx`).

## Risks / Trade-offs

- [Snapshot stale muestra eventos/academias viejos] → El filtro temporal corre en render + `generatedAt` visible en el JSON + el operador corre `content:sync` cuando importa (documentado en AGENTS.md). El strip degrada a empty copy honesto, no a data falsa.
- [El script sync falla a mitad] → Se recolecta todo antes de escribir; cualquier fallo aborta sin escribir. Los JSONs nunca quedan parciales.
- [Alguien reintroduce un fetch en una landing] → La regla queda en spec (`marketing-content`) y los lib `fetch*` se eliminaron: un fetch nuevo tendría que escribirse a mano, lo que es visible en review.

## Migration Plan

1. Crear `src/content/` + loader + script; correr `content:sync` contra la API dev (seed vigente) → commitear los JSONs generados.
2. Actualizar las cuatro páginas + `Landing.tsx`; eliminar `public-events.ts` y `public-academies.ts`.
3. Verificar con el API apagada: las cuatro landings 200 y completas, cero requests al API.
4. Rollback: revert del commit; no hay cambios de API ni de datos.

## Open Questions

- Frecuencia/propietario del re-sync (manual por ahora; un job CI que regenere y abra PR queda como mejora futura, no bloquea).
