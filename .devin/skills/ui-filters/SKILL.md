# UI Filters — omnidance

Patrones de barras de búsqueda/filtro/orden — complementa
`ui-ux-principles` (léela primero) y `console-patterns` (FilterBar
data-driven del catálogo `/query`, Pager).

## Layout de barra

```
[Buscar…basis-full en mobile]   ← fila propia en mobile
[chip toggle] [chip toggle]     ← toggles juntos en su fila
[Select campo ▾] [↓/↑]          ← campo + dirección en su fila
```

- Mobile: cada grupo una fila — `basis-full` fuerza el wrap antes del
  siguiente grupo; `sm:basis-auto` deja compartir fila en desktop.
  Nunca dejar que `flex-wrap` reparta chips "donde quepan" → filas ragged.
- Searchbar: `type="search"` + `inputCls`; `min-w-40 flex-1` en desktop,
  `basis-full` en mobile.
- En desktop todo puede compartir fila; en mobile son filas distintas —
  decidir el wrap por *grupo*, no por elemento.

## Toggles

- `button` + `aria-pressed` + cambio visual (activo: `bg-neon/15
  border-neon`); mismo estilo que los presets del FilterBar del catálogo.
- Copy corto: "En riesgo", no "Con alumnos en riesgo" — el chip ya
  comunica que es un filtro.

## Sort

- Select = **campo** solamente (Score/Facturación/Alumnos/Nombre), no
  pares asc/desc — eso duplicaba opciones.
- Dirección = botón aparte `↓`/`↑` (chevron que rota), `aria-pressed` +
  `aria-label` "Ascendente"/"Descendente".
- `flex-1` en mobile para que el select llene su fila junto al botón.

## Reglas

- Filtros sobre datos ya cargados → client-side, inmediato; no volver a
  pedir al endpoint.
- Entidad del catálogo `/query` → usar `FilterBar` data-driven
  (`console-patterns`), no reimplementar.
- Quitar filtros que no aportan decisión (menos ruido > más opciones).
