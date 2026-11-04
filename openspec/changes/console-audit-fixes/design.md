# Design: console-audit-fixes

## Componente compartido de expand

Se extrae el patrón de `series/[id]` a
`apps/web/src/components/ui/see-all-row.tsx`:

```tsx
export const LIST_PREVIEW = 5;
export function SeeAllRow({ total, expanded, onToggle }: {
  total: number; expanded: boolean; onToggle: () => void;
}) {
  const tc = useTranslations("common");
  if (total <= LIST_PREVIEW) return null;
  return (
    <li><button type="button" onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-center
      gap-1 px-4 py-2 text-sm font-medium text-neon transition-colors
      hover:bg-elevated focus-visible:outline focus-visible:outline-2
      focus-visible:-outline-offset-2 focus-visible:outline-neon">
      {expanded ? tc("showLess") : tc("seeAll", { count: total })}
    </button></li>
  );
}
```

- i18n: `common.seeAll` = "Ver todo" / `common.showLess` = "Ver menos"
  ya existen en los catálogos; `seeAll` acepta `{count}` interpolado
  (si la key actual no toma count, agregar variant `seeAllCount` —
  verificar y reutilizar lo que haya).
- Uso: `.slice(0, expanded ? undefined : LIST_PREVIEW)` + `<SeeAllRow/>`
  como último `<li>` dentro del `<ul>` de la sección.
- `series/[id]` migra al componente compartido (misma ficha queda como
  prueba de paridad visual).

## Decisiones tomadas (resueltas antes de implementar)

1. **ConsoleHeader universal**: se normaliza a "toda página de consola
   lleva ConsoleHeader" (lo que dice la skill literalmente). Se agrega
   a raíces que hoy lo omiten: `planes`, `promos`, `configuracion/niveles`,
   `analitica/usuarios`. Back → padre lógico (`/academia` para raíces
   del drawer, `/academia/configuracion`… ojo: `configuracion/page.tsx`
   es redirect → usar `/academia`). Esto revierte la micro-decisión
   "nivel 1 de sección sin header" de suscripción/config: se aplica el
   mismo criterio uniforme. En config sub-pages el back apunta a
   `/academia` salvo que exista una página índice real.
   - Alternativa descartada: documentar la excepción en la skill y
     quitarlo de `series` — más pérdida que ganancia (el back al hub es
     útil y barato).

2. **Videos sin ficha**: el video es un link externo sin entidad-ficha;
   crear `/videos/[id]` sería sobre-ingeniería. Se acepta excepción
   documentada: el delete inline queda pero gana `ConfirmSheet` (nunca
   destructivo sin confirmar). Se anota en el skill
   `console-patterns`.

3. **Cola PENDING de claims**: preview 20 (no 5) + "Ver todo" — es una
   cola de trabajo, el umbral sube vs LIST_PREVIEW default. Resueltos
   e historial: LIST_PREVIEW estándar.

4. **Preventas**: sección pendiente (INVITED) completa; resueltos
   (ACTIVE/DECLINED/DISABLED/cobrados) en historial con LIST_PREVIEW +
   expand. Sin filtro de status nuevo por ahora — la separación ya
   cumple el contrato de colas.

5. **Backend de encuestas por instructor**: `limit` de grupos
   (default 12, max 60) + cap de comentarios por grupo (50). La ficha
   usa preview 3 grupos + "Ver todo" (refetch con limit mayor o pagina
   sobre lo ya traído — implementación decide; preferir pedir
   `limit=60` de entrada y preview client-side para no duplicar
   lógica de paginación).

6. **Forbidden vs error**: discriminatorio por status HTTP en el catch:
   401/403/404 → estado "sin acceso"; resto → `role="alert"` + retry.
   Se aplica en fichas `claim/[id]`, `orden/[id]`, `pago/[id]` y en
   las secciones staff/instructor (que hoy mienten el empty). En
   `alumnos/[personId]` y otras fichas que ya tienen forbidden
   explícito solo se verifica paridad.

7. **Promos**: `PromosModule` y `PromoDetailModule` reciben `academyId`
   por prop (patrón `PlansModule key={academy.id}`) — elimina el
   `queueMicrotask`. `/nueva` vuelve al listado tras el ActionNotice.

8. **QueryTable drill**: la columna persona linkea a
   `/analitica/usuarios/[personId]` cuando la fila expone `personId`
   en el payload; sin cambios de endpoint si el id ya viene; si no,
   se agrega a la selección del runner como campo suplementario
   `personId` (sin exponerlo como columna).

9. **Niveles**: `/configuracion/niveles` queda como listado navegable;
   `/configuracion/niveles/nuevo` y `/configuracion/niveles/[id]`
   (editar + zona roja delete con ConfirmSheet). El 409 de "nivel en
   uso" del server se muestra vía ActionNotice.

10. **ThemeToggle**: `min-h-9` → `min-h-11` en la variante segmented —
    fix de componente compartido (también mejora el drawer).

11. **Import CSV**: tabla de resultados con preview 10 + expand (es
    transitoria; no amerita scroll container).

## Fuera de alcance (explícito)

- `asistencia`, `horarios`, `clases`, `particulares`, `academia/page`:
  secciones no auditadas en esta pasada — una próxima iteración.
- `rechazar` preventa sin ConfirmSheet: acción principal del estado,
  aceptado.
- Picker de persona en `alumnos/nuevo` (FK como texto): deuda v1
  documentada, requiere diseño de producto.
- `key={i}` en comentarios de encuestas: se arregla de paso si el
  archivo se toca, sino backlog.
