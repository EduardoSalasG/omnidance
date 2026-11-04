## Purpose

Las landings de marketing (`/`, `/pro`, `/para-academias`, `/para-productores`) sirven HTML completo sin emitir requests al API en runtime: su data dinámica vive en catálogos JSON commiteados y editables, regenerables desde los endpoints públicos bajo demanda.

## ADDED Requirements

### Requirement: Landings sin requests al API en render

Las rutas `/`, `/pro`, `/para-academias` y `/para-productores` SHALL renderizarse sin emitir ningún request al API desde el servidor. Toda la data dinámica que muestran (eventos destacados del strip "esta semana", ItemList del JsonLd, academias del strip de `/para-academias`) SHALL provenir de los catálogos de contenido commiteados. Quedan fuera de la regla los requests disparados por acción del usuario (submit del lead form, login). Las demás superficies de `(marketing)` (`/ciudades`, `/pase`, `/e/[id]`, `/reclamar/[token]`, `/login`) conservan su comportamiento dinámico actual: no son landings de contenido.

#### Scenario: Landing con API caído

- **WHEN** un visitante anónimo abre `/` con el API inaccesible
- **THEN** la página se sirve completa: hero, strip de la semana y
  JsonLd se alimentan del catálogo commiteado

#### Scenario: Acción del usuario sí pega al API

- **WHEN** un visitante envía el lead form de `/pro`
- **THEN** el POST al endpoint de leads sale normal (la regla cubre el
  render, no las acciones del usuario)

### Requirement: Catálogos de contenido editables

Los catálogos SHALL vivir en archivos JSON commiteados bajo `apps/web/src/content/`, editables a mano sin cambios de código: `events.json` (eventos destacados) y `academies.json` (academias del directorio público). Cada catálogo SHALL declarar `generatedAt` (ISO 8601) con la fecha de su última regeneración. Los filtros temporales ("esta semana") SHALL evaluarse en render sobre el catálogo, así un snapshot envejece con gracia: los eventos vencidos dejan de contarse sin necesidad de regenerar.

#### Scenario: Edición manual del catálogo

- **WHEN** se edita `events.json` a mano y se redeploya la web
- **THEN** las landings reflejan el contenido editado sin tocar código

#### Scenario: Evento vencido en el catálogo

- **WHEN** el catálogo incluye un evento cuya fecha ya pasó
- **THEN** el strip "esta semana" no lo cuenta ni lo muestra (el
  filtro corre en render)

### Requirement: Sincronización de catálogos desde el API

Un script de sincronización (`pnpm --filter @omnidance/web content:sync`) SHALL regenerar los catálogos consultando los endpoints públicos del API (`/events`, `/academies/public`) y escribir los JSON con `generatedAt` actualizado. SHALL ser idempotente (data igual produce archivos iguales) y SHALL fallar ruidosamente cuando el API no responde, sin pisar catálogos existentes con data vacía o parcial.

#### Scenario: Sync con API viva

- **WHEN** se corre `content:sync` con el API respondiendo
- **THEN** los catálogos quedan actualizados con la data pública
  vigente, listos para commitear

#### Scenario: Sync con API caído

- **WHEN** el API no responde durante el sync
- **THEN** el script termina con error y los catálogos previos quedan
  intactos
