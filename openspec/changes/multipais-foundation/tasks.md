# Tasks — multipaís-foundation

> Change de diseño: define el contrato. La implementación entra por
> changes separados que referencian estas secciones.

- [ ] 1. Schema: `Country`, `City` (slug, geohash, timezone IANA) +
  `Venue.cityId` + backfill Santiago
- [ ] 2. `currency` en Event/Ticket/suscripciones/membresías +
  price book `tier × country`
- [ ] 3. `Person.phoneCountryCode` + formatos por país
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
- [ ] 12. Pase Viajero (suscripción Person, modelo **créditos
  ClassPass**: N créditos/mes, coste por clase/spot dinámico por
  demanda, rollover con tope, top-ups, red de academias opt-in con
  revenue share por redención, intro offer)
- [ ] 13. Congresos/festivales (evento multi-día: tracks de
  workshops, socials nocturnas, artistas, full pass vs day pass)
