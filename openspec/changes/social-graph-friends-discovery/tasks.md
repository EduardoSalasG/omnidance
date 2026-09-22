# Tasks — social-graph-friends-discovery

## 1. Schema + API

- [x] 1.1 `Person.instagram String?` en schema.prisma + `db:push`
- [x] 1.2 `PATCH /me` en people.controller (DTO UpdateMeDto, normaliza/valida handle, null si vacío)
- [x] 1.3 `GET /me` incluye `instagram`; `GET /people/:id` incluye `instagram`
- [x] 1.4 `GET /events/:id/friends-going` con SessionGuard en events.controller — amigos ACCEPTED con ticket ACTIVE del evento, dedup por persona
- [x] 1.5 Tests del endpoint friends-going (events.controller.spec.ts — 3 casos)

## 2. Web

- [x] 2.1 `/eventos/[id]`: fetch server-side de friends-going con cookie (patrón getMissions), sección con stack de avatares + nombres
- [x] 2.2 `/amigos`: encabezado "Agregar amigos" sobre el buscador + botón "Invitar por link" (navigator.share / clipboard con `/amigos/<me>`)
- [x] 2.3 `/amigos/[id]`: fila Instagram (logo SVG + @handle → instagram.com/<handle>) bajo la identidad
- [x] 2.4 `/perfil`: campo instagram editable (input + guardar vía PATCH /me)
- [x] 2.5 Keys i18n nuevas en es-CL.json (events.friendsGoing*, friends.addTitle/invite*, profile.instagram*)

## 3. Seed + verificación

- [x] 3.1 `instagram` en personas demo del seed (7 handles)
- [x] 3.2 tsc API + web limpio; SSR verificado: /eventos/[id] muestra "Camila ya va", /amigos con sección Agregar + Invitar, /perfil con campo Instagram; E2E: friends-going 200 con amigo / 401 anónimo, PATCH /me normaliza "@x" → "x" y 400 en inválido
- [x] 3.3 Docs de API regenerados (164 paths)
