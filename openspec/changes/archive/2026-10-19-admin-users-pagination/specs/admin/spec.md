# admin; delta admin-users-pagination

## ADDED Requirements

### Requirement: buscador de personas paginado en /admin

`GET /admin/users` SHALL aceptar `q` (texto libre sobre nombre, email o
teléfono), `role` (key del catálogo RBAC), `page` y `pageSize`, y
responder el envelope `{items,total,page,pageSize}`; nunca un array
plano ni la tabla completa. `page` normaliza a ≥1 (default 1) y
`pageSize` a default 25 capado en 100; valores no numéricos caen al
default sin error.

Sin `q` de ≥2 caracteres ni `role` válido, el endpoint SHALL responder
un envelope vacío (`items: []`, `total: 0`); nunca un listado masivo.

#### Scenario: página de resultados por rol

- **WHEN** el admin pide `role=DANCER&page=2&pageSize=25`
- **THEN** recibe `{items[≤25], total, page: 2, pageSize: 25}` con los
  titulares del rol ordenados por `createdAt` desc y `total` = conteo
  completo del filtro

#### Scenario: sin término ni rol

- **WHEN** el admin pide `GET /admin/users` sin `q` ni `role` (o `q` de
  1 carácter)
- **THEN** recibe `{items: [], total: 0, page, pageSize}` sin consultar
  la tabla

#### Scenario: rol inexistente

- **WHEN** el admin pide `role=FOO_BAR` que no existe en el catálogo
- **THEN** recibe 400 (misma validación actual)

#### Scenario: q y rol combinados

- **WHEN** el admin pide `q=ana&role=INSTRUCTOR`
- **THEN** los items cumplen ambos criterios (texto ∧ titular del rol) y
  `total` refleja la intersección

### Requirement: UI /admin/usuarios con paginación y filtro por rol

La página SHALL mantener el estado vacío inicial (sin fetch hasta tener
`q`≥2 o un rol), mostrar el total de resultados y permitir navegar
páginas con el `Pager` compartido. Cambiar `q` o el filtro de rol SHALL
volver a página 1. El select de rol SHALL poblar sus opciones desde el
catálogo RBAC vivo (`GET /admin/roles`), no de una lista hardcodeada.

#### Scenario: explorar un rol completo

- **WHEN** el admin selecciona el rol PRODUCER sin escribir texto
- **THEN** la lista muestra la primera página de productores, el total
  del filtro y el `Pager` habilita navegar al resto

#### Scenario: cambio de filtro resetea página

- **WHEN** el admin está en la página 3 y cambia el rol o el texto
- **THEN** la consulta vuelve a `page=1`

#### Scenario: entrada sin resultados masivos

- **WHEN** el admin entra a `/admin/usuarios`
- **THEN** no se dispara fetch de usuarios hasta que exista `q`≥2 o un
  rol seleccionado
