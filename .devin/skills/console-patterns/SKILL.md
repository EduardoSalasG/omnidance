---
name: console-patterns
description: Use when creating, auditing, or refactoring console pages in this repo (academia, productor, admin, venue, soporte) — listados, fichas, páginas de crear/editar, colas operativas o cualquier superficie role-gated de gestión.
---

# Console patterns

Patrón unificado de UX/flow/a11y para las consolas de gestión
(`/academia`, `/productor`, `/admin`, `/soporte`). Nació de la auditoría
de la consola del dueño de academia y su portado 1:1 a la del productor
(change `console-parity-v5`). Aplica a cualquier consola nueva.

## Las 6 reglas

### 1. Crear = CTA → página dedicada

Nunca un form inline en el listado ni un modal de alta. El listado
muestra `＋ Nuevo X` en `ConsoleHeader.actions` (y en el empty state) y
navega a `/modulo/nuevo`. La página de crear tiene `ConsoleHeader` con
back al listado y vuelve al listado tras el aviso breve de éxito.

### 2. Card completo clickeable → ficha

Todo item navegable del listado es `<Link className="block">` envolviendo
`<Card>` (o la fila completa si es una lista densa). Hover:
`transition-colors hover:border-neon/60`. **Sin elementos interactivos
anidados dentro del Link** — si el card necesita un link externo
(comprobante, evidencia) ese link vive en la ficha, no en el card.

```tsx
<Link href={`/productor/codigos/${c.id}`} className="block">
  <Card className="flex flex-col gap-2 transition-colors hover:border-neon/60">
    ...
  </Card>
</Link>
```

### 3. La ficha concentra datos + edición + acciones

- Datos en `<dl>` dentro de `Card` (dt = label `text-xs text-ink/50`,
  dd = valor con `tabular-nums` para números/fechas).
- Edición en la ficha o en página dedicada de editar — nunca en el
  listado (los selects/inputs de edición inline en cards están
  prohibidos; ver alumnos como ejemplo canónico).
- Referencias cruzadas son `<Link>` (alumno del plan → ficha alumno,
  evento del código → ficha evento, orden → su detalle).
- Mutaciones de una fila (aprobar/rechazar un comprobante, agregar un
  invitado) viven en la ficha; la cola/listado solo navega.

### 4. Destructivo = zona roja centrada al pie

Delete/cancel/revoke NO va en el action row. Va en una `<section>` al
final de la ficha, separada con `border-t border-line pt-6`, centrada,
`variant="ghost"` + `text-red-400 hover:text-red-300`, siempre con
confirmación (diálogo focus-trapped con `useDialogFocus`).

### 5. Chrome y jerarquía de título

- `ConsoleHeader backHref backLabel` al tope de TODA página de consola
  (listado, ficha, crear, editar) — deep-link safe, nunca `router.back()`.
- El appbar provee el `h1` único de la página. Las páginas **no declaran
  `h1` propio**: el nombre de la entidad en una ficha va en `h2`. Un
  segundo `h1` (aunque sea `sr-only`) rompe la jerarquía.
- `BackLink` ad-hoc quedó deprecado en consolas → `ConsoleHeader`.

### 6. Estados explícitos y accesibles

- Loading con estructura: `SkeletonList`/`SkeletonCard` (nunca
  `<Spinner>` desnudo a nivel panel).
- Error con `role="alert"` + botón retry que re-dispara el fetch.
- Éxito/progreso con `role="status"` (o `aria-live="polite"` en zonas
  de avisos). **Nunca `role="status"` para errores.**
- Empty state: mensaje + CTA cuando aplica; con filtros activos,
  `query.empty` y se conserva el FilterBar para limpiar.
- Forbidden: un deep link sin permiso muestra el estado "sin acceso"
  con CTA de salida — nunca página en blanco.
- Touch targets ≥ `min-h-11`; inputs con `aria-label` o `label`
  asociado; `focus-visible` visible.

## Listados: contrato compartido

- `FilterBar` + `EntityDef`/`QueryFilters` de `@omnidance/shared` — el
  mismo vocabulario de filtros que `/analitica` (spec
  analytics/query-console). No inventar selects ad-hoc si la dimensión
  ya existe en el catálogo.
- `Pager` compartido sobre el envelope `{items,total,page,pageSize}`;
  `pageParams` normaliza en el API (page=1, size=25, max 100/200).
- Colas operativas (comprobantes): fila → ficha; la cola no muta.
  Sin filtro de status la vista es cola PENDING + historial resuelto
  acotado; con filtro explícito es listado paginado.

## Acceso

- Gate de página: `AcademyGate` / `ProducerGate` / checks derivados de
  `useMe()` — nunca listas de roles ad-hoc; el backend refuerza con
  `@RequirePermissions` (RBAC DB-driven).
- El gate tiene sus propios estados: loading → skeleton; unauth →
  CTA login; notProducer/forbidden → mensaje + CTA de salida; error →
  `role="alert"` + retry.

## Referencias canónicas

| Patrón | Implementación modelo |
|---|---|
| Listado + CTA + cards clickeables | `apps/web/src/app/(app)/productor/eventos/page.tsx` |
| Ficha con zona destructiva | `apps/web/src/app/(app)/academia/equipo/[id]/page.tsx` |
| Ficha de cola con acciones | `apps/web/src/app/(app)/academia/cobros/claim/[id]/page.tsx` |
| Cola que solo navega | `apps/web/src/components/producer/claims-queue-section.tsx` |
| Página de crear | `apps/web/src/app/(app)/productor/codigos/nuevo/page.tsx` |
| Endpoint de ficha | `GET /producer/claims/:claimId` (producer-claims.controller.ts) |

## Verificación al terminar

1. `npx tsc --noEmit` en web.
2. `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
3. `impeccable detect --json` sobre el diff → `[]`.
4. Una pasada a11y: un solo `h1`, roles aria correctos, foco visible,
   navegación por teclado completa.
