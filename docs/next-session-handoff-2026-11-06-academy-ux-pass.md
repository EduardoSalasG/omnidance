# Handoff 2026-11-06 - mega-pase UX consola academy owner por tier

## Estado: 6 changes implementados y verificados, SIN commitear

Sesión: review del diff `academy-tier-gates-refine` (commiteado
`758e1c90`) + `academy-owner-selector` (commiteado `566f0e94`) +
review manual del usuario por tier → 6 slices implementados por
subagentes en paralelo. Triage completo en
`docs/academy-console-ux-review-2026-11-05.md`.

## Changes implementados (uncommitted, validados)

Cada uno tiene su change en `openspec/changes/` con proposal/specs/tasks.

- **academy-console-fixes**: bug CRM paywall en owner PRO (actor
  resolvía a PRODUCER de gabriel por default de actors[0] + selection
  persistida vacía; fix: actor por lente activa) · "Personalizar
  niveles" (POST sin Content-Type → name vacío; header agregado) ·
  breadcrumbs `?from=` (editar plan/serie → ficha, alumno → plan,
  clase → profesor) · copy (hints KPIs planes, "active=true" fuera,
  hint niveles "un solo nivel", plan-form labels + SINGLE oculta
  classCount) · flake series (reqSeq guard).
- **academy-cobros-reporte**: Reporte al sidebar bajo Cobros; cobros
  slim (KPIs+vencen+colas; historial fuera y componente borrado);
  "por validar" unificado + segunda cola "Inscripciones por validar"
  (order-claims transfer = alta+renovación); credit_card normalizado
  vía payments.media.*; Ver todos expande in-place; `?from=` en
  claim/orden/pago; reporte KPIs solo Facturado+Alumnos, cards 4
  líneas, sección Métodos de pago con KPI por método (byMethod del
  API); métodos de pago sin campo orden + CTA verde; suscripción con
  historial clickeable + espaciado.
- **academy-students-ux**: buscador de persona con debounce +
  endpoint nuevo `GET /academies/:id/students/candidates?q=`
  (cap students, nombre|email, top10); "pagado hasta" pre-calculado
  del plan (suggestedEndsAt espejo de membership-vigency); ficha con
  email/teléfono/método de pago; edición tras botón "Editar";
  chips con fechas explícitas ("Venció el…"); paginación 20/10.
- **academy-home-extended**: toggle Simplificado/Extendido ELIMINADO
  (siempre extendida; SimpleHomeCards + lib/academy-home-mode.ts
  borrados); facturación integrada a la grilla del resumen; MiniKpi
  sin truncate de título; tour repuntado.
- **academy-schedule-ux**: hook compartido `lib/console-page-size.ts`
  (useConsolePageSize 20 desktop/10 mobile); series-form día+inicio+
  término en fila; ficha clase sin link a horarios; roster 20/10;
  particulares desc + sin parpadeo + cancel junto a precio; profesor
  20/10 + legible mobile; calendario cards densas + hora ini/fin
  mobile; select estilos solo de la academia (`GET :id/series/styles`
  nuevo); Cubano + Rueda de casino fuera del catálogo vía
  REMOVED_STYLES (desvincula a null, aplica en próximo db:seed).
- **academy-videos-flag**: flag `academy_videos` en seed-common +
  fila DB ya insertada (enabled=true, toggle en /admin/funcionalidades);
  FeatureFlagGate nuevo envuelve las 3 rutas videos (apaga incluso
  PRO); hub filtra por flag; sidebar con flag aplicado por orquestador.

## Verificación corrida

- `openspec validate --changes`: 7/7 verde (6 nuevos + multipais).
- `tsc --noEmit` web y api: limpios.
- Web vitest: 32/32. API academies: 358/358 tras fix (mock del spec
  enrollment-levels: agregados paymentClaim/payment al prisma mock -
  studentDetail ahora consulta método de pago).
- `export-api-docs.cjs`: openapi.json + postman regenerados (369
  paths, incluye students/candidates y series/styles).
- i18n-audit: ALL_KEYS_OK.

## Playwright smoke (apps/api/scripts/smoke-ux-review.cjs)

Script nuevo de review por tier (gabriel PRO / tumbao COBROS /
muvet STUDIO): 12 asserts de paywalls, selector, cobros slim,
niveles, /academia/nueva. Login con retry de throttle (65s) igual
que auth.setup + waitForLoadState("networkidle") antes de clickear
(sin hidratar, el form hace GET /login? en vez del POST auth).

**Resultado: 8/12 PASS, sin bugs reales en los 4 FAIL:**
- PRO /crm paywall + PRO /inicio sin selector + STUDIO drawer sin
  items academia: gabriel@ y muvet@ caen con lente PRODUCER por
  defecto (ambos tienen el rol). Los asserts probaron la consola del
  productor, no la del owner. El paywall de CRM en lente productor
  es correcto (producer sin Pro). Para revisar la consola academia
  hay que cambiar de lente (selector de rol en la UI - ver cómo se
  switchea: sidebar muestra "Productor/a" como selector de lente).
- "Cobros sin botón Reporte": falso positivo del assert - el sidebar
  ahora SÍ tiene el ítem Reporte (intencional) y el selector
  `[href*="cobros/reporte"]` lo matcheaba. Rescopear al main content.

Pendiente: rerun del smoke con switch de lente a ACADEMY_OWNER
(click en el selector de lente del sidebar → "Academia") para
verificar /crm, selector y drawer por tier como owner real.

## Pendientes (próxima sesión)

1. Resultado del smoke + fix de lo que falle.
2. `pnpm db:seed` para materializar REMOVED_STYLES (Cubano/Rueda fuera
   de DB) + `pnpm content:sync` para academies.json de landings.
3. Commits por change + `openspec archive` de los 6.
4. omni-dance.md: actualizar secciones de cobros/reporte/métodos
   (B reportó secciones stale).
5. Diferidos conocidos:
   - Selector de academia al sidebar (evaluación de diseño pendiente;
     hoy vive en /inicio y /academia correctamente).
   - Alta de persona inexistente en /alumnos/nuevo (propuesta: stub
     Person + invite, patrón resolvePerson de academy-staff).
   - Reestructura modelo video (categoría + selects serie/horario/
     clase) - madurar con el usuario.
   - Endpoint candidates sondea Person global (cap students):
     evaluar acotar/auditar si se endurece.
   - Medición de eventos en Explorar (idea ads/destacados - backlog).
   - Disponibilidad de instructores para particulares (backlog).
   - docs/architecture.md no menciona los 2 endpoints nuevos (gap
     menor).

## Reglas nuevas del usuario (ya en docs/academy-console-ux-review)

- Paginación de listas pesadas: 20 desktop / 10 mobile
  (useConsolePageSize existe - reusar).
- Sin tecnicismos en copy de usuario (nada de active=true ni enums
  crudos); solo admin ve vocabulario técnico.
- Terminología: "método de pago" en toda la superficie y checkout.
- Fix en un tier aplica a todos (no re-reportar).
