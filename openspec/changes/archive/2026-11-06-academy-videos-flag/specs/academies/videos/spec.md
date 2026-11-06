## ADDED Requirements

### Requirement: Módulo de videos detrás del flag academy_videos

La superficie de videos de academia SHALL estar gateada por el flag
`academy_videos` del catálogo de funcionalidades (mapa público
`GET /features`, fail-closed: flag ausente = OFF). Con el flag OFF:
las páginas `/academia/videos`, `/academia/videos/nuevo` y
`/academia/videos/[id]` SHALL mostrar el estado "módulo desactivado"
en vez del contenido o del paywall de tier; la card "Videos" de la
grilla del hub `/academia` SHALL NOT renderizarse; y el ítem
`/academia/videos` del sidebar del owner SHALL ocultarse. El flag es
adicional al gate de tier `videos`: con el flag OFF ni una academia
PRO ve el módulo; con el flag ON aplica el gate de tier vigente
(`AcademyTierGate` + 403 `tier.required` del API). Los endpoints
`/academies/:id/videos*` SHALL NOT cambiar: el gate es de superficie,
igual que `academy_explore`.

#### Scenario: Flag OFF muestra estado desactivado

- **WHEN** el flag `academy_videos` está OFF y un miembro abre
  `/academia/videos`, `/academia/videos/nuevo` o `/academia/videos/[id]`
- **THEN** la página muestra el estado "módulo desactivado" en vez del
  listado, el form o la ficha, y nunca el TierPaywall

#### Scenario: Flag OFF oculta la card del hub

- **GIVEN** un staff de una academia PRO con cap `schedule`
- **WHEN** el flag `academy_videos` está OFF y abre el hub `/academia`
- **THEN** la grilla no lista la card de videos aunque el tier cubra
  la feature

#### Scenario: Flag OFF oculta el ítem del sidebar

- **WHEN** el flag `academy_videos` está OFF y el owner abre el
  sidebar de su consola
- **THEN** el ítem "Videos" no se lista (flag por ítem del nav, mismo
  mecanismo que `city_guides`)

#### Scenario: Flag ON conserva el gate de tier

- **WHEN** el flag `academy_videos` está ON (default del seed)
- **THEN** `/academia/videos*` opera como antes: PRO con cap entra,
  tiers sin la feature `videos` ven el TierPaywall y el API sigue
  respondiendo 403 `tier.required` como red de seguridad
