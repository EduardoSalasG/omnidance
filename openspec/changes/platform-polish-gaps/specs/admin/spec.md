# Delta: admin (platform-polish-gaps)

## ADDED Requirements

### Requirement: claim atómico de corrida multi-instancia

La toma de un job para ejecutarlo MUST ser atómica a nivel DB —
`updateMany` condicional sobre `runningRunId IS NULL` — de modo que
con N instancias de API a lo sumo una ejecuta la corrida. La instancia
que pierde la carrera descarta el `JobRun` creado: en trigger CRON el
skip es silencioso; en MANUAL responde 409 "ya tiene una corrida
activa".

#### Scenario: dos instancias disputan el mismo job

- **WHEN** dos procesos ejecutan `tick` y el mismo job está vencido
- **THEN** solo el claim que gana el `updateMany` ejecuta el handler;
  el otro descarta el run creado y sigue con el siguiente job

#### Scenario: corrida manual sobre job tomado

- **WHEN** se invoca `runNow` para un job que otra instancia acaba de
  tomar
- **THEN** responde 409 y no queda un JobRun RUNNING huérfano
