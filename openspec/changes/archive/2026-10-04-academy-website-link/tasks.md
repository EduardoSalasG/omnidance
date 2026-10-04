# Tasks — academy-website-link

## 1. Datos + API

- [x] 1.1 `Academy.website String?` en schema.prisma + `pnpm db:migrate`.
- [x] 1.2 `UpdateAcademySettingsDto.website` + `cleanWebsite` (trim,
  "" → null, asume https://, valida URL http(s), 400 si inválida).
- [x] 1.3 `PATCH :id/settings` persiste website; `GET :id/profile` lo
  incluye en select + respuesta.
- [x] 1.4 Spec del controller: roundtrip, normalización de esquema,
  inválida 400, limpieza con "".

## 2. Web

- [x] 2.1 `academy-profile.tsx`: input website + campo en PATCH body;
  tipo `Academy.website` en shared.ts.
- [x] 2.2 Ficha `/academias/[id]`: chip de sitio web (globe icon, host
  como etiqueta) junto a Instagram/WhatsApp.
- [x] 2.3 i18n `parts/academyExtras.json`: labels/placeholder.

## 3. Cierre

- [x] 3.1 Specs verdes + `tsc --noEmit` api/web + `openspec validate`.
- [x] 3.2 openapi.json/postman si el endpoint cambia de shape (nuevo
  campo en DTO — regenerar).
