# landing-marketing Specification

## Purpose
TBD - created by archiving change split-pro-landings. Update Purpose after archive.

## Requirements

### Requirement: Landings pro por audiencia

La captación B2B SHALL separarse por rol: `/para-academias` y
`/para-productores` comparten el esqueleto de landing (header, hero,
dolor PAS, prueba social, features, lead form) pero MUST tener copy,
meta title/description y rol de lead específicos de su audiencia. La
prueba social SHALL ser afín al rol: eventos reales de la semana en
`/para-productores` y `/pro`; academias reales de la plataforma
(`GET /academies/public`) en `/para-academias`. `/pro` MUST ser un
selector de audiencia con cards a cada landing y un form compacto para
los roles sin landing (DJ, VENUE). El lead form de cada landing MUST
enviar el rol fijo de esa audiencia sin preguntarlo; cada landing MUST
enlazar a la otra para visitantes multi-rol. SEO: canonical propio por
ruta y ambas indexables en sitemap.

#### Scenario: Academia aterriza en su landing

- **WHEN** un visitante abre `/para-academias`
- **THEN** ve copy de gestión de academia (horarios, cobros, alumnos)
- **AND** el form envía `roles: ["ACADEMY_OWNER"]` sin mostrar selector
  de rol

#### Scenario: Productor aterriza en su landing

- **WHEN** un visitante abre `/para-productores`
- **THEN** ve copy de ticketing, puerta QR y números del evento
- **AND** el form envía `roles: ["PRODUCER"]` sin mostrar selector de rol

#### Scenario: Visitante multi-rol cruza a la otra landing

- **WHEN** un visitante con ambos roles lee una landing pro
- **THEN** encuentra el enlace a la landing de su otro rol

#### Scenario: DJ o local en el selector

- **WHEN** un visitante abre `/pro`
- **THEN** ve las cards a `/para-productores` y `/para-academias` y un
  form que solo ofrece los roles DJ y VENUE_MANAGER
