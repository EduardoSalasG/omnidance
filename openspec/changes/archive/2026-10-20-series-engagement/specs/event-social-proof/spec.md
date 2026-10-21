## ADDED Requirements

### Requirement: Reviews verificadas por check-in en series

`POST /events/series/:id/review` SHALL permitir evaluar una serie
(score 1-5, comentario opcional) únicamente a personas con al menos un
`Checkin` no anulado en un evento de la serie. SHALL hacer upsert por
(serie, persona) — re-evaluar edita la review previa. El comentario
escrito SHALL ser privado: solo el productor de la serie o un admin
puede listar comentarios individuales; nunca se expone el autor ni la
evaluación individual al público (regla de plataforma: ratings
privados y agregados).

#### Scenario: Check-in requerido

- WHEN una persona sin check-in válido en la serie intenta evaluar
- THEN recibe 403 explicando que necesita asistir primero

#### Scenario: Upsert por persona

- WHEN una persona con check-in evalúa la serie dos veces
- THEN la segunda llamada actualiza la misma review (score/comentario)

#### Scenario: Comentarios privados

- WHEN un bailarín consulta la ficha pública de la serie
- THEN ve el score agregado (promedio + conteo) sin comentarios ni
  autores; solo el productor/admin accede a la lista de comentarios

### Requirement: Estadísticas verificadas de serie

`GET /events/series/:id/engagement` SHALL devolver, calculado sobre
check-ins no anulados: asistencia promedio por evento, distribución de
género de asistentes únicos (`Person.gender`), distribución
leader/follower de asistentes con `PersonStyleRole` declarado, y el
score agregado de reviews. Los datos SHALL ser siempre agregados —
nunca identifican a una persona concreta.

#### Scenario: Agregado anónimo

- WHEN un usuario consulta engagement de una serie
- THEN recibe promedios y ratios sin nombres ni desglose individual
