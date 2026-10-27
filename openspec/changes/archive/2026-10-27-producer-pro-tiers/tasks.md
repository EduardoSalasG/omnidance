# Tasks — producer-pro-tiers

- [x] 1. `PRODUCER_TIER_FEATURES` con keys del enum
      (`PRO_STARTER`/`PRO_GROWTH`/`PRO_BIG`) y matriz aprobada:
      STARTER=[analytics,exports,multiStaff], GROWTH=+crm,
      BIG=todas. `PRODUCER_TIER_ORDER` alineado. `producerEffectiveTier`
      devuelve el tierCode real (trial → tier del trial si existe,
      default PRO_STARTER — decidir y documentar).
- [x] 2. `PRODUCER_TIER_STAFF_LIMIT = {PRO_STARTER:1, PRO_GROWTH:2}` (BIG
      sin entrada = ilimitado). `POST /events/staff` cuenta ProducerStaff
      del productor y rechaza 403 al llegar al cupo (mensaje i18n).
- [x] 3. Renovación: al cobrar/activar renovación de suscripción
      producer, evaluar `producerMonthlyGross` en moneda de la sub
      contra el tope del tier; si exige superior → `pendingTierCode` +
      no bajar features hasta que se regularice (grace según convención
      existente). Documentar la decisión en design.md.
- [x] 4. `producerProView`: exponer `staffUsed`/`staffLimit` y las
      features habilitadas del tier; pro-section muestra tier + cupo.
- [x] 5. Specs vitest: matriz por tier, gating crm/benchmark por tier,
      cupo staff (1→403 en el 2do para STARTER), renovación con gross
      sobre el tope. i18n en parts existentes.
- [x] 6. `docs/qa-flows-inventory.md` + `docs/architecture.md` sync.
