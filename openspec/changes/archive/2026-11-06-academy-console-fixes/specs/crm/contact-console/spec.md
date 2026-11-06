# Delta: crm/contact-console

## ADDED Requirements

### Requirement: Actor CRM por defecto según la lente activa

La resolución del actor CRM (`useCrmContext`) SHALL respetar la lente
activa del dispositivo (`useActiveRole`): con lente `ACADEMY_OWNER`
el actor por defecto SHALL ser la academia seleccionada en la consola
del owner (localStorage `omnidance:academy-id`) cuando pertenezca a
sus academias propias, y si no existe o no calza, la primera academia
donde es owner; solo cuando no tenga academias propias cae al primer
actor disponible. Con lente `PRODUCER` el actor por defecto SHALL ser
su propio productor. Con cualquier otra lente se conserva la
preferencia previa (academia persistida de la consola, si no el
primer actor de la lista).

La lista de actores ofrecidos SHALL seguir incluyendo todas las
academias donde la persona es owner (las membresías como instructor
o staff no cuentan) más el productor propio si tiene el rol.

#### Scenario: owner PRO que también es productor

- **GIVEN** una persona con roles `PRODUCER` y `ACADEMY_OWNER`, una
  academia propia con tier PRO y la lente activa `ACADEMY_OWNER`,
  sin academia persistida en la consola
- **WHEN** abre `/crm`
- **THEN** el actor resuelto es su academia (no su productor) y ve el
  CRM de la academia, no el paywall

#### Scenario: paywall con copy del actor real

- **GIVEN** una persona con lente `PRODUCER` cuyo productor no cubre
  la feature `crm`
- **WHEN** abre `/crm`
- **THEN** ve el `TierPaywall` con `actorType` PRODUCER y el copy
  correspondiente a productor

#### Scenario: owner con academia COBROS

- **GIVEN** un owner con lente `ACADEMY_OWNER` cuya academia no
  cubre `crm`
- **WHEN** abre `/crm`
- **THEN** ve el `TierPaywall` con `actorType` ACADEMY y el CTA a la
  suscripción de la academia
