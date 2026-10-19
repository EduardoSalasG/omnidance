# UI/UX Principles — omnidance

Checklist operativo de principios de diseño traducidos a los tokens y
componentes de este repo (`components/ui`, Tailwind tokens, dark-first,
mobile-first). Complementa — no reemplaza — `console-patterns`
(estructura de páginas de consola), `impeccable` (dirección + polish) y
`apple-design` (motion física, tipografía óptica).

Regla base: **diseñar para el escaneo, no para la lectura**. El usuario
no lee la UI; busca el dato que decide su acción.

## Skills por componente (aplicar además de ésta)

- `ui-cards` — anatomías de card: arquetipo A (lectura/métrica) y
  arquetipo B (rail de decisión); cuándo usar cada uno.
- `ui-lists` — filas de lista, tablas, drill-down, estados
  empty/error/carga.
- `ui-filters` — barras de búsqueda/filtro/orden, toggles, sort.

La skill evalúa principios (jerarquía, proximidad, affordance, ritmo),
**no impone layout** — el arquetipo se elige según la tarea del usuario.

## 1. Agrupar antes de decorar (proximidad Gestalt)

Información relacionada va en la misma línea o bloque; grupos distintos
se separan con espacio, no con bordes. Señal de que falta agrupación:
un card con 5+ renglones del mismo peso visual.

- Comprime metadatos relacionados en una línea con `·` u otro separador:
  `nombre` + `email` + `intent` en una fila truncada, no tres renglones.
- Espaciado: `gap`/`divide-y divide-line` dentro del grupo, `gap-6` o más
  entre secciones de página. Más aire **arriba** de un título que abajo.
- Anti-patrón: separar elementos relacionados con `<br>`/márgenes iguales
  en todas direcciones — sin agrupación no hay jerarquía posible.

## 2. Jerarquía de 3 niveles — decide qué manda

Toda card/sección tiene exactamente tres rangos: **primario** (el dato
que decide la acción), **secundario** (contexto), **terciario**
(metadatos). Nunca dos primarios.

Nuestros rangos canónicos:

- **Primario**: `text-sm`/`text-base font-semibold` o monto
  `tabular-nums` — el nombre del actor, el monto, la métrica.
- **Secundario**: `text-xs`/`text-sm text-ink/60` — email, evento, fecha.
- **Terciario**: `text-[11px]`/`text-xs text-ink/40` — hints, desgloses.

En `KpiCard`: label `text-xs text-ink/50` → valor `text-lg font-semibold`
→ hint `text-[11px] text-ink/40`. Squint test: si al entrecerrar los ojos
todo pesa igual, falta jerarquía.

## 3. Proximidad funcional — acerca lo que decide

Los elementos que se consumen juntos van juntos: badge de status **junto
al monto** (no al otro extremo del card), acción principal **adyacente**
al dato que la motiva, rating junto al nombre. En filas de lista el
bloque derecho (`flex shrink-0 items-center gap-2`) es la zona de
valor+status+acción — no repartirlos.

## 4. Affordance — lo interactivo se ve interactivo

- Navegable → `Link` con `hover:bg-elevated` (o `hover:border-neon/60` en
  Card) + `focus-visible:outline` visible + `min-h-11` (44px) de touch
  target. `cursor-pointer` implícito vía `<a>`/`<button>`, nunca un div.
- Acción → `Button` (no texto suelto); destructivo en zona confirmada al
  pie (`ConfirmSheet`, nunca `window.confirm`).
- Chips/filtros togglables → `button` con `aria-pressed` + cambio visual
  de estado (borde `neon` + `bg-neon/10`), no solo color.
- Anti-patrón: texto con `hover:` que no hace nada; underlines que no son
  links.

## 5. Color = semántica, no decoración

- `neon` = primario/activo/atención-acccionable (KPIs que "gritan",
  badges ACTIVE, foco). No usar neon decorativo.
- `text-ink/N` escala de tinta es la jerarquía: `/50` labels,
  `/60` secundario, `/40` terciario.
- Estados vía `Badge` variants (`neon` = activo/ok, `outline` = neutro);
  un color nunca cambia de significado entre páginas.
- Comparativas: verde `text-green-400` sube / rojo `text-red-400` baja /
  `text-ink/50` neutro — deltas siempre **fuera** del chip.

## 6. Tipografía y scanabilidad

- UNA familia; jerarquía por tamaño/peso, no por fuentes.
- Cifras siempre `tabular-nums` (alinean entre filas).
- Truncate con `truncate`/`min-w-0` — nunca wrap que rompa la fila
  (excepción: identidad primaria como nombre de academia puede envolver).
- Enums/nunca crudos en UI: `TICKET` → `Entrada` vía
  `useTranslations(...).has(\`orderTypes.${s}\`)` + fallback.
- **i18n**: en español los meses van en minúscula ("octubre 2026", no
  "Octubre"); respetar `useDateFmt`/`useNumFmt` (CLP sin decimales).
- Copy de empty/error states: corto, verb-first ("Sin transacciones con
  estos filtros"), no párrafos.

## 7. Espacio en blanco = respiración

- **Contenedor de página obligatorio**: toda página de consola devuelve
  su contenido dentro de
  `<main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">`
  — nunca un fragmento pelado. Sin él no hay margen lateral, ni padding
  superior, ni ritmo `gap-6` entre secciones (incluye los returns de
  error/carga, no solo el camino feliz).
- Padding generoso (`p-4`/`p-5` en Card, `p-6` en secciones) y separación
  generosa entre secciones (`gap-6` en el contenedor de página). Si una
  superficie se siente "apretada", falta espacio — no decoración.

## La técnica de 3 pasos (cards que no se ven planas)

1. **Agrupa** — combina info relacionada en líneas/bloques (5 renglones
   → 2).
2. **Jerarquiza** — elige el dato que decide y hazlo primario; lo demás
   baja un rango.
3. **Acerca** — mueve junto lo que se decide junto (status↔monto,
   rating↔nombre, dato↔acción).

Resultado esperado: tres niveles legibles de un vistazo, el ojo sabe por
dónde empezar.

## Al aplicar

- Antes de editar UI: `impeccable context` + `craft-floor.md` si el
  launcher está disponible (ver AGENTS §Interfaz).
- Al terminar: `impeccable detect --json <targets>` sobre el diff.
- A11y no negociable: un `h1` efectivo por página (via ConsoleHeader),
  `aria-label` en secciones, `role="alert"` en errores, focus visible.
- **Itera con el usuario viendo el render** — soluciones correctas en
  papel se ven mal renderizadas; validar ópticamente en pantalla.
