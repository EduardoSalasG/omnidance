# Auditoría consola academia (pasada B) — secciones restantes

Cubre las secciones que quedaron fuera de `console-audit-2026-11-04.md`:
asistencia, horarios, clases (incl. series), particulares y el hub
`/academia`. Ejecutada con 5 agentes read-only paralelos calibrados
contra `.devin/skills/console-patterns/SKILL.md`.

Contexto descubierto: `/academia/asistencia` y `/academia/horarios` ya
no son páginas (redirects a `/academia/series`); sus superficies
efectivas viven en clases/series. El roster `clases/[id]` y la ficha de
horario ya habían sido alineados en la sesión anterior.

## Bloqueantes (2)

| # | Ubicación | Bug | Fix |
|---|---|---|---|
| B1 | `series/[id]/page.tsx:245-262` | `remove()` sin `finally`: DELETE fallido deja `busy=true` → todos los botones de la ficha disabled hasta recargar | `try/finally { setBusy(false) }` |
| B2 | `horarios/[slotId]/page.tsx:146-170` | `save()` sin try/catch: apiFetch que rechaza = unhandled rejection + busy eterno sin ActionNotice | try/catch/finally como `remove()` |

## Gaps por sección

### Hub `/academia`

- `use-academy-access.ts:38-41` + `page.tsx:117`: error de
  `GET /:id/access` colapsa a `null` → staff/instructor ve el hub sin
  ModuleGrid, sin error ni retry (rama `operational` muerta).
- `academy-gate.tsx:142-149`: estado `error` del gate sin
  `role="alert"` (transversal: afecta toda página con AcademyGate).
- `academy-dashboard.tsx:615-631` (MiniKpi): hint sin `title` ni en
  `aria-label` compuesto; hover `/40` vs `/60`.
- `academy-dashboard.tsx:669,749`: filas navegables (hoy/cumpleaños)
  sin chevron; `ExpiringList` sí lo tiene.
- `academy-kpi-strip.tsx:219-224`: deltas `text-neon/80`/`text-warn` vs
  `text-green-400`/`text-red-400`/`text-ink/50` de la skill (el archivo
  es el modelo citado por la skill: corregir propaga el estándar).
- `academy-levels-card.tsx:824-906`: slot cards sin affordance ni
  focus-visible (`display:contents` en `<a>`); variante compact no
  navega; fallback del link a `/academia/alumnos` arbitrario → debe ir
  a la ficha del slot.
- `academy-dashboard.tsx:540-571` (SimpleHomeCards): computa
  `unassignedTotal`/`freeSpotsToday`/`pendingToday` + props
  `canClasses`/`expiringHref` sin uso: regresión o código muerto.

### Horarios

- `horarios/[slotId]/page.tsx:87`: `useSearchParams()` sin boundary
  `<Suspense>` (las hermanas sí lo envuelven).
- `horarios/[slotId]/page.tsx`: `ConsoleHeader` solo en estado ready;
  falta `AcademyTierGate feature="classes"` (hermanas lo montan).
- `series/[id]/page.tsx:434`: filas de slot sin `focus-visible`.
- Menores: `grid-cols-3` fija (inputs ~88px a 320px), copy notFound
  dice "Serie" para un slot, busy texto, rama `kind:"slot"` muerta en
  el ConfirmSheet de la serie, `role="alert"` compartido
  forbidden/notfound.

### Clases / series

- `series/page.tsx:196-198`: empty sin CTA crear; no distingue filtros
  activos; `!res.ok` → error genérico (403 colapsa).
- `series/[id]/page.tsx:310-320`: 404 muestra copy de "empty" con retry
  inútil (existe `academySeries.notFound` sin usar).
- `series/[id]/page.tsx:172-179`: fetch de clases traga el error →
  "Sin próximas"/"Sin historial" falsos (mismo bug que los bloqueantes
  de cobros del audit A).
- `clases/[id]/page.tsx:126-130`: forbidden/notfound sin CTA de salida.
- `teaching-classes.tsx:154-190`: cards clickeables sin chevron.
- `teaching-classes.tsx:113-115`: forbidden sin CTA.
- Transversal "busy como texto": `clases/[id]:426` (Marcar presente),
  `series/[id]:516`, `series-form:556-559`.
- `clases/[id]/page.tsx:336-354`: `markPresent` éxito sin ActionNotice.
- Dead code: `useMemo` sin uso (`series/page:3`), rama `kind:"slot"` +
  `removeSlot` (`series/[id]`), state+fetch `instructors` sin
  consumidor (`series/[id]:135,192-211`), cast
  `series.instructors` no declarado en `shared.ts`.
- `series/[id]:266-270`: `nsStart >= nsEnd` muestra error genérico de
  server; falta key `invalidTimeRange`.
- Edge `seriesId=null`: back del roster a `/academia/clases` redirige
  al owner a `/inicio` → fallback a `/academia/series`.

### Particulares

- `private-lessons.tsx:376-387`: error sin `role="alert"`.
- `particulares/page.tsx` + `academia/page.tsx:34` +
  `private-lessons.controller.ts:178`: deep-link de instructor puro ve
  el listado completo de particulares ajenas (el hub oculta el módulo
  pero la página no gatea; API `requireManage` acepta instructor).
- `private-lessons.tsx:389-390`: empty sin `tq("empty")` con filtros.
- Menores: acciones sin Spinner inline, `useMessages()` cast (bypass
  i18n-audit), catch silencioso del roster de instructores, prop
  `academies` muerta, `;` suelto, `shortId` duplicado, keys i18n
  muertas en `academyExtras.lessons`, forms assign/reschedule inline en
  card (excepción a documentar: no existe ficha).

### Asistencia (redirect)

- `asistencia/page.tsx:9`: redirect a `/academia/series` (superficie
  owner): un instructor con deep-link viejo cae en módulo que le
  responde 403 → error genérico. Evaluar redirect a `/academia` (hub
  resuelve por lente).

## Menores transversales

- `academy-gate.tsx` error sin `role="alert"` (todas las páginas).
- Chips `min-h-8`/`px-2 py-0.5` < min-h-11 (`academy-levels-card:613`,
  `academy-visibility-card:86`).
- `module-grid.tsx:40`: `aria-label="Módulos"` hardcodeado.
- `academy-dashboard.tsx`: error de fetch duplicado en modo Extendido;
  landmarks `aria-label` repetidos; `;` huérfanos; checklist rows sin
  chevron; "Operación del día" sin reserva de espacio (pop-in).
- `academy-gate.tsx:151-161`: `empty` muestra CreateAcademyForm aun
  cuando `canCreate === false`.
- `instructor-checklist.tsx:28`: `role="group"` sin nombre accesible.
- `series-insights.tsx:84-99`: filas rank navegables sin chevron.
- `survey-results.tsx:61`: modo seriesId sin `limit` en la query.
- `series/nueva/page.tsx:104-106`: Suspense fallback en blanco;
  notFound sin CTA propio.
- `series-form.tsx`: drafts sin validación `startTime < endTime`.
- `clases/[id]/page.tsx`: links de nombre < min-h-11; `SlotCupos`
  error sin retry.

## Decisiones tomadas al implementar

- Roster back: gestión → ficha de la serie (canon confirmado, el audit
  de clases lo dudó: la serie es el padre canónico del roster).
- `markPresent` emite ActionNotice: la excepción de ~5s es del flujo
  en pista (scanner), no del roster de consola.
- Excepción documentada: forms assign/reschedule inline en cards de
  particulares (no existe ficha; son acciones por fila permitidas).
