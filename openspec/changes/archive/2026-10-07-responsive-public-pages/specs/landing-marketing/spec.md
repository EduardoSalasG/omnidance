# landing-marketing Specification Delta

## ADDED Requirements

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
