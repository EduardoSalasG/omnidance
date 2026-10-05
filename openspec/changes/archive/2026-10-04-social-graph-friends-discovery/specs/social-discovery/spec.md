## Purpose

Define cómo una persona encuentra y agrega a otra en la plataforma: búsqueda por nombre, acción de amistad en el perfil público, y un link de invitación compartible para personas que aún no tienen cuenta.

## ADDED Requirements

### Requirement: Sección "Agregar amigos" descubrible en /amigos

El listado de amigos SHALL presentar el buscador de personas bajo un encabezado de sección visible ("Agregar amigos" o equivalente), de modo que el mecanismo de agregar sea descubrible sin instrucciones externas.

#### Scenario: Usuario abre /amigos

- **WHEN** el usuario autenticado navega a `/amigos`
- **THEN** la página muestra un encabezado que identifica el buscador como la vía para agregar personas, sobre el input de búsqueda

#### Scenario: Búsqueda encuentra personas

- **WHEN** el usuario escribe ≥2 caracteres en el buscador
- **THEN** se listan personas cuyo nombre coincide (case-insensitive), cada una con su acción contextual de amistad (Agregar / Enviada / Aceptar / Amigo)

### Requirement: Link de invitación a amistad compartible

El usuario SHALL poder compartir un link a su propio perfil (`/amigos/<id>`) para que otra persona lo agregue, incluyendo a quienes aún no tienen cuenta.

#### Scenario: Compartir perfil propio

- **WHEN** el usuario activa "Invitar por link" en `/amigos`
- **THEN** se copia al portapapeles (o se abre el sheet nativo de compartir) la URL absoluta de su perfil de amistad

#### Scenario: Receptor sin sesión abre el link

- **WHEN** una persona sin sesión abre `/amigos/<id>`
- **THEN** el middleware la redirige a `/login?next=/amigos/<id>` y tras registrarse o entrar aterriza en ese perfil, donde el botón "Agregar" envía la solicitud de amistad

#### Scenario: Receptor con sesión abre el link

- **WHEN** una persona autenticada abre `/amigos/<id>` de otro usuario
- **THEN** el perfil muestra la acción contextual de amistad según el estado actual (Agregar si no hay relación)

### Requirement: Estado de amistad visible en el perfil

El perfil público `/amigos/[id]` SHALL mostrar la acción contextual según `friendship.status`: `none` → botón Agregar, `sent` → badge + cancelar, `received` → Aceptar/Rechazar, `friends` → badge Amigos.

#### Scenario: Agregar desde el perfil

- **WHEN** el usuario abre el perfil de alguien sin relación y toca "Agregar"
- **THEN** se crea la solicitud de amistad (PENDING) y el perfil se refresca mostrando el estado "Enviada"
