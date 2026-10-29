# academies/approval-gate Specification Delta

## MODIFIED Requirements

### Requirement: foto de academia vía URL externa

`photoUrl` SHALL ser editable en `PATCH /academies/:id/settings` y en
la página `/academia/configuracion/perfil`. El campo SHALL aceptar dos
orígenes: una URL externa https (input manual; regla "fotos nunca
hosteadas" para contenido externo) o un path hosteado `/api/...`
proveniente del upload propio (`POST /academies/:id/photo`). Guardar el
perfil con un `photoUrl` hosteado SHALL NOT rechazarlo. SHALL
exponerse en `GET /academies/:id/profile` cuando esté aprobada.

#### Scenario: guardar foto

- **WHEN** el owner pega una URL https de imagen en el campo foto
- **THEN** se persiste `photoUrl`, el check `photo` pasa a true y la
  ficha pública la usa como imagen principal

#### Scenario: guardar perfil tras subir foto

- **WHEN** el owner subió la foto (photoUrl quedó `/api/academies/photos/<key>`)
  y guarda el formulario de perfil
- **THEN** el PATCH no rechaza el path hosteado; la foto persiste y el
  resto de campos se guardan
