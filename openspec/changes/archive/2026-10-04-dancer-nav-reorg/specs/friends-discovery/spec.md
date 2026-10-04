# friends-discovery

## Purpose

El módulo de amigos permite descubrir a quién conoces y a qué eventos van: perfil de amigo con sus estilos y próximos eventos (solo entre amigos confirmados), y una sección en el listado con los eventos a los que asisten tus amigos.

## ADDED Requirements

### Requirement: Perfil de amigo con próximos eventos

`GET /api/people/:id` SHALL incluir `upcomingEvents` (eventos futuros donde la persona tiene ticket ACTIVE) únicamente cuando quien consulta y la persona son amigos confirmados (`Friendship` aceptada). Para no-amigos el campo MUST estar ausente o vacío. La página `/amigos/[id]` MUST mostrar nombre, foto/iniciales, estilos de baile con su rol (Leader/Follower/Ambos) y la lista de próximos eventos con fecha y local.

#### Scenario: Amigo ve la agenda del amigo

- WHEN un usuario autenticado abre el perfil de un amigo confirmado que tiene tickets activos a eventos futuros
- THEN el perfil muestra la sección "Próximos eventos" con nombre del evento, fecha y local

#### Scenario: No-amigo no ve la agenda

- WHEN un usuario autenticado abre el perfil de alguien que no es su amigo
- THEN el perfil no muestra próximos eventos de esa persona

### Requirement: Sección "Tus amigos van a"

`GET /api/friends/upcoming-events` SHALL devolver los eventos futuros donde al menos un amigo confirmado del usuario tiene ticket ACTIVE, cada uno con los datos públicos del evento y la lista de amigos que asisten (nombre, photoUrl). `/amigos` MUST renderizarla sobre el listado: card del evento con fecha/local y stack de avatares (foto o iniciales) de los amigos que van.

#### Scenario: Eventos con amigos aparecen destacados

- WHEN un usuario tiene amigos con tickets a eventos futuros
- THEN `/amigos` muestra esos eventos con los avatares de los amigos que van a cada uno

#### Scenario: Sin amigos con eventos

- WHEN ningún amigo tiene tickets a eventos futuros
- THEN la sección no se renderiza (o muestra estado vacío discreto), sin errores

#### Scenario: Privacidad entre no-amigos

- WHEN un usuario consulta `GET /api/friends/upcoming-events`
- THEN solo aparecen amigos confirmados — nunca personas sin amistad aceptada
