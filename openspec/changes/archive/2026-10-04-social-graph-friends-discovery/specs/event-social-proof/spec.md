## Purpose

La página de detalle del evento muestra qué amigos confirmados del viewer ya tienen entrada, convirtiendo la prueba social en impulso de compra en el punto exacto de decisión.

## ADDED Requirements

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
