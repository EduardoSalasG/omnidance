# Handoff - 2026-10-20b (OTP híbrido shipeado + change preventa-academia)

## Completado en esta sesión (commits en dev)

| Commit | Slice |
|---|---|
| `df893ba` | feat(auth): código OTP de 6 dígitos junto al magic link — change `auth-email-otp` archivado a spec canónica |
| `f7715b6` | docs(openspec): change `academy-presale-commission` listo para implementar (no implementado) |

### auth-email-otp (archivado → `openspec/specs/auth/email-otp`)

- `POST /auth/magic-link` ahora emite link + código OTP de 6 dígitos en el
  mismo correo (`magicLinkEmailHtml(link, code)`). El claim-path de
  `POST /auth/register` lo hereda por `sendMagicLink` compartido.
- Nueva tabla `AuthOtp` (migración `20261102000000_auth_otp`): email,
  `codeHash` = sha256(code + JWT_SECRET como pepper), `consent`,
  `expiresAt` (~10 min), `attempts` (máx 5), `consumedAt`. Pedir nuevo
  acceso consume los activos previos del email.
- `POST /auth/otp/verify {email, code}` → mismo desenlace que
  `GET /auth/verify` pero JSON `{ok:true, isNew}`; 401 uniforme
  "Código inválido o expirado" ante cualquier fallo; `AUTH_THROTTLE`.
- Front `/login`: tras enviar el correo aparece el paso de código
  (`autoComplete="one-time-code"`, `inputMode="numeric"`, sanitización
  `\D`), redirect `/bienvenida` si `isNew` else `/inicio`, respeta `next`
  seguro. Keys `login.sent/otp*` en `es-CL.json`.
- **ResendMailer**: sin `RESEND_API_KEY` el HTML (que ahora contiene el
  OTP) solo se loguea si `NODE_ENV !== "production"` — antes logueaba
  siempre, riesgo de credenciales en logs prod.
- Verificación: 25/25 tests auth, typecheck api+web, `openspec validate`
  4/4, migración aplicada con `migrate deploy`, **smoke E2E real**:
  magic-link → código recuperado por fuerza bruta del hash local →
  `otp/verify` 200 + cookie `omnidance_session` + `{ok:true,isNew:false}`
  + reuso → 401 (single-use confirmado).
- `docs/openapi.json` + postman regenerados (280 paths);
  `docs/architecture.md` actualizado (auth, consent, throttle, demo→real).

### academy-presale-commission (change listo, SIN implementar)

- Modelo acordado con el usuario: **canal atribuido, regularización
  externa**. La app vende a precio de lista; `Payment.soldByAcademyId` +
  `academyCommissionClp` congelan la atribución; la plataforma NO le paga
  a la academia — solo computa la deuda productor→academia y el productor
  la marca pagada unilateralmente (sin confirmación de la academia).
- Artefactos: `openspec/changes/academy-presale-commission/{proposal,
  design,tasks}.md` + deltas en `checkout/ticket-purchase`,
  `payments/academy-presale-commission` (nueva cap), `payments/fee-model`.
- Modelo de datos propuesto: `AcademySaleAgreement` (eventId/seriesId,
  academyId, commissionPct, status INVITED→ACTIVE/DECLINED, maxTickets?),
  columnas en `Payment`, `AcademySaleSettlement` (amountDue, status
  PENDING→PAID, paidAt, evidenceUrl?).
- Link de venta: `/eventos/[id]?a=<academyId>` validado contra acuerdo
  ACTIVE; comprador no ve nada nuevo.

## Pendiente / próximos pasos

- **Implementar `academy-presale-commission`** (próximo slice sugerido):
  tasks en el change. Orquestador corre migraciones una a la vez.
- Pendientes del handoff anterior siguen vivos: task 6.3 de
  `analytics-query-engine` (QA manual viewports), seed `SEED_ENV=dev`
  contra prod, verificación rebuild Netlify.
- Considerar QA manual del login OTP en PWA instalada (flujo real con
  Resend: el correo sí salió en el smoke local).

## Notas

- El smoke E2E recuperó el código por fuerza bruta local del hash (1e6
  sha256) — confirma que el pepper funciona pero también que el OTP es
  crackeable offline si la DB se filtra con el secreto; aceptable para
  credencial de 10 min / 5 intentos.
- Archivos temporales de sesión eliminados (`crack-otp-temp.cjs`).
- Untracked sin commitear (ruido ajeno): `.agents/`, `.claude/`,
  `.devin/skills/brag/`, `brag-output/`, `skills-lock.json`.
