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

## Sandbox de cuentas demo (implementado)

Decisión tomada: **no** ambiente separado — barrera en la cuenta sobre la misma DB.

- `Person.isDemoAccount` + **barrera de escritura en `SessionGuard`**: cualquier mutación → `403 demo_mode`; whitelist self-scoped (logout, password, notifications, push-tokens). Los GETs pasan con roles APPROVED — navega su consola completa, no ensucia data.
- **Promoción demo→real automática**: `upsertByEmail` (verify de magic link) marca `verifiedAt` y apaga `isDemoAccount` — la misma cuenta se vuelve real sin migración ni acción admin.
- Badge "demo" en filas `people` del explorador admin.

## Conversión admin de lead → usuario real (implementado)

- `POST /api/admin/leads/:id/convert` (`admin.access`, `AuditLog LEAD_CONVERT`): crea la `Person` si no existe (`pendingProfileAt` + `isDemoAccount`) o usa la demo ligada; envía **magic link por email** + notificación in-app `account.complete_profile`; lead → `CONTACTED`. Email ya real → `alreadyReal` + `CONVERTED`. `Person.phone` unique → `409 phone_exists` si el teléfono pertenece a otra cuenta (mismo pre-check en `demo` y `complete-profile` — antes era 500).
- **Cuenta pendiente**: sigue `isDemoAccount` (solo lectura, barrera SessionGuard) hasta completar. El magic link marca `verifiedAt` pero **no** suelta la barrera si `pendingProfileAt` está set.
- `POST /api/me/complete-profile` (whitelist en la barrera): name+phone obligatorios, password opcional → limpia `pendingProfileAt`, apaga `isDemoAccount`, lead → `CONVERTED`.
- Web: `GET /me` expone `isDemo`/`pendingProfile`; banner persistente bajo el appbar → `/perfil/completar` (formulario completo); botón **"Convertir a usuario real"** en filas de leads de `/admin/datos` (solo si `demoPending` o sin cuenta ligada; `browse/leads` expone `demoPending`).

## Verificación (sesión conversión)

- `test/leads.e2e.spec.ts` — **33 tests verde**: ciclo completo convert→pendiente→complete-profile, magic link que no suelta pendientes, `alreadyReal`, `demoPending`, colisión phone → 409.
- Suite completa API: **907/907** (39 archivos).
- Smoke en vivo contra :4000: POST /leads → convert → /me pendingProfile:true → write 403 demo_mode → complete-profile → flags off + lead CONVERTED.
- `tsc --noEmit` limpio API + web · OpenAPI/Postman regenerados (**162 paths**).
- Fix e2e: `afterAll` también limpia persons huérfanas por email (verify crea person real si el test aborta a mitad) + `Notification` por FK.

## Lo que queda / riesgos conocidos

- **Analíticas agregadas** — `isDemoAccount` existe para excluirlas de conteos; falta aplicar el filtro en las queries de analítica de negocio si se quiere data 100% limpia.
- **Riesgo residual**: un tercero puede crear cuenta demo con email ajeno no registrado (solo lectura, reclamable por magic link) → monitorear; CAPTCHA/rate-limit más fino si aparece abuso.
- **`demoToken` en claro en DB** — suficiente para el uso actual (solo el submitter lo recibe); si se quiere más, hashearlo como los magic tokens.
- **Gestión admin de leads parcial** — ya existe conversión (`POST /admin/leads/:id/convert` + botón en `/admin/datos`); falta marcar DISCARDED, notas/asignación y vista propia de pipeline.
- **Sin consentimiento/privacidad explícito** en el form — considerar checkbox o texto legal (Ley 19.628 Chile) antes de producción.
- `tsconfig.tsbuildinfo` residual de `tsc --noEmit` puede confundir el watch de Nest (regla conocida del repo).

## Estado git

- Rama de trabajo: `feature/pro-lead-form` → merge a `dev`.
- `dev` va ~14 commits adelante de `origin` — pendiente push (no autorizado).
