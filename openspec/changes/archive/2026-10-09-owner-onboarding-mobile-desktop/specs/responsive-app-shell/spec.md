## MODIFIED Requirements

### Requirement: Tours de onboarding en desktop

Los tours de primera visita que referencian elementos del chrome móvil
(`data-tour` de tabs/sheet/drawer) MUST NOT fallar ni quedar bloqueados
en desktop: los pasos cuyo target no exista se omiten o el tour no corre
en `≥lg`. Además, los tours de las consolas que el rol usa en ambos
viewports SHALL declarar un paso de navegación con target en cada
chrome (drawer/hamburguesa en `<lg`, sidebar en `≥lg`), de modo que la
guía de navegación no quede reducida o ausente en desktop.

#### Scenario: Tour en desktop

- **WHEN** un usuario nuevo entra a una sección con tour en `≥lg`
- **THEN** la app no muestra popovers rotos ni apuntando a elementos
  inexistentes

#### Scenario: Tour de consola con navegación cubierta en ambos chromes

- **WHEN** un owner o staff abre su consola por primera vez en `≥lg`
- **THEN** el tour incluye un paso de navegación apuntando a la sidebar
