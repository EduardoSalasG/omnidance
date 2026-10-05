# loading-states — deltas

## ADDED Requirements

### Requirement: Cero contenido antes del primer fetch

Toda página que fetchea datos SHALL renderizar un estado de carga
(skeleton con la forma del layout conocido, o `PageLoading` cuando la
forma depende del resultado — p.ej. gates de rol) hasta que el primer
fetch resuelva o falle. MUST NOT renderizar empty-state, valores por
defecto (`?? 0`, placeholders de texto) ni contenido parcial que luego
desaparece o cambia.

#### Scenario: fetch pendiente

- **WHEN** una página monta y su fetch inicial está en vuelo
- **THEN** el usuario ve solo el skeleton/spinner diferido — ningún
  texto, número ni empty-state de datos reales.

#### Scenario: empty-state legítimo

- **WHEN** el fetch resolvió con datos vacíos
- **THEN** el empty-state se muestra — nunca antes.

### Requirement: Secciones secundarias sin defaults ni pop-in engañoso

Las secciones que dependen de fetches secundarios SHALL mostrar skeleton
o mantenerse ocultas hasta resolver — nunca renderizar `0`, "—" ni
empty-state como valor provisional. Las secciones condicionales por
lente/modo SHALL resolver la lente antes de pintar contenido de datos
(no flash de la lente default).

#### Scenario: racha en carga

- **WHEN** `/perfil` cargó `/me` pero el fetch de streak sigue en vuelo
- **THEN** la card de racha muestra skeleton — no "0".

#### Scenario: insignias en carga

- **WHEN** el fetch de badges sigue en vuelo
- **THEN** la sección muestra skeleton — no el empty-state "aún no
  tienes insignias".

### Requirement: Consistencia SSR/hydration de lente

Ningún contenido dependiente de `localStorage` (view-mode, active-role)
SHALL pintarse distinto entre el HTML del servidor y el primer render
del cliente: o la página gatea en carga (mismo output en ambos), o la
sección usa un gate de montaje/`useSyncExternalStore` con snapshot de
servidor consistente.

#### Scenario: lente academy persistida

- **WHEN** un usuario con `view-mode=academy` abre una página social
- **THEN** el primer paint ya respeta academy — no aparece contenido
  social que desaparece al hidratar.
