# Modelo de orquestación multi-agente

Análisis pedido por `docs/audit-briefs/analyze-orch.md`: evaluar la
propuesta de agrupar implementadores paralelos en pods de 2-3 con un
agente revisor/intermediario por pod que consolide el reporte al main.

El documento se escribe por mitades (briefs
`docs/audit-briefs/analyze-superpowers.md` y
`docs/audit-briefs/analyze-openspec.md`). Esta versión contiene las
secciones de orch-A: "Prior art: superpowers" y "Estado actual en
omnidance". Las secciones "Prior art: openspec + topologías" y "Modelo
recomendado" las aporta orch-B.

## Prior art: superpowers

Fuente: skills en `C:\Users\salas\.agents\skills\`
(`using-superpowers`, `dispatching-parallel-agents`,
`subagent-driven-development`, `executing-plans`,
`requesting-code-review`, más los templates
`implementer-prompt.md`, `task-reviewer-prompt.md`,
`re-review-prompt.md`, `code-reviewer.md`). Las citas son
`<skill>/<archivo>:<líneas>`.

### Topología canónica: estrella plana, sin agentes intermediarios

Un solo controlador despacha hojas; los workers **nunca** despachan
subagentes. El contrato aparece en todos los templates:
`using-superpowers/SKILL.md:6-8` (SUBAGENT-STOP),
`subagent-driven-development/implementer-prompt.md:51-60`,
`subagent-driven-development/task-reviewer-prompt.md:55-62`,
`requesting-code-review/code-reviewer.md:37-44`. La razón es de costo:
cada reviewer que un worker genera duplica un asiento de review que el
controlador ya tiene programado
(`subagent-driven-development/SKILL.md:272-277`).

No existe en el canon ningún "pod lead", agregador-agente ni jerarquía
de dos niveles. La capa intermedia entre controlador y workers la
juegan **artefactos**, no agentes (ver más abajo).

### Fan-out: cuándo paralelo y cuándo serie

- `dispatching-parallel-agents` es la skill de fan-out: un agente por
  dominio independiente, despachados en el mismo turno para correr en
  paralelo (`dispatching-parallel-agents/SKILL.md:66-77`). Condición
  dura: sin estado compartido; si los trabajos se tocan, van en serie
  (`SKILL.md:36-46,129-134`). Su ejemplo canónico son 3 agentes sobre
  3 archivos de test distintos (`SKILL.md:136-159`).
- `subagent-driven-development` (SDD), la skill de ejecución de planes,
  prohíbe escritores paralelos: "Never dispatch multiple
  implementation subagents in parallel (conflicts)"
  (`SKILL.md:282`). En el canon, el paralelismo vive en investigación
  y review; la escritura es serial sobre el mismo working tree.
- Técnica de reducción de fan-out: cuando varias tareas son ediciones
  mecánicas de la misma forma, se componen en UN solo dispatch con la
  lista de archivos y se revisan como unidad (`SKILL.md:223-229`).
- `executing-plans` es el fallback sin subagentes: ejecución
  secuencial del propio agente con checkpoints al humano y
  stop-and-ask ante blockers
  (`executing-plans/SKILL.md:40-49,56-64`). Postura opuesta a la de
  SDD, que manda resolver sin frenar ("rulings, not stalls",
  `subagent-driven-development/SKILL.md:19-31`).

### Review e integración: el "intermediario" existe pero es un asiento par, no un supervisor

- **Reviewer por task** con doble veredicto: spec compliance Y
  calidad; ambos son gate (`SKILL.md:308-314`). Recibe tres archivos
  (brief, report del implementador, diff package) más las constraints
  globales verbatim (`SKILL.md:325-334`;
  `task-reviewer-prompt.md:21-47`). Trabaja read-only y no re-corre
  tests que el implementador ya reportó
  (`task-reviewer-prompt.md:52-53,73-82`).
- **Fix loop acotado**: máximo 5 rondas por task. Rondas 1-3 se
  resume al implementador original (su contexto sigue vivo); rondas
  4-5 van a un implementador fresco con modelo más capaz
  (`SKILL.md:372-386`). Cada ronda cierra con re-review scoped sobre
  el diff del fix, nunca sobre todo el task (`SKILL.md:396-403`).
  Al quinto round sin converger, el controlador adjudica finding por
  finding y registra el ruling en el ledger (`SKILL.md:411-429`).
- **Review final whole-branch** en el modelo más capaz disponible
  (`SKILL.md:445-456`). Si deja findings, UN solo fixer recibe la
  lista completa: "a real session's final-review fix wave cost more
  than all its tasks combined" cuando se despachó un fixer por
  finding (`SKILL.md:458-464`).
- El controlador **nunca** arregla findings él mismo: contamina su
  contexto y evade review (`SKILL.md:408-409`).
- Por qué el reviewer es un agente y no un paso inline: "reviewing the
  diff inline burns the context window you need to keep driving the
  work" (`requesting-code-review/SKILL.md:79`). El asiento reviewer
  existe para proteger el contexto del controlador, no por falta de
  capacidad.

### La agregación real la hacen archivos: ledger, briefs, reports, packages

Esto es lo más cercano que tiene el canon a un "agente intermediario",
y resuelve exactamente el problema del orquestador que lee de a uno:

- **Ledger por plan** (`progress.md` en workspace git-ignored):
  sobrevive compaction; re-despachar tareas ya completadas fue "the
  single most expensive failure observed" (`SKILL.md:131-154`).
- **Task briefs** extraídos a archivo: el brief es la única fuente de
  requisitos; los valores exactos van solo ahí; prohibido pegar
  historial de tareas previas en el dispatch (`SKILL.md:251-271`).
- **Report files**: el implementador escribe el reporte completo a
  disco y devuelve un contrato de menos de 15 líneas (status, commits,
  resumen de tests, concerns)
  (`SKILL.md:263-267`; `implementer-prompt.md:128-149`).
- **Review packages**: el diff sale a un archivo que nunca entra al
  contexto del controlador (`SKILL.md:316-327`). Regla general:
  "everything you paste into a dispatch prompt ... stays resident in
  your context" → "Hand artifacts over as files" (`SKILL.md:231-233`).

### Espera y bloqueo (lo que el brief reporta como problema)

SDD prescribe contra el bloqueo en el más lento: nunca polling con
timeouts cortos ni una espera silenciosa e indefinida; trabajar en
local mientras corren los hijos; esperas acotadas de 5-10 minutos;
entre tramos, una línea de estado y reconciliación de hijos vivos
("chase any that finished without reporting")
(`SKILL.md:235-244`).

### Selección de modelo por rol

`SKILL.md:184-219`: mecánico → modelo barato; integración/juicio →
estándar; review final → el más capaz; el modelo siempre explícito en
el dispatch (si se omite hereda el más caro). "Turn count beats token
price": el piso es mid-tier para reviewers y para implementadores que
trabajan desde prosa.

### Síntesis para evaluar pods+revisor

- El canon ya resuelve el fan-in (lectura de N reportes) con
  reportes-a-archivo + retorno ≤15 líneas + ledger, no con un agente
  consolidador. Un pod-reviewer que consolida sería un rol nuevo, no
  prior art superpowers.
- El asiento reviewer sí existe y es gate por task, pero lo despacha
  el controlador como par del implementador; no supervisa un grupo ni
  "hace corregir" por su cuenta: correcciones = resume del
  implementador o implementador fresco, siempre despachados por el
  controlador.
- Lo que pods agregaría de verdad nuevo es **escritura paralela**, que
  el canon prohíbe por conflictos (`SKILL.md:282`). La pregunta para
  este repo es si la partición por scopes disjuntos neutraliza esa
  objeción (la práctica reciente sugiere que sí; ver siguiente
  sección).

## Estado actual en omnidance

### Modelo escrito (`AGENTS.md` §"Orquestación multi-agente", líneas 123-135)

1. Orquestador retiene el contexto pesado (handoff, grafo Codebase
   Memory, change OpenSpec completo) y resuelve toda ambigüedad antes
   de despachar (`AGENTS.md:127`).
2. Detección de choques previa: archivos compartidos se secuencian o
   los integra el orquestador; migraciones de DB solo por el
   orquestador, una a la vez (`AGENTS.md:128`).
3. Implementadores **en serie** sobre el mismo working tree; en
   paralelo solo investigación read-only, reviews o scopes 100%
   disjuntos (`AGENTS.md:129`).
4. Reviewer subagente por task con doble gate (spec + calidad)
   (`AGENTS.md:130`).
5. Integración del orquestador: diffs, typecheck/tests, archivar
   change, regenerar docs API, handoff; el implementador commitea su
   task y nunca pushea (`AGENTS.md:131`).
6. Excepción de tamaño: tweaks de 1-2 archivos los hace el orquestador
   directo (`AGENTS.md:133`).

Es el canon SDD adaptado: misma estrella plana, mismo gate de review,
misma prohibición de escritores paralelos.

### Práctica real reciente (evidencia de handoffs)

- **`academy-console-views-polish`** (2026-11-04): 8 agentes devin en
  paralelo vía herdr (panes `polish-*`), coordinados por un brief
  compartido `docs/polish-brief.md`; verificación integrada por el
  orquestador (`tsc --noEmit` + i18n)
  (`docs/next-session-handoff-2026-11-04-console-polish.md:28-33`).
- **`console-audit-fixes`** (2026-11-04): auditoría con 7 agentes
  (`docs/console-audit-2026-11-04.md`) y luego 6 implementadores
  paralelos de scopes disjuntos + 1 para API query; gate del
  orquestador = tsc web/api + `i18n-audit` + vitest
  (`docs/next-session-handoff-2026-11-04-audit-fixes.md:8-20`).
- **Mecánica herdr documentada**: `tab create` / `agent start --kind
  devin` / `agent prompt` / `agent read` / `agent wait`; `send-keys`
  desbloquea diálogos de permiso; los estados "done/idle" de `agent
  list` son prematuros (`agent read` muestra el estado real); los
  devin hijos heredan las skills del repo
  (`next-session-handoff-2026-11-04-console-polish.md:37-44`).
- **Contrato de dispatch vigente**
  (`docs/audit-briefs/_impl-common.md`): jerarquía de autoridad
  (design.md y tasks.md del change → skills → doc de hallazgos →
  patrón canónico citado con líneas, `:5-13`); reglas duras:
  prohibido ejecutar git (`:17-18`), prohibido tocar archivos fuera de
  scope porque "otros agentes trabajan en paralelo sobre el mismo
  árbol" (`:19-20`), i18n acotado a los part-JSON propios con
  `common.json` vetado (`:21-24`), reuso obligatorio del design
  system (`:29-31`), auto-verificación `tsc --noEmit` + reporte
  escrito con archivos/decisiones/pendientes (`:32-34`). Mismo patrón
  del lado read-only: `_common.md` + `audit-<sección>.md` por agente
  con checklist y formato de output (`docs/audit-briefs/_common.md`).

### Divergencias canon/escrito vs práctica

- **La regla escrita quedó atrás**: AGENTS.md manda implementadores en
  serie, pero las dos últimas corridas grandes usaron 6-8 escritores
  en paralelo con éxito. La partición por dominio de consola
  (alumnos, cobros, planes, promos, equipo, config, analítica)
  resultó suficiente para evitar choques de archivos.
- **Sin asiento reviewer por task**: en ambas corridas el gate fue
  verificación mecánica corrida por el orquestador (tsc, i18n-audit,
  vitest) más su propia lectura de diffs. No hubo reviewer subagente,
  fix loop ni re-review. Deuda visible: el smoke visual quedó
  pendiente en las dos (`...-console-polish.md:49-51`,
  `...-audit-fixes.md:46-49`).
- **Sin ledger ni report contract formal**: el reporte del
  implementador es libre (`_impl-common.md:32-34`); no hay workspace
  por plan ni registro de rondas/rulings.
- **El cuello de botella es el fan-in, no el fan-out**: los choques de
  archivos ya se mitigan por scope + veto a `common.json` + veto a
  git. Lo que no escala es el orquestador esperando al más lento y
  procesando N reportes en serie, agravado por los estados "done"
  prematuros y los diálogos de permiso que paralizan panes
  (`next-session-handoff-2026-11-04-console-polish.md:40-44`,
  `docs/audit-briefs/analyze-orch.md:4-8`).
- **Sin skill local de orquestación**: `.devin/skills/` solo contiene
  skills de UI/consola (`console-patterns`, `ui-cards`, `ui-filters`,
  `ui-lists`, `ui-ux-principles`). La sección de AGENTS.md es la única
  norma escrita; el know-how herdr vive en handoffs.

### Insumos que el modelo recomendado debe cubrir

- Reconciliar la regla escrita (serie) con la práctica (paralelo por
  scopes disjuntos): formalizar cuándo aplica cada una.
- Definir si el revisor intermedio por pod aporta sobre el esquema
  actual, considerando que el canon logra el mismo efecto con
  reportes-a-archivo + reviewer-par por task + fix loop acotado.
- Resolver el "último lento" y los panes bloqueados en diálogos de
  permiso: esperas acotadas con reconciliación (SDD:235-244) y/o
  reasignación.
- Adoptar o adaptar el contrato de reporte ≤15 líneas + reporte
  completo a archivo, para que el fan-in deje de consumir contexto
  del orquestador.

## Prior art: openspec + topologías

### OpenSpec como contrato orquestador a implementador

El flujo spec-driven de openspec (`openspec-new-change`, schema
`spec-driven`) produce artifacts secuenciales: `proposal.md` (why,
what changes, impact) → `design.md` (decisiones resueltas antes de
implementar) → `specs/**/spec.md` (deltas MODIFIED/ADDED con
requirements y scenarios WHEN/THEN) → `tasks.md` (checklist
agrupado) → apply → archive (merge de deltas a las specs canónicas).
`openspec validate --changes` es el check de máquina; archive es el
sync de la spec viva.

Evidencia en este repo: `console-audit-fixes` (archivado
2026-11-04). La auditoría fan-out de 7 agentes produjo hallazgos
citados por línea; el orquestador los condensó en un change con 14
secciones de tasks y 11 decisiones de diseño resueltas; 6
implementadores + 1 de API lo ejecutaron en paralelo con scopes
disjuntos. El brief común (`_impl-common.md`) declara la autoridad
en orden: `design.md` vinculante → `tasks.md` → skills → hallazgos.
`multipais-foundation` muestra tasks que indexan sub-changes ("hecho
en `stripe-gateway-payout-rail`"): el checklist sirve de grafo de
progreso cross-change.

Qué resuelve el artifact-flow para la coordinación:

- **El artifact set ES la interfaz.** Un implementador sin contexto
  de sesión (pane herdr, sin herencia conversacional ni MCP) recibe
  paths, no historia: design + su sección de tasks + delta de spec.
  Es el "brief autocontenido" de AGENTS.md, pero versionado en el
  repo en vez de pegado en un prompt.
- **Las decisiones se cierran antes del dispatch.** `design.md`
  lista "Decisiones tomadas" y "Fuera de alcance explícito". Cada
  ambigüedad resuelta ahí es una ronda de ping-pong menos en tiempo
  de ejecución, que es donde los agentes paralelos encarecen.
- **tasks.md es el ledger compartido.** Checkboxes por sección:
  cualquier agente (u otro orquestador tras compactación) lee el
  estado real sin depender de memoria de sesión. Cumple en la
  práctica el rol que SDD asigna a `progress.md`.
- **Los scenarios acotan la revisión.** El reviewer verifica
  spec-compliance contra WHEN/THEN concretos, no contra prosa.

Qué NO resuelve (gaps que el modelo debe cubrir encima):

- **No hay partición de archivos.** tasks.md agrupa por sección de
  trabajo, no por ownership. La separación la impone el brief
  (`NO toques archivos fuera de tu scope`, i18n solo en tu part-JSON,
  `common.json` vetado). El grafo de colisión es responsabilidad del
  orquestador.
- **No hay noción de agrupación.** El checklist es plano con
  headings; no existe "pod" ni dependencia entre tasks más allá del
  orden sugerido en el encabezado.
- **Los scenarios describen estado final, no diff por scope.** La
  verificación por scope sigue necesitando un diff acotado (BASE
  registrada antes del dispatch) que openspec no genera.

### Topologías externas (prior art)

El espacio conocido se reduce a cuatro formas y sus combinaciones:

| Topología | Quién la usa | Qué aporta | Costo |
|---|---|---|---|
| Fan-out + aggregator | Anthropic Research (orchestrator-worker, 3-5 subagentes en paralelo); `dispatching-parallel-agents`; Microsoft coord. patterns | Wall-clock y contextos limpios por dominio | El merge cae íntegro en el agregador; solo paga si los slices son independientes |
| Pipeline por etapas | spec → plan → implement → verify → review (la secuencia de AGENTS.md; openspec apply) | Cada etapa entrega un artifact validable al siguiente | Serial por definición |
| Writer + reviewer / judge | `subagent-driven-development` (reviewer por task, fix loop con breaker de 5 rondas, review final de rama); "three-reviewer fan-out" de Effective Coding Agents (seguridad, tests, mantenibilidad) | Calidad gate por unidad sin contaminar contexto del productor | Un juez que solo lee es segunda opinión; el gate real corre checks (diff, typecheck, tests) |
| Jerárquica manager-worker | CrewAI `Process.hierarchical` (manager delega y valida outcomes); lead + helpers | Descomposición dinámica cuando el top no puede pre-partir el trabajo | Capa extra de latencia y un punto más de fallo de juicio; en CrewAI el manager reasigna tasks de formas que rompen downstream |

Lecciones transversales:

- **Paralelismo solo sobre independencia real.** Anthropic lo dice
  literal: si el subagente B necesita el output de A, el fan-out
  degenera en ejecución serial cara. En código compartido,
  independencia = partición de archivos, no de "temas".
- **Aislamiento de contexto por defecto.** CrewAI aísla (el worker
  solo ve su task); Swarm comparte historial completo (fácil de
  montar, degrada calidad por context bleed). Nuestro modelo ya
  está del lado correcto: panes sin herencia.
- **El intermediario aporta cuando agrega síntesis o gate, no cuando
  reenvía.** Un revisor de pod que corre el diff y los checks de su
  grupo antes de reportar filtra ruido. Un revisor que solo
  consolida reportes de texto mueve el bottleneck sin eliminarlo.
- **Straggler: esperas acotadas + resultados parciales, no bloqueo
  total.** Fan-out es tolerante a fallos parciales por diseño; la
  regla dura es nunca reasignar un scope a medio editar a un segundo
  agente sobre el mismo árbol.

## Modelo recomendado

Veredicto corto: **no adoptar pods + revisor como capa fija.** El
problema observado (orquestador bloqueado en el más lento, leyendo
de a uno) no es un problema de capacidad de revisión: es un problema
de espera serial. `herdr agent wait` toma UN solo target; sin
polling, el orquestador queda sentado en el primer wait aunque los
otros 5 terminaron. Agregar un revisor por pod mueve ese wait un
nivel abajo: el orquestador ahora espera al revisor, que espera al
implementador lento. El último lento sigue gatillando el reporte.

### Fan-out plano + procesamiento al-vuelo + review bajo demanda

1. **Dispatch fan-out sobre partición de archivos, no de tasks.**
   Agrupar las secciones de `tasks.md` en scopes por propiedad de
   archivos (como ya se hizo: 6 scopes disjuntos + 1 API). Cada
   brief declara explícito: archivos propios, archivos prohibidos
   (`schema.prisma`, `common.json`, lockfile, specs canónicas van al
   orquestador) y el contrato de reporte. Umbral práctico: hasta 4
   implementadores concurrentes sobre el mismo working tree; más de
   eso, la superficie de colisión y la integración cuestan más que
   el wall-clock ganado (las corridas de 6-8 funcionaron, pero con
   partición de consola ya madura).

2. **Formalizar la regla serie/paralelo** (reconcilia AGENTS.md con
   la práctica): escritura paralela permitida solo cuando cada brief
   declara una partición de archivos verificable y disjunta; scopes
   con solape van en serie o los integra el orquestador. La
   condición del canon SDD ("nunca escritores paralelos") se relaja
   exactamente donde la práctica demostró que la partición la
   neutraliza, no en general.

3. **Wait al-vuelo, no wait por grupo.** Loop:
   `herdr agent list` (una llamada, estados de todos) → tomar el
   primero settled no procesado → leer su archivo de reporte →
   dispatch de su review → repetir; cuando ninguno está settled,
   `agent wait` sobre un pendiente con `--timeout` acotado (2-5 min)
   como sleep y vuelta al list. Ojo con los estados "done/idle"
   prematuros documentados en los handoffs: la señal de terminado
   real es que el reporte exista y cierre; `agent read` confirma en
   caso de duda. Así el implementador que termina primero entra a
   review primero y el lento solo se hace esperar a sí mismo.

4. **Review por scope, no por pod.** Restaurar el asiento reviewer
   que las corridas reales omitieron, pero con costo acotado:
   reviewer read-only bajo demanda sobre el diff acotado del scope
   (BASE registrada antes del dispatch) para scopes que tocan
   contratos, estados o superan ~3 archivos; scopes mecánicos
   quedan con gate de checks del orquestador (tsc, i18n-audit,
   vitest) más su lectura de diff, que es lo que ya funcionó. Fix
   loop y adjudicación según canon SDD (resume al implementador,
   breaker, rulings al ledger/tasks.md).

5. **El intermediario por pod solo cuando dos condiciones se dan
   juntas**: (a) fan-out de 5+ implementadores, y (b) el pod comparte
   una frontera de contrato (un componente o módulo que todos
   consumen y uno produce). Ahí sí, un revisor de pod read-only
   (devin-kind propio) revisa el sub-diff del pod y detecta drift de
   contrato intra-pod antes de que llegue al orquestador. Fuera de
   ese caso es overhead: una segunda opinión sin gate que agrega un
   salto de latencia. Nunca write-capable: dos capas con permiso de
   edición sobre el mismo árbol multiplica conflictos.

6. **Straggler y panes bloqueados: diagnóstico antes de reasignar.**
   Presupuesto de tiempo por scope proporcional a archivos tocados.
   Al vencer: `agent get` + `agent read` para distinguir blocked
   (diálogo de permiso conocido → `send-keys` tras leer su contenido;
   diálogo desconocido → escalar al usuario, nunca responder a
   ciegas), working (vivo, dejar correr con segundo presupuesto) o
   stalled. Si hay ediciones parciales, `agent prompt` pidiendo que
   cierre y reporte lo hecho: nunca reasignar el scope a otro agente
   sobre trabajo a medio hacer, y nunca matar sin leer. La
   reasignación limpia solo aplica si el agente no editó nada
   verificable.

7. **Contrato de reporte formal.** Adoptar el patrón SDD: el
   implementador escribe `reporte-<scope>.md` (archivos tocados,
   decisiones, pendientes, evidencia de su auto-check) y devuelve
   ≤15 líneas (status, archivos, resumen de verificación, concerns).
   El orquestador lee archivos, no transcripts TUI (frágiles y con
   estados prematuros); `agent read` queda para diagnóstico.

8. **Conflictos de archivos compartidos: misma regla, formalizada.**
   Los puntos comunes los integra el orquestador en serie
   (schema.prisma/migraciones, `common.json`, lockfile,
   `globals.css`, specs canónicas, barrel de componentes). Lo nuevo:
   cada brief nombra su lista de archivos propios y prohibidos, así
   la detección de choques es verificable en vez de implícita; dos
   briefs que declaran el mismo archivo se secuencian antes del
   dispatch, no se descubren en el merge.

9. **Lo que no cambia.** Orquestador = único con contexto pesado
   (grafo, handoff, change completo), único que commitea integración,
   único que toca archivos compartidos y migraciones. Implementadores
   no ejecutan git ni spawnan subagentes. Tweak chico = sin
   dispatch. `tasks.md` marcado + refs de commit sigue siendo el
   ledger; sin workspace extra por ahora.
