## MODIFIED Requirements

### Requirement: Tours de onboarding en desktop

Los tours de primera visita que referencian elementos del chrome móvil
(`data-tour` de tabs/sheet/drawer) MUST NOT fallar ni quedar bloqueados
en desktop: los pasos cuyo target no exista se omiten o el tour no corre
en `≥lg`. Además, los tours de las consolas que el rol usa en ambos
viewports SHALL declarar un paso de navegación con target en cada
chrome (drawer/hamburguesa en `<lg`, sidebar en `≥lg`), de modo que la
guía de navegación no quede reducida o ausente en desktop.

El popover del tour SHALL mantenerse dentro del viewport en todo
momento: su ancho y alto están topados relativos al viewport (contenido
scrolleable si excede el alto disponible) y el runner SHALL resolver
como anchor solo elementos que intersecten el viewport (un elemento
visible en DOM pero fuera de pantalla por transform o scroll - p.ej. la
appbar oculta - no califica como anchor y su paso se omite).

El copy de los pasos SHALL usar el vocabulario visible de la superficie
que describe (los labels que el usuario ve en pantalla) y español
plano: sin anglicismos internos ni tecnicismos que la UI no muestra.

#### Scenario: Tour en desktop

- **WHEN** un usuario nuevo entra a una sección con tour en `≥lg`
- **THEN** la app no muestra popovers rotos ni apuntando a elementos
  inexistentes

#### Scenario: Tour de consola con navegación cubierta en ambos chromes

- **WHEN** un owner o staff abre su consola por primera vez en `≥lg`
- **THEN** el tour incluye un paso de navegación apuntando a la sidebar

#### Scenario: El popover no se sale de la pantalla

- **GIVEN** un tour corriendo en un viewport estrecho (≥320px)
- **WHEN** cualquier paso se muestra
- **THEN** el popover queda completo dentro del viewport (sin recorte
  lateral ni vertical)

#### Scenario: Anchor fuera de pantalla se omite

- **GIVEN** un paso cuyo anchor existe en el DOM pero quedó fuera del
  viewport por transform o scroll (p.ej. la appbar autohidden)
- **WHEN** el tour resuelve sus pasos
- **THEN** ese paso se omite y el tour continúa con los demás
