# post-event-survey

## Purpose

Tras asistir a un social (check-in real), el bailarín recibe una encuesta corta de puntajes 1-5 — general + dimensiones bipolares — que alimenta la analítica del productor y la reputación privada de actores.

## ADDED Requirements

### Requirement: Elegibilidad por asistencia real

Solo puede evaluar un evento quien tiene `Checkin` no anulado en ese evento, dentro de la ventana de ~24h post-`endsAt`. Sin check-in o fuera de ventana MUST responder 403/404.

#### Scenario: Asistente evalúa dentro de la ventana

- WHEN un usuario con check-in abre la encuesta dentro de las 24h post-evento
- THEN puede enviar sus puntajes (una evaluación por persona/evento)

#### Scenario: No asistente no puede evaluar

- WHEN un usuario sin check-in intenta evaluar el evento
- THEN la API rechaza y la UI no le muestra la card de encuesta

### Requirement: Activación de la encuesta

Al terminar el evento SHALL notificarse a cada asistente (`notifySafe`: in-app + push best-effort, una vez por evento/persona) y `/inicio` MUST mostrar una card "¿Cómo estuvo [evento]?" durante la ventana, que desaparece al evaluar o expirar.

#### Scenario: Card visible tras el social

- WHEN un asistente abre `/inicio` dentro de la ventana sin haber evaluado
- THEN ve la card que lleva a la encuesta del evento

#### Scenario: Sin card tras evaluar o expirada

- WHEN el asistente ya evaluó o pasaron >24h
- THEN la card no aparece

### Requirement: Formulario de puntajes

La encuesta SHALL usar el control de estrellas 1-5: `overall` obligatorio + hasta 3 dimensiones visibles por defecto (Música, Gente, Temperatura) con etiquetas bipolares en los extremos ("Vacío↔Lleno", "Frío↔Caluroso"), y "Evaluar más" opcional que revela `organization`, `floorComfort`, `lightingSound`. Sin texto libre. Segundo envío actualiza la evaluación existente.

#### Scenario: Envío mínimo

- WHEN el asistente marca solo el puntaje general y envía
- THEN la evaluación se guarda con `overall` y dims vacías

#### Scenario: Re-evaluar dentro de la ventana

- WHEN el asistente vuelve a enviar la encuesta en la ventana
- THEN su `EventRating` se actualiza (upsert), no duplica
