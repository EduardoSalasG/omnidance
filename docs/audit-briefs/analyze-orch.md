# Brief: análisis de orquestación multi-agente (read-only, 2 agentes)

Contexto: el orquestador principal despacha implementadores devin en
paralelo vía herdr (panes). Problema real observado: N agentes
paralelos ⇒ el orquestador queda bloqueado esperando al más lento y
lee/reporta uno por uno. Propuesta del usuario: agrupar en pods de
2-3 implementadores con un agente revisor/intermediario por pod que
los revisa, corrige (o hace corregir) y reporta consolidado al main.

Investiga y entrega UN documento `docs/orchestration-model.md` con:
(a) qué patrones ya existen (prior art), (b) evaluación honesta de la
propuesta pods+revisor vs alternativas, (c) el modelo recomendado
concreto para este repo (roles, tamaños, qué revisa el intermediario,
cómo reporta, cómo evitar el bottleneck del último agente, qué hacer
con conflictos de archivos compartidos), (d) riesgos/anti-patrones.

NO edites código. Escribe solo ese doc.
