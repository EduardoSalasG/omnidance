# post-event-survey Specification

## Purpose
Tras asistir a un social (check-in real), el bailarín recibe una encuesta corta de puntajes 1-5 - general + dimensiones bipolares - que alimenta la analítica del productor y la reputación privada de actores.

## Requirements

### Requirement: Elegibilidad por asistencia real

Solo puede evaluar un evento quien tiene `Checkin` no anulado en ese evento, dentro de la ventana de ~24h post-`endsAt`. Sin check-in o fuera de ventana MUST responder 403/404.

#### Scenario: Asistente evalúa dentro de la ventana

- WHEN un usuario con check-in abre la encuesta dentro de las 24h post-evento
- THEN puede enviar sus puntajes (una evaluación por persona/evento)

#### Scenario: No asistente no puede evaluar

- WHEN un usuario sin check-in intenta evaluar el evento
- THEN la API rechaza y la UI no le muestra la card de encuesta

### Requirement: Activación de la encuesta

Al terminar el evento SHALL notificarse a cada asistente (`notifySafe`:
in-app + push best-effort, una vez por evento/persona) y `/inicio` MUST
mostrar una card "¿Cómo estuvo [evento]?" durante la ventana, que
desaparece al evaluar o expirar. La card SHALL mostrarse únicamente en
el apartado **Social** del inicio del bailarín (`activeRole ===
"DANCER"` con `viewMode === "social"`): las consolas de otros roles
(owner de academia, productor, instructor, admin) MUST NOT mostrarla
aunque la persona tenga una encuesta pendiente - su aviso viaja por la
notificación.

#### Scenario: Card visible tras el social

- **WHEN** un asistente abre `/inicio` con la lente bailarín en modo
  Social dentro de la ventana sin haber evaluado
- **THEN** ve la card que lleva a la encuesta del evento

#### Scenario: Sin card tras evaluar o expirada

- **WHEN** el asistente ya evaluó o pasaron >24h
- **THEN** la card no aparece

#### Scenario: Owner de academia con encuesta pendiente

- **GIVEN** un usuario con rol ACADEMY_OWNER que asistió a un social y
  tiene la encuesta pendiente
- **WHEN** abre el inicio de su consola de academia
- **THEN** no ve la card "¿Cómo estuvo ...?" (su pendiente sigue en
  notificaciones y aparece al cambiar a la lente bailarín, modo Social)

#### Scenario: Card fuera del apartado Social

- **GIVEN** un bailarín con encuesta de social pendiente
- **WHEN** abre `/inicio` con la lente bailarín en modo Academia
- **THEN** la card de social no aparece en ese apartado

### Requirement: Formulario de puntajes

La encuesta SHALL usar el control de estrellas 1-5: `overall` obligatorio + 2 dimensiones visibles por defecto (`music`, `occupation`) con etiquetas bipolares en los extremos, y "Evaluar más" opcional que revela `organization`, `floorComfort`, `temperature`, `lightingSound`. Sin texto libre. Segundo envío actualiza la evaluación existente.

#### Scenario: Envío mínimo

- WHEN el asistente marca solo el puntaje general y envía
- THEN la evaluación se guarda con `overall` y dims vacías

#### Scenario: Re-evaluar dentro de la ventana

- WHEN el asistente vuelve a enviar la encuesta en la ventana
- THEN su `EventRating` se actualiza (upsert), no duplica
