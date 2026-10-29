# responsive-app-shell; delta admin-console-billing-nav

## ADDED Requirements

### Requirement: Consola admin drawer-only en móvil

El rol ADMIN SHALL comportarse como las consolas densas
(ACADEMY_OWNER, PRODUCER) en viewports `<lg`: sin bottom tab bar (el
contenido no reserva su espacio) y con el drawer lateral como única
navegación, accesible desde la hamburguesa del appbar. En `≥lg` la
sidebar persistente sigue siendo la navegación (sin cambios).

#### Scenario: Sin tab bar móvil

- **WHEN** un usuario con rol activo ADMIN navega en viewport `<1024px`
- **THEN** no se renderiza el bottom tab bar y el contenido no reserva
  su padding

#### Scenario: Drawer como única navegación

- **WHEN** el admin abre la hamburguesa en móvil
- **THEN** el drawer lista Inicio primero, luego los grupos por dominio
  (Gestión, Facturación, Comercial, Analítica, Plataforma, Social)

### Requirement: Cobertura completa de destinos admin

El drawer/sidebar del rol ADMIN SHALL listar todos los destinos de la
consola agrupados por dominio operativo: **Gestión** (`/admin/usuarios`,
`/admin/roles`, `/admin/academias`, `/admin/catalogos`),
**Facturación** (`/admin/facturacion/transacciones`,
`/admin/facturacion/suscripciones`, `/admin/facturacion` Documentos,
`/admin/finanzas`), **Comercial** (las 4 superficies CRM +
`/admin/campanas` Difusión), **Analítica** (`/analitica`,
`/admin/datos`, `/analitica/usuarios`), **Plataforma**
(`/admin/parametros`, `/admin/jobs`, `/admin/auditoria`) y **Social**
(`/eventos`, `/staff`). El hub `/admin` se elimina; redirige a
`/inicio`.

#### Scenario: Ninguna página huérfana

- **WHEN** el admin recorre el drawer o la sidebar
- **THEN** cada página de `/admin/*` alcanzable tiene su ítem de
  navegación y el estado activo refleja la ruta actual (`/crm` y
  `/admin/facturacion` matchean exacto porque sus prefijos cubren
  sub-páginas propias)

#### Scenario: Hub deprecado

- **WHEN** un link viejo apunta a `/admin`
- **THEN** la ruta redirige a `/inicio` preservando el locale
