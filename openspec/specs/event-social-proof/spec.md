# event-social-proof Specification

## Purpose
La página de detalle del evento muestra qué amigos confirmados del viewer ya tienen entrada, convirtiendo la prueba social en impulso de compra en el punto exacto de decisión.

## Requirements

### Requirement: Endpoint de amigos que van a un evento

El sistema SHALL exponer `GET /events/:id/friends-going` autenticado que devuelve los amigos confirmados (friendship ACCEPTED) del solicitante con ticket ACTIVE para ese evento, como `[{id, name, photoUrl}]` sin duplicados por persona.

#### Scenario: Amigos con entrada

- **WHEN** el usuario autenticado consulta friends-going de un evento donde 2 amigos confirmados tienen ticket ACTIVE
- **THEN** la respuesta lista exactamente esas 2 personas con id, nombre y foto

#### Scenario: Sin sesión

- **WHEN** una request sin sesión consulta friends-going
- **THEN** responde 401 (no expone relaciones sociales a anónimos)

#### Scenario: Ticket reclamable no cuenta

- **WHEN** un amigo tiene solo un ticket reclamable (claimToken no reclamado aún por el dueño real) para el evento
- **THEN** el comprador del ticket cuenta como "va" solo si él mismo tiene ticket ACTIVE propio; el ticket pendiente de reclamo no genera entrada en la lista de amigos del viewer salvo que pertenezca a un amigo

### Requirement: Sección "amigos que van" en el detalle del evento

La página `/eventos/[id]` SHALL mostrar una sección con los amigos que van (avatares + nombres o conteo con nombre destacado) cuando el viewer autenticado tiene ≥1 amigo con entrada activa. Si no hay amigos o no hay sesión, la sección SHALL omitirse sin dejar espacio vacío.

#### Scenario: Viewer con amigos que van

- **WHEN** el usuario abre el detalle de un evento donde "Camila" y "Josefa" (amigos confirmados) tienen entrada activa
- **THEN** la página muestra sus avatares/nombres en una sección de prueba social

#### Scenario: Viewer sin amigos que van

- **WHEN** el usuario abre el detalle de un evento donde ningún amigo tiene entrada
- **THEN** la sección no se renderiza (sin heading huérfano ni contenedor vacío)

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
