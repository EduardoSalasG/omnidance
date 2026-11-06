# Brief impl-orch-B (openspec + topologías)

Lee `docs/audit-briefs/analyze-orch.md` (contexto completo).
Tu mitad del análisis:

1. Revisa cómo funciona el flujo artifact-driven de openspec (el
   schema spec-driven: proposal→specs→design→tasks→apply→archive) en
   `C:\Users\salas\.agents\skills\openspec-*` y el dir
   `openspec/changes/console-audit-fixes/` como ejemplo: ¿el diseño
   por-etapas con artifacts como contrato reduce el problema de
   coordinación? ¿tasks.md como interface orquestador→implementador?
2. Investiga (web) prior art de topologías multi-agente: fan-out +
   aggregator, pods/hierarchical teams, reviewer gates — qué usan
   frameworks tipo swarm/crew/claude-teams; casos donde un agente
   intermediario por grupo aporta vs donde es overhead.
3. Modelo recomendado para ESTE repo considerando herdr real
   (`herdr tab create/agent start/agent prompt/agent read/agent wait/
   send-keys/tab close`): pods de 2-3 con revisor ¿sí/no? ¿el revisor
   es devin-kind propio o basta el diff-review del orquestador?
   ¿qué hacer con el "último lento" (reassign? timeouts? wait por
   grupos?).

TÚ escribes las secciones "Prior art: openspec + topologías" y
"Modelo recomendado" del doc `docs/orchestration-model.md`; no toques
las secciones del otro agente. Si el archivo no existe, créalo con
solo tus secciones.
