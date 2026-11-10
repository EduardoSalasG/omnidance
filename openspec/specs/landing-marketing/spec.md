# landing-marketing Specification

## Purpose
TBD - created by archiving change split-pro-landings. Update Purpose after archive.

## Requirements

### Requirement: Landings pro por audiencia

La captación B2B SHALL separarse por rol: `/para-academias` y
`/para-productores` comparten el esqueleto de landing (header, hero,
dolor PAS, prueba social, features, lead form) pero MUST tener copy,
meta title/description y rol de lead específicos de su audiencia. La
prueba social SHALL ser afín al rol y SHALL provenir de los catálogos
de contenido commiteados (`apps/web/src/content/`), nunca de requests
al API en render: eventos destacados del catálogo filtrados a la
semana vigente en `/para-productores` y `/pro`; academias del catálogo
en `/para-academias`. `/pro` MUST ser un
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

### Requirement: Dominio primario en la superficie SEO

Toda URL absoluta que el sitio emite para consumo externo; canonical,
`og:url`, `twitter:*`, JSON-LD, `sitemap.xml` y `robots.txt`
(`Sitemap:`); SHALL usar el dominio primario `https://omnidance.tech`
en producción, nunca el subdominio `*.netlify.app`.

#### Scenario: Documento público

- **WHEN** se sirve cualquier página pública en producción
- **THEN** su `<link rel="canonical">` y `og:url` usan
  `https://omnidance.tech` como base.

#### Scenario: Sitemap

- **WHEN** un crawler lee `/sitemap.xml`
- **THEN** toda `<loc>` y `xhtml:link` usa `https://omnidance.tech`.

### Requirement: Posicionamiento en metadata global

El metadata por defecto del sitio (title/description/keywords) SHALL
describir el producto como la app de gestión para academias de baile y
productores de eventos, y como referencia de sociales y congresos de
la escena; no solo como app para bailarines.

#### Scenario: Home en snippet de búsqueda

- **WHEN** un crawler lee el metadata de `/`
- **THEN** title/description mencionan gestión de academias, eventos de
  productores o la referencia de sociales/congresos.

### Requirement: Guía para agentes de IA

El sitio SHALL servir `/llms.txt` (texto plano, convención llmstxt)
resumiendo qué es Omnidance y enumerando sus secciones públicas
principales con URLs absolutas del dominio primario.

#### Scenario: Agente lee llms.txt

- **WHEN** un agente hace `GET /llms.txt`
- **THEN** recibe `200 text/plain` con el resumen del sitio y enlaces a
  `https://omnidance.tech/…`.

### Requirement: Sección de comparación de costos visual

La sección "por cada $10.000" de las landings pro (`costTable` del
catálogo) SHALL presentarse como cards visuales por medio de cobro o
venta — una por fila del catálogo — con el costo como dato primario,
el método como label y "quién hace el trabajo" como texto secundario;
nunca como tabla de texto plano. En `/para-academias` la sección MUST
incluir además un flujo de pasos del dinero (el alumno paga → la
plataforma ordena → la academia recibe). En `/para-productores` la
baja de fee por plan MUST mostrarse como contenido destacado con los
montos por tier (gestionada y por métodos propios), no solo en la
nota al pie.

#### Scenario: Academia ve el flujo del dinero

- **WHEN** un visitante abre `/para-academias`
- **THEN** la sección "Tu academia cobra sola" muestra los pasos
  alumno → plataforma → academia seguidos de una card por medio de
  cobro con su costo destacado

#### Scenario: Productor ve el fee por plan

- **WHEN** un visitante abre `/para-productores`
- **THEN** la sección "Tu taquilla trabaja mientras produces" muestra
  una card por medio de venta y una banda destacada con el fee
  reducido de Standard y Pro por cada $10.000

#### Scenario: Fila nueva del catálogo sin cambio de código

- **WHEN** el catálogo `costTable.rows` gana o pierde una fila
- **THEN** la sección renderiza una card por fila sin tocar el
  componente
