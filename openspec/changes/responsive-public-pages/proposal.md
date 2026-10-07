## Why

El pase responsive anterior cubrió el chrome y las superficies con
sesión (dancer + consolas), pero las superficies públicas/marketing
quedaron sin una revisión dedicada: la landing comparte esqueleto en
`/`, `/para-academias`, `/para-productores` y `/pro`, y login,
bienvenida, documentos legales, reclamar y checkout/return son flujos
angostos centrados. En desktop algunas se ven planas (formularios sin
contenedor) o con poco aire vertical.

## What Changes

- **Landing elevada en `≥lg`**: el hero y las secciones SHALL ganar
  espaciado vertical de desktop (`lg:py-*`); la grilla de features MAY
  aumentar el gap/padding de cards; el strip de prueba social MAY
  pasar a fila envolvente en `lg`.
- **Login/registro como card en `≥lg`**: el formulario SHALL presentarse
  dentro de un contenedor card (borde + fondo `night-900`) en desktop;
  en `<lg` queda idéntico (contenido centrado, sin card).
- **Flujos angostos**: login, `/bienvenida`, `/reclamar/[token]`,
  `/checkout/return` y documentos legales MUST conservar medida de
  lectura angosta en desktop (no estirar formularios ni prosa legal a
  todo el ancho) - solo ajustes de padding/max-width moderados.
- Todo aditivo mobile-first: ninguna clase cambia el comportamiento en
  `<lg`; no se reestructura el DOM móvil.

## Capabilities

### Modified Capabilities
- `landing-marketing`: las landings y superficies públicas asociadas
  ganan requisito de adaptación desktop.
