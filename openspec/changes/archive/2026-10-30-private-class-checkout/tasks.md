# Tasks: private-class-checkout

## API
- [x] 1. `PaymentClaim.kind String @default("PLAN")` + migración;
  intents privados: `{privateClass:true}` → kind PRIVATE_CLASS,
  planId null, amount=privateLessonPrice; idempotencia por kind.
- [x] 2. approve() de claim PRIVATE_CLASS → Payment MANUAL PAID
  orderType PRIVATE + materializa PrivateLesson "por asignar"
  (reusar la lógica del settle PRIVATE de checkout.service).
- [x] 3. claims/mine devuelve kind; spec tests nuevos.

## Web
- [x] 4. Page `/academias/[id]/checkout/particular` + client: quote
  (title "Confirmar clase particular", academy, precio), ManualPayPanel
  (variante privateClass: intent→AWAITING→upload→toast+return a
  /academias/[id]), breakdown, CTA Flow al final → POST
  /checkout/private-class (stub→awaiting+sim, real→assign).
- [x] 5. `BuyPrivateClass` → `router.push(checkout)` (quita buy inline).
- [x] 6. i18n ×4 + tsc + qa-flows-inventory + archivar change.
