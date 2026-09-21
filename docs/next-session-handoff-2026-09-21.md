# Handoff — 2026-09-21 — Leads /pro: formulario completo + acceso demo + vista admin

## Qué se hizo esta sesión

**Formulario `/pro` (landing negocios)**
- Nombre, correo y teléfono ahora **obligatorios** (antes el teléfono era opcional).
- Multiselect de roles con hint "puedes escoger varios" (PRODUCER / DJ / ACADEMY_OWNER / VENUE_MANAGER).
- Validación cliente en ambos CTAs ("Quiero que me contacten" / "Ver una demo"): mensaje "Te falta: {campos}" + `aria-invalid` + borde rojo por campo faltante; email valida formato.
- Happy path: "Listo, {nombre}. Te contactaremos muy pronto." + CTA "¿Quieres revisar la app con tus roles? Ingresa acá" → crea sesión demo y entra a `/inicio`.
- Si el correo ya tiene cuenta real: CTA cambia a "Ya existe una cuenta con ese correo — inicia sesión" → `/login`.

**Backend leads**
- `POST /api/leads` — upsert por email (único); devuelve `{id, demoToken, accountExists}`; notifica a ADMIN solo en lead nuevo; rate-limit 10 submits/IP/hora.
- `POST /api/leads/:id/demo` — exige `demoToken` en body (48 hex, generado en create, comparación `timingSafeEqual`); el id solo NO es credencial. Crea `Person` con `isDemoAccount:true`, **sin `verifiedAt`** (el correo jamás se verificó — el dueño real puede reclamar vía magic link), roles del lead en APPROVED (necesario para pasar guards en la demo); enlaza `lead.personId`, marca `CONVERTED`, emite cookie `omnidance_session`. Email ya registrado → `409 account_exists`. Rate-limit 20/IP/hora.
- `setSessionCookie` extraído a export compartido en `auth.controller.ts` (auth + leads lo usan).
- Schema: `Lead.demoToken String?`, `Person.isDemoAccount Boolean @default(false)` (auditoría/exclusión analítica de cuentas demo).
- `GET /api/admin/browse/leads` — entidad `leads` en el explorador admin (`admin.access`): filtros q (nombre/email/teléfono), status, intent, rango de fechas; la fila muestra "✓ cuenta demo creada" si `personId`. `demoToken` nunca se expone en la respuesta.

**Copy landing**: "La app #1" → "La app de la comunidad" (preferencia del usuario).

## Verificación

- `test/leads.e2e.spec.ts` — **20 tests verde**: validaciones 400, upsert, notificación admin, demo (sin token/token malo/lead inexistente → 404 uniforme), creación de persona demo con roles, re-entrada, colisión 409, browse admin (401/403/200 + filtros + whitelist).
- En vivo contra :4000 — todos los casos confirmados, cookie emitida, persona `isDemoAccount:true` con roles APPROVED, lead `CONVERTED` enlazado.
- `tsc --noEmit` limpio API + web · `ALL_KEYS_OK` · OpenAPI/Postman regenerados (160 paths).
- Suite completa API corrida al cierre — ver resultado en la sesión.

## Lo que queda / riesgos conocidos

- **Roles demo en APPROVED** — la cuenta demo puede operar la app real (crear eventos, etc.). `isDemoAccount` permite filtrarlas de analíticas y auditarlas, pero no hay boundary de datos. Si se quiere aislamiento: SANDBOX + `@AllowSandbox()` explícito por ruta, o seed de data demo etiquetada.
- **Email no verificado en demo** — mitigado: sin `verifiedAt`, y la reclamación vía magic link funciona (`upsertByEmail`). Riesgo residual: un tercero puede crear cuenta demo con email ajeno no registrado → vale monitorear; CAPTCHA/rate-limit más fino si aparece abuso.
- **`demoToken` en claro en DB** — suficiente para el uso actual (solo el submitter lo recibe); si se quiere más, hashearlo como los magic tokens.
- **Sin flujo admin de leads más allá de lectura** — falta marcar CONTACTED/DISCARDED, notas, asignación y conversión manual a cuenta real. Próximo slice natural: `PATCH /admin/leads/:id` + ficha en `/admin/usuarios` o vista propia.
- **Sin consentimiento/privacidad explícito** en el form — considerar checkbox o texto legal (Ley 19.628 Chile) antes de producción.
- `tsconfig.tsbuildinfo` residual de `tsc --noEmit` puede confundir el watch de Nest (regla conocida del repo).

## Estado git

- Rama de trabajo: `feature/pro-lead-form` → merge a `dev`.
- `dev` va ~14 commits adelante de `origin` — pendiente push (no autorizado).
