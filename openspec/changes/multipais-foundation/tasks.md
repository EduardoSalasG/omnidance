# Tasks — multipaís-foundation

> Change de diseño: define el contrato. La implementación entra por
> changes separados que referencian estas secciones.

- [x] 1. Schema: `Country`, `City` (slug, geohash, timezone IANA) +
  `Venue.cityId` + backfill Santiago
- [~] 2. `currency` en Event (done; falta Ticket/suscripciones/
  membresías) + price book `tier × country`
- [~] 3. `Person.phoneCountryCode` (campo done; falta formatos
  por país en UI/validación)
- [ ] 4. Adapter Stripe en `gateway-registry` (+MercadoPago opc.);
  port `PayoutRail` (Chile=Fintoc, resto=Stripe Connect)
- [ ] 5. Scoping regional: `AdminRegion(personId, regionId)` +
  filtro de colas de validación por región
- [ ] 6. Consent por jurisdicción (GDPR vs Ley 19.628)
- [ ] 7. Landing por ciudad + "cerca de mí" (geohash)
- [ ] 8. City guides curadas (editorial por ciudad)
- [ ] 9. "Mi viaje" — trip planner de actividades
- [ ] 10. Pases multi-día / packs cross-academia
- [ ] 11. Prácticas/socials free como adquisición por ciudad
- [ ] 12. Pase Social (suscripción Person, créditos ClassPass):
  N créditos/mes canjeables en **sociales, prácticas y eventos**
  (NO clases de academia — el baile tiene trayectoria, no es
  consumible hop-to-hop como gimnasio). Canje por QR/check-in
  existente, precio dinámico por demanda (hot=2, práctica=1),
  rollover con tope, top-ups, intro offer, límite por evento para
  empujar asistencia a eventos flojos. Sirve en Chile hoy y al
  viajero después. Drop-in de academias = opt-in tardío, no core.
  **Pricing**: no-suscriptor paga precio productor + cargo de
  servicio en puerta (~$1.000); suscriptor paga siempre preventa +
  $0 cargo — el ahorro visible (gap preventa/puerta + cargo) fondea
  y vende el pase. El cargo es revenue de plataforma, no toca el
  payout del productor.
- [ ] 13. Congresos/festivales (evento multi-día: tracks de
  workshops, socials nocturnas, artistas, full pass vs day pass)
