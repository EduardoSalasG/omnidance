# social-graph-friends-discovery

## Why

El módulo de amigos tiene tres huecos que cortan el loop social:

1. **No hay forma clara de agregar a una persona.** El buscador por nombre existe en `/amigos` pero no es descubrible como mecanismo de "agregar", y no existe una vía para invitar a alguien que aún no está en la app (el caso más común en pista: bailaste con alguien, quieres conectar).
2. **El detalle del evento no muestra qué amigos van.** `/amigos` ya lista "tus amigos van a X" con avatares, pero al entrar al evento esa prueba social desaparece — justo donde se decide comprar. Pierde el impulso de ir.
3. **El perfil del amigo no muestra su Instagram.** En la escena SBK el Instagram es la identidad social real; sin él el perfil queda incompleto.

## What Changes

- **`Person.instagram`** (nullable): nuevo campo editable desde `/perfil`, expuesto en `GET /people/:id`, mostrado con logo de Instagram en el perfil del amigo. Seed con handles para personas demo.
- **`PATCH /me`**: endpoint mínimo para editar campos sociales propios (instagram ahora; extensible).
- **`GET /events/:id/friends-going`**: endpoint con SessionGuard que devuelve los amigos confirmados del viewer con ticket ACTIVE para ese evento `[{id, name, photoUrl}]`. El detalle del evento renderiza stack de avatares + "Camila, Josefa y 2 más van" — sección oculta si no hay amigos o no hay sesión.
- **Descubribilidad de "agregar"** en `/amigos`: encabezado de sección para el buscador y acción **"Invitar por link"** que copia/comparte la URL del propio perfil (`/amigos/<myId>`) — quien la abre sin sesión cae a `/login?next=/amigos/<id>`, se registra y aterriza en el perfil con el botón "Agregar" (reusa el flujo de claim links, sin endpoints nuevos).

## Capabilities

### New Capabilities

- `social-discovery`: cómo una persona encuentra y agrega a otra — búsqueda por nombre, perfil público con acción de amistad, y link de invitación compartible.
- `event-social-proof`: prueba social en el detalle del evento — lista de amigos confirmados del viewer con entrada activa.

### Modified Capabilities

- `people-profile`: el perfil propio gana campo editable `instagram`; el perfil público lo expone para mostrarse en `/amigos/[id]`.

## Impact

- **Schema**: `Person.instagram String?` — columna nullable, sin migración destructiva.
- **API**: `PATCH /me` (nuevo), `GET /events/:id/friends-going` (nuevo), `GET /people/:id` (campo nuevo), `GET /me` (campo nuevo). Sin breaking changes.
- **Web**: `/amigos` (header del buscador + compartir), `/amigos/[id]` (instagram, spacing del botón eliminar), `/eventos/[id]` (sección amigos que van), `/perfil` (campo instagram editable).
- **Seed**: `instagram` en personas demo.
- **Docs**: openapi.json + postman regenerados por endpoints nuevos.
