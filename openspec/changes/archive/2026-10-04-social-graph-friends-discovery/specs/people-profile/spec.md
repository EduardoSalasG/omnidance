## Purpose

El perfil de persona gana un campo social público: usuario de Instagram, editable por el dueño y visible en el perfil de amistad junto al logo de la red.

## ADDED Requirements

### Requirement: Campo instagram en el perfil propio

`Person` SHALL tener un campo `instagram` opcional (nullable). El dueño SHALL poder editarlo desde su perfil vía `PATCH /me`, que acepta `{instagram}` validado como handle (sin `@` inicial, caracteres `[a-zA-Z0-9._]`, máx 30) o null/empty para limpiarlo.

#### Scenario: Guardar handle válido

- **WHEN** el usuario envía `PATCH /me` con `{instagram: "@camila.dance"}` o `"camila.dance"`
- **THEN** el sistema normaliza y persiste `camila.dance`

#### Scenario: Handle inválido

- **WHEN** el usuario envía `PATCH /me` con un instagram que contiene espacios o caracteres fuera de `[a-zA-Z0-9._]` o supera 30 chars
- **THEN** responde 400 sin mutar el perfil

#### Scenario: Limpiar handle

- **WHEN** el usuario envía `PATCH /me` con `{instagram: ""}` o `{instagram: null}`
- **THEN** el campo queda null y deja de mostrarse

### Requirement: Instagram en el perfil público

`GET /people/:id` SHALL incluir `instagram` en la respuesta. La página `/amigos/[id]` SHALL mostrar el handle con el logo de Instagram cuando está presente, enlazando a `https://instagram.com/<handle>` en pestaña nueva.

#### Scenario: Perfil con instagram

- **WHEN** el usuario abre el perfil de una persona con instagram configurado
- **THEN** junto a su identidad aparece el logo de Instagram seguido de `@handle`, con link externo a su perfil de Instagram

#### Scenario: Perfil sin instagram

- **WHEN** el usuario abre el perfil de una persona sin instagram
- **THEN** no se renderiza la fila de Instagram (sin placeholder ni label huérfano)
