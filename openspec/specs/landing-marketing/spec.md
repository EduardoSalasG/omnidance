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

### Requirement: Adaptación desktop de superficies públicas

Las landings (`/`, `/para-academias`, `/para-productores`, `/pro`) y las
páginas públicas asociadas (`/login`, `/terminos`, `/privacidad`,
`/reclamar/[token]`) SHALL adaptarse a viewports `≥lg` (1024px) sin
alterar su presentación móvil. Las secciones de marketing MUST ganar
espaciado y ritmo de desktop; los flujos de formulario MUST conservar
medida angosta y presentarse con contenedor card en `lg`. Toda
adaptación SHALL ser aditiva (clases `lg:`/`sm:`) sin reestructurar el
DOM móvil.

#### Scenario: Landing en desktop

- **WHEN** un visitante abre `/` o una landing pro en viewport ≥1024px
- **THEN** el hero y las secciones muestran espaciado de desktop y la
  grilla de features usa el ancho disponible con gaps acordes
- **AND** en `<lg` la página se ve idéntica a la versión móvil actual

#### Scenario: Login en desktop

- **WHEN** un visitante abre `/login` en viewport ≥1024px
- **THEN** el formulario se presenta dentro de una card (borde + fondo)
  centrada, con medida de lectura conservada
- **AND** en `<lg` el formulario ocupa el viewport centrado como antes

#### Scenario: Documentos legales en desktop

- **WHEN** un visitante abre `/terminos` o `/privacidad` en ≥1024px
- **THEN** la prosa mantiene medida legible (~70ch) y solo aumenta el
  padding vertical de página
