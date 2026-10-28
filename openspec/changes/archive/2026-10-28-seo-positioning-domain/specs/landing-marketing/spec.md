# landing-marketing Specification Delta — seo-positioning-domain

## ADDED Requirements

### Requirement: Dominio primario en la superficie SEO

Toda URL absoluta que el sitio emite para consumo externo — canonical,
`og:url`, `twitter:*`, JSON-LD, `sitemap.xml` y `robots.txt`
(`Sitemap:`) — SHALL usar el dominio primario `https://omnidance.tech`
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
la escena — no solo como app para bailarines.

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
