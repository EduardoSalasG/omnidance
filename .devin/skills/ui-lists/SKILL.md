# UI Lists — omnidance

Patrones de filas, listas y tablas — complementa `ui-ux-principles`
(principios generales, léela primero) y `console-patterns` (FilterBar,
Pager, estados de página completa).

## Fila de lista (reading row)

```
Nombre / título primario          status-chip   valor tabular
```

- `flex min-h-11 items-center gap-3 px-4` — 44px touch target mínimo.
- `divide-y divide-line` dentro de `Card p-0` — separación por
  construcción, no por márgenes ad-hoc.
- Contenido izquierdo `min-w-0 flex-1 truncate`; zona derecha
  `flex shrink-0 items-center gap-2` lleva valor+status+acción juntos
  (proximidad funcional) — nunca repartidos a los dos extremos.
- Navegable → `<Link>`/`hover:bg-elevated` en la fila; lectura → `div`.
  Nada interactivo anidado dentro de una fila-link.

## Estados de lista

- **Empty**: texto corto verb-first (`text-sm text-ink/50`), no párrafo:
  "Sin clases agendadas." — y si la lista viene de un filtro, decirlo:
  "Sin academias que coincidan con el filtro."
- **Error**: `role="alert"` + `Button` retry (nunca auto-retry infinito).
- **Carga**: `SkeletonList` con layout anticipado, nunca spinner desnudo.

## Tablas / grillas

- Cifras `tabular-nums` — columnas rectas entre filas.
- Etiqueta-izquierda / valor-derecha en fichas: `dl` + `divide-y divide-line`,
  label `text-xs text-ink/50`, valor `text-sm` truncable.
- Deltas comparativos: `+N (+X%)` **fuera** del chip, color verde
  (`text-green-400`) / rojo (`text-red-400`) / neutro (`text-ink/50`).

## Drill-down

- La fila resumen no repite lo que la ficha ya detalla — eliminar
  duplicados (el expand que solo repetía la lista se eliminó).
- El drill real es el Link a la ficha del actor
  (`/admin/usuarios/[id]`, `/admin/academias/[id]`).
