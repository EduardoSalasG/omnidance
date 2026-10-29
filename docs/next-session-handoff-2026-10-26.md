# Handoff; 2026-10-26 (multipaís currency + phone)

## Estado

`dev` = `bca7e362`. Working tree limpio. Dos changes implementados,
revisados (2 rondas: reviewer → fixer → verde) y archivados:
`multipais-currency` + `multipais-phone` = tasks 2 y 3 de
`multipais-foundation` (marcadas [x] en su tasks.md). Specs canónicas
mergeadas; `platform-multicountry` ahora es spec propia.

## Entregado

**multipais-currency**; cobro multi-moneda real, agnóstico de país:
- Schema: `Country.currency`, `MembershipPlan.currency`+`remoteRefs`,
  `MembershipSubscription.currency`, `PaymentClaim.currency`,
  `PlatformSubscription.countryCode`, `Person.gatewayCustomerIds`
  (mapa `{provider: customerId}`; `flowCustomerId` = espejo legacy FLOW).
- `chargeSpec` resuelve `TierPrice(tierCode,kind,cycle,country)` →
  fila CL → param `*_monthly_clp`; devuelve `{amount,currency}`.
- Provider de subs por moneda: CLP→param `subscription_gateway`,
  otra→primer `SubscriptionProvider` que la soporte; error explícito
  si ninguno. Espejos remotos por `"<GW>:<CUR>"` en `remoteRefs`
  (Stripe lookup_key `omni_<planId>_<cur>`); `flowPlanId` intacto.
- Promos `FIXED_CLP` solo aplican a cargos CLP; PERCENT a todo.
- Ticket de puerta hereda `event.currency`; orden WORKSHOP usa la
  moneda del país de la academia.
- Admin: `GET/POST/PUT /admin/tier-prices` + `/admin/facturacion/precios`
  (link desde facturacion). Front: `formatMoney(amountMinor, currency)`
  (divide por 10^fractionDigits resuelto); vistas billing/pro reciben
  `prices` del price book del país del actor.
- Migraciones aplicadas: `20261114_multipais_currency`,
  `20261116_person_gateway_customer_ids`. Seed: TierPrice CL para
  tiers academy+producer derivados de params (update:{} no pisa).

**multipais-phone**; normalización E.164 end-to-end:
- `normalizePhone(raw, defaultCountry)` + `normalizePhoneOrNull` en
  `@omnidance/shared` (libphonenumber-js 1.12.31); `phone`=E.164,
  `phoneCountryCode`=ISO-2 derivado; `+` overridea el default.
- Write paths: PATCH /me, POST /me/complete-profile, door-sale
  (default=país del venue), POST /leads, import CSV (país academia),
  convertLead/demo normalizan leads legacy.
- `PhoneInput` (selector | contexto): selector en perfil/datos,
  completar, bienvenida; contexto (sin selector, `+` override) en
  ProLeadForm. Door-sale no tiene UI staff aún (API lista).
- Migración `20261115_multipais_phone`: backfill CL + normalización
  dup-safe (intra-candidatos y contra filas ya `+`).

## Verificación

- vitest: payments+checkins 663, people/checkins/leads/academies 368,
  shared 20; todo verde post-fixes.
- tsc api+web limpio; i18n-parity 0 missing/0 extra (4263 keys).
- `migrate diff` schema↔migrations vacío; `db:seed` corrido OK.
- `openspec validate` verde; ambos changes archivados con deltas
  mergeados; openapi.json + postman regenerados (349 paths);
  qa-flows-inventory y architecture actualizados.

## Cierre de gaps (sesión continuación)

- **promoState build**: fix `962cd7e3` (export removido de la page).
- **Webhook Stripe** (`a537fd7c`, change `stripe-subs-webhook`
  archivado): `webhook.controller` despacha billing events por target;
  socialPass→Pase, remoteId MembershipSubscription→reconcile puntual,
  remoteId PlatformSubscription→RENEWAL_SETTLED/gracia/CANCELED;
  `customer.subscription.updated` cubierto; dedup estructural por
  invoice/refId (webhook+polling no doble-liquidan). vitest 637 verde.
- **E2e**: RESUELTO 2026-10-27; el bloqueo era el rango de puertos
  excluidos de Windows (2809-3208, 3307-3506). `next dev -p 3600` +
  `QA_BASE_URL=http://localhost:3600 pnpm test:e2e` funciona: 11/14 en
  el run completo y los 2 tests restantes (cartelera, ciclo-evento)
  pasan en retry; flakes de timing en dev, no regresiones. Ojo: si el
  suite cae con "Internal Server Error" fijo, es `.next` corrupto
  (mata next, `rm -rf apps/web/.next`, reinicia; documentado en
  AGENTS). Segundo fix de build: `promoDiscountLabel` también estaba
  exportado en promos/page (mismo patrón que promoState).

## Cierre 2026-10-27: multipais-polish (archivado)

Pendientes reales + deuda técnica de currency/phone, cerrados:

- **Event.currency declarativa**: `POST/PATCH /events` acepta currency
  ISO-4217 validada contra `Country.currency`; default = moneda del
  país del venue → CLP. Con pagos registrados la moneda queda congelada
  (409). Form del productor con select de moneda que propone la del
  venue. Nuevo `GET /cities/catalog` (países+moneda+ciudades) que alimenta
  ese select y el de academias.
- **Academy.whatsapp**: ahora pasa por `normalizePhone` (país de la
  academia) y persiste E.164 sin `+` listo para wa.me; inválido → 400.
- **producerMonthlyGross por moneda**: devuelve `Record<currency,amount>`,
  nunca suma cruzada; el tope de tier se evalúa en la moneda del país de
  cobro / de la suscripción; la vista Pro muestra el desglose.
- **Onboarding academia no-CL**: `CreateAcademyDto.cityId` + form con
  select país→ciudad (default CL). Con fila TierPrice del país + gateway
  del mercado, el alta queda self-service.
- **precios console-patterns**: lista read-only + CTA → `/nuevo` + ficha
  `/[id]` con edición precio/moneda.
- **Backfill phone verificado**: dev limpio (3 phones, todos E.164 + CL).
- 3 specs nuevos/extendidos (89 tests verdes), openapi.json + postman
  regenerados (350 paths), i18n 0/0, `next build` verde.

## Cierre 2026-10-27b: producer-pro-tiers (archivado)

Producer Pro nivelado implementado:

- **Matriz real por tier** (`actor-entitlements.ts`, keys del enum):
  `PRO_STARTER`=analytics+exports+staff≤1 · `PRO_GROWTH`=+crm,staff≤2 ·
  `PRO_BIG`=todo+staff ilimitado. `producerEffectiveTier` devuelve el
  tierCode real; `assertActorFeature` quedó tier-aware sin tocar
  endpoints. `requiredTier` = tier mínimo que cubre la feature.
- **Trial = PRO_STARTER** (decisión en design.md): el trial de
  lanzamiento vende el piso Pro; pierde crm/campaigns/benchmark.
- **Cupo staff**: `POST /producer/staff` ahora exige feature
  `multiStaff` (¡el roster no tenía gate Pro; FREE tenía nómina
  ilimitada; quedó cerrado) + cupo por tier → 403 `{error:"staff_quota"}`.
  Re-agregar nómina existente no consume cupo; admin bypassa.
- **Renovación→upgrade**: `enforceProducerTier` ya existía; evalúa
  gross 90d en moneda de la sub y fija `pendingTierCode` + notifica.
  Solo se agregó spec coverage (2 tests). Caveat conocido: su dedup por
  notificación enviada no re-fija pending si se limpió por otro flujo.
- **Vista Pro**: `staffUsed`/`staffLimit`/`enabledFeatures`; UI muestra
  tier + cupo + features incluidas.
- 173 tests verdes en specs tocados, i18n 0/0, builds limpios.
  (Nota: `pnpm --filter api build` OOMeó 2 veces por presión de
  commit del SO; reintentar con `--maxWorkers=2` en vitest si pasa.)

### Gaps que quedan (honestos)

- **impeccable detect**: sigue sin correrse; el binario/skill no está
  instalado en este entorno. Si se instala, correr sobre PhoneInput,
  precios/*, event-form, create-academy-form, pro-section.
- **E2e flake**: `dancer cartelera` y `productor ciclo-evento` son
  sensibles a timing del dev server (ver comentarios en el spec).
- **Roadmap foundation sin tocar**: tasks 10 (packs), 11 (prácticas),
  13 (congresos); Producer Pro nivelado; Fintoc payout; tarifa Pase.


## Pendientes / gaps honestos
- **Academias fuera de CL: alta ya resuelta** (multipais-polish), pero
  operar en un país nuevo requiere fila TierPrice del país + gateway de
  ese mercado configurado (Stripe activo fuera de CLP).
- `PayoutRail` Fintoc sigue pendiente; tarifa Pase Social sin fijar.
- Web `next build` tiene error PRE-EXISTENTE ajeno a este cambio:
  `.next/types` rechaza export `promoState` en
  `admin/facturacion/promos/page.tsx` (commit 99830574); typecheck
  limpio, pero el build de prod puede fallar; revisar antes del
  próximo release.
- Prisma client: el dev server en watch (PID node) pudo haber quedado
  con DLL stale tras `prisma generate`; si la API dev tira errores de
  columna, reiniciar `pnpm dev:api`.
- multipais-foundation sigue abierto: tasks 10 (packs), 11 (prácticas
  free), 13 (congresos).

## Notas técnicas de la sesión

- `pnpm add` re-resuelve links y dejó symlinks de vitest apuntando a un
  hash de peers viejo → `MODULE_NOT_FOUND`; `pnpm install` lo repara.
- `openspec archive` deja `.openspec-archive.lock` stale si corre dos
  veces seguidas en el mismo comando; borrar el lock y reintentar.
- Orquestación: 2 implementadores paralelos + 2 reviewers + 2 fixers.
  Puntos compartidos resueltos por el orquestador: schema.prisma
  (currency only), lockfile (dep pre-instalada), door-sale currency
  line, seeds `phoneCountryCode`, docs regeneradas, qa-inventory.
