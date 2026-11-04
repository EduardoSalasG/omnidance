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

**Affordance de "se toca" en los tres medios**: el `<a>` nativo da
`cursor` pointer y `hover:border-neon/60` cubre desktop, pero mobile no
tiene hover — la señal permanente es `ChevronRightIcon
className="h-4 w-4 shrink-0 text-ink/40"` al final de la línea
principal: al filo derecho del headline en cards, al borde derecho en
filas navegables. Sin él una card estática y una clickeable son
indistinguibles al tacto. El `Link` lleva
`focus-visible:outline focus-visible:outline-2
focus-visible:outline-neon`.

```tsx
<Link href={`/productor/codigos/${c.id}`} className="block">
  <Card className="flex flex-col gap-2 transition-colors hover:border-neon/60">
    ...
    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
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
- **El header de entidad navega a editar** cuando la página de edición
  edita lo que el header muestra: el bloque de identidad es el `Link` a
  la página de editar, sin botón "Editar" suelto — tocar la entidad es
  el gesto natural. **El header va desnudo** (sin `Card`: la identidad
  de la página vive sobre el canvas como título tipográfico — Linear,
  GitHub, Stripe — y las cajas se reservan a las secciones de
  contenido; un card ancho con poco contenido se lee como banda
  vacía). Affordance del bloque-link: `group` en el `Link` +
  `group-hover:text-neon` en el título y
  `ChevronRightIcon h-4 w-4 shrink-0 text-ink/40
  group-hover:text-neon` al filo derecho del headline +
  `focus-visible:outline-neon`. Si el header contiene otros
  interactivos (botones de acción, inputs, edición inline) no se
  envuelve: se conservan las acciones explícitas. Si el form edita
  otra cosa (el header muestra la persona pero el form edita su
  acuerdo) el header no navega.
- Mutaciones de una fila (aprobar/rechazar un comprobante, agregar un
  invitado) viven en la ficha; la cola/listado solo navega.
- Mutaciones de estado de la entidad (desactivar/reactivar, publicar)
  no son links: botones fuera del card; en la ficha agrupan junto a la
  acción destructiva de la regla 4.

### 4. Destructivo = zona roja centrada al pie + `ConfirmSheet`

Delete/cancel/revoke NO va en el action row. Va en un `<div>` al
final de la ficha (no `<section>`: landmark sin nombre = ruido a11y),
separada con `border-t border-line pt-6`, centrada,
`variant="ghost"` + `text-red-400 hover:text-red-300`, siempre con
confirmación. La confirmación es `ConfirmSheet` de `components/ui`
(bottom-sheet mobile / modal desktop, focus trap + Escape + busy) —
nunca `window.confirm`, que bloquea el hilo, no atrapa foco y no
respeta el design system.

### 5. Chrome y jerarquía de título

- `ConsoleHeader backHref backLabel` al tope de TODA página de consola
  (listado, ficha, crear, editar) — deep-link safe, nunca `router.back()`.
  Es el único "volver" de la página: mientras el header está montado el
  chevron ‹ del appbar se suprime solo (`console-header-state.ts`) — en
  las demás rutas empujadas sin header el chevron sigue activo.
- **Un solo `h1` por página**. Las páginas de consola **no declaran `h1`
  propio**: el del appbar (nombre de la sección) es el de la página — el
  nombre de la entidad en una ficha va en `h2`. Si el contenido llegara a
  renderizar un `h1` (páginas consumer lo hacen), el label del appbar se
  degrada solo a texto plano — `MutationObserver` sobre `#contenido` en
  `BottomNav`, no requiere coordinación manual.
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

## Listas dentro de ficha: preview + "Ver todo"

Toda lista crecible dentro de una ficha (historiales, pagos, reservas,
miembros, códigos emitidos, resultados) se acota con
`LIST_PREVIEW` (=5, de `@/components/ui`) y se expande en la misma
ficha con `SeeAllRow` (`components/ui/see-all-row`): último `<li>` del
`<ul>` con botón `min-h-11 text-neon` que alterna
`common.seeAll (N)` / `common.showLess`. Uso:
`.slice(0, expanded ? undefined : LIST_PREVIEW)` + `<SeeAllRow total
expanded onToggle/>`. Colas de trabajo pueden subir el umbral vía
`preview={20}`. Prohibido: expands que duplican lo que la ficha ya
muestra y drill-down inline que debiera ser `Link` a ficha.

## Referencias canónicas

| Patrón | Implementación modelo |
|---|---|
| Listado + CTA + cards clickeables | `apps/web/src/app/(app)/productor/eventos/page.tsx` |
| Ficha con zona destructiva | `apps/web/src/app/(app)/academia/equipo/[id]/page.tsx` |
| Ficha con header desnudo navegable a editar | `apps/web/src/app/(app)/academia/series/[id]/page.tsx` |
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
