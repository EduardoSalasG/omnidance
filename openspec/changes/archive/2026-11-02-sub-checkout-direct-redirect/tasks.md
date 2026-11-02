# Tasks; sub-checkout-direct-redirect

- [ ] `membership-checkout-client.tsx`: `needs_card` → `location.href` directo; eliminar phase `card_redirect`.
- [ ] `academy-billing.tsx`: redirect directo tras `paymentUrl`; eliminar interstitial.
- [ ] `webhook.controller.ts` `customerReturn`: redirect a `/checkout/return?sub=…&src=member`.
- [ ] `checkout/return/page.tsx`: CTA por `src` (member → /academias).
- [ ] Typecheck web + lint, commit, archive.
