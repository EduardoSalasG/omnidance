# Design — add-clarity

## Decisiones

- **Mismo patrón que GTM** (`components/gtm.tsx`): componente server
  `ClarityScript` en `apps/web/src/components/clarity.tsx`, inline
  `dangerouslySetInnerHTML` con el snippet oficial, gateado por
  `NEXT_PUBLIC_CLARITY_ID`. Clarity no tiene variante `<noscript>` —
  solo va el script en `<head>`.
- **CSP**: `script-src` suma `https://*.clarity.ms` (wildcard de
  subdominio: la guía de CSP de Microsoft pide `*.clarity.ms` porque el
  tag inyecta recursos adicionales). La telemetría/pixels quedan
  cubiertos por `connect-src https:` e `img-src https:` ya existentes;
  no se agregan `frame-src` ni otras directivas.
- **Env var**: `NEXT_PUBLIC_CLARITY_ID` en `netlify.toml`
  `build.environment`, mismo bloque que `NEXT_PUBLIC_GTM_ID`.
- **Orden**: `<ClarityScript/>` después de `<GtmScript/>` en `<head>`
  (ambos síncronos e independientes).

## Riesgos

- Recordings de sesión pueden capturar datos sensibles en inputs —
  mitigación nativa de Clarity (masking por defecto); cualquier
  masking extra se configura en el panel de Clarity, no en código.
- CSP rota → tag no carga. Mitigado por el escenario de spec + smoke.
