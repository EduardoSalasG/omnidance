# Inventario de flujos — base para QA automatizado

> Fuente de verdad para diseñar la cobertura e2e. Generado 2026-10-18 por mapeo directo del código
> (`apps/web` + `apps/api`), verificado contra controladores Nest. Rama `dev` @ 5844d6f.
> Convención de rutas: `es-CL` sin prefijo; `en`/`fr`/`pt-PT` bajo `/<locale>`. Todas las rutas bajo
> `(app)` requieren sesión; `(marketing)` es público.
>
> **REGLA VIVA (ver AGENTS.md §Documentación):** todo cambio que agregue/modifique/elimine un flujo
> de usuario debe actualizar este archivo en el mismo commit — el QA automatizado se alimenta de él.

## 0. Mecánica transversal (leer una vez, aplica a todos los flujos)

### Auth y sesión
- Cookie `omnidance_session` (JWT httpOnly, 30d). Middleware redirige anon → `/login?next=<path>`.
- **Login con password (dev):** todas las cuentas `*@omnidance.dev` usan `omnidance123`; `monica@omnidance.cl` usa `gatoperro123`. Esto habilita login determinístico en QA sin magic link.
- Magic link: `POST /auth/magic-link` → OTP 6 dígitos; sin `RESEND_API_KEY` el HTML (con OTP) sale por el log del API — recuperable en tests.
- `?next=` sanitizado por `safeInternalPath` (rechaza `//host`, `\`, `%5c` → fallback `/inicio`).
- Logout: solo en `/perfil` → `POST /auth/logout` → reload a `/`.
- Cuentas demo (`isDemoAccount`): escrituras no-GET → 403 `demo_mode` salvo whitelist.

### Personas seed (SEED_ENV=dev)
| Email | Roles | Uso QA |
|---|---|---|
| `admin@omnidance.dev` | ADMIN (isSuperuser) | consola /admin, /soporte |
| `dancer@omnidance.dev` | DANCER | flujos bailarín |
| `carlos@omnidance.dev` | PRODUCER | consola productor |
| `staff@omnidance.dev` | STAFF | puerta /staff |
| `soporte@omnidance.dev` | SUPPORT | /soporte read-only |
| `ardilla@omnidance.dev` | ACADEMY_OWNER+PRODUCER | academia + cruce productor |
| `muvet@`, `tumbao@` | ACADEMY_OWNER | academias Muvet/Tumbao |
| `steban@`, `krrera@`, `matias@`, `fabian@`, `jesus@`, `criss@` | DJ | /dj, sugerencias |
| `profe@` | INSTRUCTOR (+DANCER) | roster/asistencia |
| venue manager | VENUE_MANAGER | /venue |

### Gates de cliente (cada consola)
- **Registro por landing**: CTAs de /para-academias y /para-productores → /login?mode=register&role=ACADEMY_OWNER|PRODUCER; el rol viaja en magic link/OTP/register y crea PersonRole PENDING (usable en su consola, invisible al público) hasta aprobación admin. SANDBOX eliminado del enum.
- `ProducerGate` (`me.roles` ∩ {PRODUCER, ADMIN}); `AcademyGate` (`GET /academies/mine` → selector si >1, persiste en `localStorage["omnidance:academy-id"]`; CTA "Nueva academia" → `/academia/nueva` solo si `me.roleStates` tiene ACADEMY_OWNER APPROVED/SANDBOX — crear usa `POST /academies`, la nueva queda seleccionada y vuelve al hub; deep-link sin rol → estado sin-acceso); `AdminGate` (`me.roles` ADMIN); `CrmGateScreen` (`useCrmContext` + `ActorPicker`); soporte deriva gate de respuestas API; `/venue` gatea por `GET /venues/mine`.
- **Academy approval gate** (`Academy.reviewStatus`): nueva academia nace PENDING; se auto-publica cuando el checklist server-side completa (nombre, descripción, dirección, contacto IG/WA/web, photoUrl, serie activa, clase futura, plan activo, owner APPROVED) — sin acción admin. REJECTED la oculta aunque complete. Filtro en `GET /academies`, `/academies/public`, `/academies/:id/profile` (404 a no-managers) y `/classes/browse`. Owner ve `AcademyVisibilityCard` en su dashboard con lo que falta (links a la sección); admin tiene override en `/admin/perfiles-por-validar` → sección Academias (`GET /admin/academy-review-queue`, approve=override/reject). `photoUrl` editable en `/academia/configuracion/perfil` (URL externa).
- Server: `SessionGuard + RolesGuard + @RequirePermissions(...)`; ADMIN bypass por `isSuperuser`.
- **Lente activa** (`localStorage["omnidance:active-role"]`, fallback ADMIN>SUPPORT>PRODUCER>ACADEMY_OWNER>INSTRUCTOR>VENUE_MANAGER>STAFF>DJ>DANCER): condiciona lo que muestran /inicio, /perfil, /analitica, /notificaciones y la UI academia (lens INSTRUCTOR degrada privilegios reales en UI).
- **Producer Pro:** `me.effectivePro===false` bloquea (paywall) analytics de evento, invitar staff, export CSV/PDF, CRM propio y /analitica con lens PRODUCER. Reactivo: 403 `{error:"pro.required"}`.
- **Academia bloqueada** (`billingBlockedAt`): todo `*Write` → 403 `billing.blocked`; banner global salvo /academia/suscripcion.

### Patrones UI para automatización
- **No existe `data-testid` en ningún lado.** Selectores estables: `role`+nombre accesible, `role="alert"` (errores), `role="status"` (feedback), `role="dialog"`/bottom-sheet (confirmaciones), `role="radiogroup"`, `aria-pressed`, `aria-live`, y atributos `data-tour` (ver anexo).
- `FilterBar` = estado React local (NO va a URL) — no hay deep-links a vistas filtradas en consolas; el driver debe interactuar. Excepciones URL-state: /eventos, /clases, /academias, /practicas, /locales/[id] (SSR), `?edit=` en formularios, `?a=` atribución academia en /eventos/[id].
- Redirects de éxito típicos con timer ~1200ms (`planSaved`, `added`, `created`, `invited`) — buen `waitFor` en tests.
- `OnboardingRunner` (tours driver.js) puede tapar elementos en primera visita — sembrar `me.onboarding` o descartar el tour en setup.
- Confirmaciones: `ConfirmSheet` / bottom-sheet inline para casi todo lo destructivo. **Sin confirmación:** cancelar reserva de mesa (productor), desactivar/reactivar plan de academia, declinar preventa, toggle de trigger CRM, toggle de grant en /admin/roles, guardar params en /admin/parametros, aprobar/pagar payouts, emitir documento de cobro, convertir lead, test-send de campaña admin, delete de consulta guardada.
- Errores server → `readError` (Nest `message` string|array) en `role="alert"`.

### Palancas dev para QA determinístico
- **Pagos stub:** en dev el checkout devuelve `paymentUrl` `stub://` → botones "Simular aprobar/fallar" → `POST /payments/webhook {refId, status:PAID|FAILED}`. Cubre todo el ciclo de compra sin Flow.
- Patrón de espera de pagos: poll `GET /payments/:id` 2s×15 → estados `paid|failed|stillPending`.
- Emails sin Resend → HTML en log del API (magic link, OTP, invitaciones).

### Modelo de pagos
- Pasarelas (server, invisibles al usuario): STUB (dev), FLOW (prod), MERCADOPAGO, FINTOC.
- Métodos propios del productor/academia (visibles en checkout): `TRANSFER | PAYMENT_LINK | CASH` → orden manual con claim + comprobante.
- orderType: `TICKET | SERIES_PASS | MEMBERSHIP | WORKSHOP | PRIVATE | PLATFORM_SUB`. PaymentStatus: `PENDING|PAID|FAILED|REFUNDED`.

---

## 1. Público / auth / onboarding

### Landing `/` (anon; sesión → /inicio)
- CTAs: Entrar → /login; Crear cuenta/hero → /login?mode=register; "ver eventos" → /eventos (bounce anon → /login?next=/eventos); chips de evento → /eventos/{id} (mismo bounce); footer → /pro, legales.
- Server: `GET /events` (ISR 300s, silent-fail) para strip semanal.

### Landings pro `/pro`, `/para-academias`, `/para-productores`
- `/pro`: cards → landings por rol; sección "otros roles" con `ProLeadForm` (roles DJ|VENUE_MANAGER).
- `/para-*`: la invitación es registro directo — header "Crear cuenta", hero primario y CTA final → `/login?mode=register&role=ACADEMY_OWNER|PRODUCER`; secundario exploratorio → `/academias` (academy) o `/eventos` (producer) con bounce anon a `/login?next=`.
- **Lead form (solo hub /pro, DJ|VENUE):** name≥2, email regex, phone obligatorio, role pills → `POST /leads` intent CONTACT → 200 `{id, accountExists}`.
  - `accountExists` → estado de éxito con link /login.
  - Negativos: campos faltantes (inline `#lead-error`), throttle 403, teléfono duplicado 409.

### Login `/login` (+`?mode=register`, `?next=`)
- Modos: password (default) | magic | register. `/login` NO es anon-only.
- Password: `POST /auth/login` → cookie → `next ?? /inicio`; 401/400 → invalidCredentials.
- Magic: `POST /auth/magic-link` → pantalla OTP 6 dígitos → `POST /auth/otp/verify` → `isNew` ? /bienvenida : next|/inicio; 401 otpInvalid; 5 fallos → lock.
- Register: `POST /auth/register` → /bienvenida(?next=); 409 emailTaken. Con password correcto de cuenta seed → login silencioso (claim). Cuenta nueva recibe bienvenida + correo de acceso (link+OTP = verificación de email; `verifiedAt` solo se estampa por link/OTP, nunca por password).
- Link de email: `GET /auth/verify?token=` → cookie + 302 /inicio|/bienvenida; inválido → 401 HTML.
- Lockout login: 10 fallos/10min por email+IP → 401.

### Reclamar entrada `/reclamar/[token]` (público)
- SSR `GET /tickets/claim/:token` → 404 → pantalla "gone". Anon → CTAs register/login con `next` round-trip.
- Logueado → `POST /tickets/claim/:token` → éxito → `/eventos?view=mios`; 409 "tuya" → selfError; otros 409/404 → claimError.

### Legales `/terminos`, `/privacidad`
- Estático; links de retorno/cruce. Sin API.

### Onboarding `/bienvenida` (app; sesión)
- Guard: `me.onboarding["profile-setup"]` ya marcado → redirect next|/inicio.
- Form: nombre*(≥2), teléfono, instagram, género (radiogroup des-seleccionable), estilos → por estilo rol (LEADER/FOLLOWER/SWITCH) + nivel.
- Submit: `PATCH /me` (409 phoneTaken) → `PUT /me/style-roles` → `POST /me/onboarding` → next|/inicio. "Ahora no" = solo onboarding + redirect.
- Edge: cuenta demo → PATCH /me 403 demo_mode.

### Completar perfil `/perfil/completar` (lead convertido)
- Guard: `!me.pendingProfile` → /perfil. Form nombre*/teléfono*/password opcional(≥8) → `POST /me/complete-profile` → done → /inicio (1200ms). 409 phoneTaken.

---

## 2. Dancer — descubrimiento

### `/inicio` (hub, todas las roles)
- `GET /home/stats?role&mode`, `GET /me/pending-surveys`, `GET /me/pending-course-surveys`.
- DANCER/social: KPIs streak+dances7d, TonightScene (hero evento → /eventos/{id}; CTA hasTicket→/qr o "Comprar preventa"→/eventos/{id}; scene.mine→/qr; more→/eventos/{id}; vacío→/eventos + /qr).
- Encuestas pendientes: cards → /eventos/{id}/evaluar y /academias/{id}/encuesta?seriesId&month&series.
- DANCER/academy: myClasses → /clases/{id}; needsAcademy → /academias.
- Otros lenses: ACADEMY_OWNER→AcademyDashboard; PRODUCER→ProducerDashboard; STAFF→hero /staff/{id}; INSTRUCTOR→clases→/academia/clases/{id}; DJ/VENUE→próximo gig→/eventos/{id}.
- Errores: /me 5xx → serverError+retry; sin sesión → sessionExpired→/login; stats fail → warn+retry.

### `/eventos` (listado, SSR)
- `GET /events` (público) + `/tickets/mine` + `/payments/mine` (PENDING) + `/venues` (mapa).
- searchParams SSR (deep-linkables): `view=list|calendar|mios|map`; `genre=SALSA,BACHATA,CUBANO` multi-unión; `venue=<id>`; `upto=N` (horizonte semanas, "load later"); `month`, `day` (calendario); `week` legacy.
- Vistas: lista agrupada por día (Esta semana / Más adelante) → EventCard → /eventos/{id}; calendario mensual con dots por género + día seleccionado; mapa Leaflet pins → /locales/{id}; `mios` = wallet.
- **Wallet (view=mios):** tickets ordenados (futuro/ACTIVE primero); badges ACTIVE/USED/CANCELLED/TRANSFERRED/claimPending; por ticket ACTIVE: link /qr, WhatsApp share de claimToken, **transferir** → modal → `POST /tickets/:id/transfer {toEmail}` (400/409/404 → transferError; éxito remueve local). Pending payments → cards "pago en validación" (sin QR). Vacío → CTA /eventos.
- Edge: /events fail → loadError+retry preservando params; tickets fail → retry (nunca wallet falso-vacía).

### `/eventos/[id]` (detalle; `?a=` atribución academia)
- SSR paralelo: `GET /events/:id` (404→notFound), `/missions`, `/friends-going`, `/tickets/mine`.
- Contenido: badges serie/tipo/LIVE/CANCELLED/past, GenreMixBar, venue → /locales/{id} + Google Maps ext, host (práctica) → /amigos/{id}, friends-going, programa, lineup, bloques, precios, PrimeTimeWidget (solo LIVE no-práctica; poll 30s `/events/:id/prime-time`).
- `?a=<academyId>` → sessionStorage `omni.academyAttr.<eventId>` (lo consume checkout).
- **CTA bar inferior:** pasado → solo texto; PRACTICA → **PracticeBar** (`GET/POST /practices/:id/rsvp`, toggle going + "Mostrar mi QR"→/qr?modo=mio); social → BuyTicketCta → /eventos/{id}/checkout (con ticket → dialog "comprar otra"); con seriesId → **SeriesPassCta** → `POST /checkout/series-pass` → gateway | `stub://` poll | `paymentUrl:null` → OwnMethodClaim. Avisos: 401 loginRequired / 409 alreadyOwned / stillPending.
- No existe share/save/favorite.

### Checkout ticket `/eventos/[id]/checkout`
- Gate SSR: `GET /events/:id` → 404 notFound; CANCELLED/CLOSED/pasado/PRACTICA → notice sin form.
- Boot: `GET /friends`, `GET /events/:id/payment-methods`.
- Pasos: stepper cantidad 1–10 (min 1+regalos); asignación de regalos (búsqueda sin diacríticos, chips; extras = links WhatsApp reclamables); reserva de mesa (si tablesTotal; Sí/No + partySize 1..min(seatMax,seatsLeft,12)); picker método (pasarela | TRANSFER|PAYMENT_LINK|CASH con detalles+copy); código descuento → `GET /checkout/discount-quote`; sugerencia canción ≤140.
- Submit `POST /checkout/ticket {eventId,quantity,academyId?,discountCode?,songSuggestion?,recipientIds?,tablePartySize?,methodId?}`.
- Ramas: `paid:true` (orden $0) → éxito directo; `paymentUrl:null` → fase manual → OwnMethodClaim (nota≤200 + archivo png/jpeg/webp/pdf → `POST /payments/:id/claims`; poll pago 3s; claim REJECTED muestra reviewNote y permite re-subir); `stub://` → poll + botones dev; URL real → redirect gateway → vuelve a /checkout/return.
- Errores: 400 "código"→invalidCode, otros 400 verbatim (recipient/gift/presale cerrada/terminado/mesa grande); 401 loginRequired; 409 soldOut | tablesSoldOut ("sin cupo en mesas"); genérico.
- Éxito: `GET /payments/:id/tickets` → botones WhatsApp por claimToken → /reclamar/<token>; CTA /eventos?view=mios.

### Retorno de pago `/checkout/return?paymentId=|?sub=`
- Poll `GET /payments/:id` 2s×15 → `paid` (CTA por orderType: MEMBERSHIP→/academias, WORKSHOP→/clases, PRIVATE→/clases?scope=reservadas, TICKET→/eventos?view=mios) | `failed` (TICKET→reintentar checkout) | `stillPending` | `unauth` | `error`. `sub=ok|error` → resultado estático.

### Evaluar `/eventos/[id]/evaluar`
- Server name fetch; form: overall* (StarRating radiogroup 1–5; faltante→alert inline), dims primarias music+occupation, "Evaluar más" → organization/floorComfort/temperature/lightingSound.
- `POST /events/:id/ratings` (upsert; solo dims enviadas se sobrescriben) → gracias → /inicio 1.4s. 409 expired (ventana endsAt+24h), 403 sin check-in, 401 login.
- Privacidad: solo números, sin texto libre; summary k-anon ≥3 solo para productor/admin.

### Clases `/clases`
- URL state: `s=mias|explorar|historial`; `v=list|calendar`; `scope=todas|reservadas` (mias); `style`, `level` selects dependientes; `academy` solo explorar; `upto`, `month`, `day`.
- Data: mias/todas `GET /classes/browse?scope=enrolled`; explorar `/classes/browse` (+refetch facets); reservadas `GET /classes/mine` (particulares sin agendar pineadas); historial `/classes/mine?scope=past`.
- Lista: grupos por día/hora → ClassCard → /clases/{id}; acción por card: Reservar/Espera → `POST /classes/:id/book` (busyId, notice waitlistOk|bookedOk); badges booked/waitlist/dropIn/requiresEnrollment; spotsLeft urgencia.
- Calendario igual a /eventos. Historial: conteo mensual + badges attended/cancelled.
- Empties: mias→CTA explorar; explorar→empty; hasLater→"ver próxima semana".

### Clase `/clases/[id]` (+ fallback private-lesson)
- `GET /classes/:id` (404 → intenta `GET /private-lessons/:id` → 404/403 notFound).
- `ClassBookingCta` (sticky, solo sin booking): closedLabel | academyBlocked | requiresEnrollment→/academias/{id} | drop-in "Comprar clase"→`POST /checkout/class`→gateway|stub | enrolled→`POST /classes/:id/book` (BOOKED|WAITLIST+refresh; creditsLeft=0→buyable/disabled).
- Con booking: zona destructiva "Cancelar reserva" → sheet (copy según refund) → `DELETE /classes/:id/book` → cancelledOk|Paid|NoRefund|Refunded.
- Private lesson ficha: badges REQUESTED|CONFIRMED|DONE|CANCELLED + paidTag; cancel → `PATCH /private-lessons/:id {action:"cancel"}`.

### Academias `/academias` (directorio)
- `s=mias|explorar` (auto-flip a explorar si sin enrollments), `v=list|map`, `style`, `q` (explorar, accent-insensitive); `?sub=error` → banner.
- `GET /academies` + `/academies/enrolled`; MyAcademyCard (→/academias/{id}): status, plan, vigencia, attendance30d, videos (≤3, locked→icono); AcademyCard explorar: nombre/estilos/instructores. Mapa pins → /academias/{id}.

### Academia `/academias/[id]` (+`?sub=ok|error`)
- `GET /academies/:id/profile` (404→notFound). Header: enrollment badge, contacto (IG/wa/web), billingBlocked→unavailable.
- `SubscriptionManage` (si mySubscription): ACTIVE→badge+cancel 2-pasos→`POST /subscriptions/:id/cancel`; PENDING_CARD/FAILED_CARD→resumeCard→`POST /checkout/membership-subscription`→needs_card→registerUrl; ACTIVATING→spinner; CANCEL_PENDING→badge.
- `ProfilePlansSection`: ≤2 planes+toggle; CTA → /academias/{id}/checkout?plan={id} (buyClass SINGLE; extendPlan si activo); bloqueado→unavailable; TRIAL gratis→trialAssigned.
- `BuyPrivateClass` (privateLessonPrice>0): `POST /checkout/private-class`→gateway|stub→/checkout/return.
- `AcademyClaimsMine`: claims propios read-only (+reviewNote en rechazo).
- Clases ≤2 → /clases/{id}; más → /clases?s=explorar&academy={id}.

### Checkout membresía `/academias/[id]/checkout?plan=&mode=once|sub`
- `?plan` requerido; `GET /checkout/membership-quote?planId` (401→/login; 404→notfound; 400→planUnavailable; ACTIVE/CANCEL_PENDING→alreadySubscribed).
- Review card (vigencia, extensión, total). ManualPayPanel (oculto en sub): radio pasarela vs métodos → `POST /academies/:id/claims/intent` → AWAITING → datos transferencia/copy → upload `POST .../receipt` → PENDING; cancel `POST .../cancel`; claim viva reanuda; última REJECTED muestra nota.
- Pago una vez → `POST /checkout/membership` → redirect|stub poll → /academias/{id}.
- Sub (solo recurring+FLOW): Segmented once/sub; consent checkbox* → `POST /checkout/membership-subscription` → needs_card→intersticial→registerUrl (vuelve ?sub=ok|error) | subscribed→poll `/subscriptions/:id`→?sub=ok; 409→perfil academia.

### Encuesta academia `/academias/[id]/encuesta?seriesId&month&series`
- Params inválidos → card; sin sesión → loginRequired. course★* + instructor★ opcional + comentario ≤500 → `POST /me/course-surveys` → done → volver academia.

### Local `/locales/[id]`
- `GET /venues/:id?days=62`. searchParams `vista=lista|calendario`, `genre`, `mes`, `dia`. Info + eventos agrupados → /eventos/{id}.

### Bailes `/bailes` (+`?event=`)
- `GET /sessions/mine[?eventId]` (+`/events/:id` chip, `/gamification/me/streak`). Refetch on focus/visibility.
- Pendientes (INVITED): entrantes/salientes; saliente → Descartar `POST /sessions/:id/discard`; entrante no tiene botones (expira).
- Insights (sin ?event): evento link, stats, bestDance≥4, streak.
- Historial: accordions por noche → /eventos/{id}; SessionCard: myRating readonly o "Puntuar" → StarRating → `POST /sessions/:id/rate` → refetch. ≤3 noches + expandir.

### DJ `/dj`
- `GET /dj/gigs` (403→forbidden). Upcoming GigCard expandible → `GET /dj/gigs/{id}/suggestions` (ranking de canciones sugeridas). Historial details → `GET /dj/gigs/{id}/rating` (k-anon few / star+avg).

### Notificaciones `/notificaciones`
- Lens social|academy → `GET /notifications?lens=&limit=50`; auto `POST /notifications/read-all` si hay no leídas; "Marcar todas" optimista.
- Click item → `POST /notifications/:id/read` + navegación por tipo (payment.paid→/eventos?view=mios; event.survey→evaluar; session.*→/bailes; friend.request→/amigos; class.waitlist→/clases/{id}; etc.; default data.path vía safeInternalPath).

---

## 3. Dancer — transaccional/social

### QR `/qr` (`?modo=mio|escanear`, `?event=`)
- Modo persiste localStorage; `?event` implica escanear.
- Mi QR: `GET /qr/mine` → canvas qrcode; re-mint cada 50s (TOTP server 30s). Falla → error+retry conservando último QR.
- WalletLauncher: `GET /wallet/google` → saveUrl externo (oculto si 503).
- Escanear = **registro de baile** (NO check-in de puerta): con event→cámara; sin event→`GET /events` picker. Scan → `POST /sessions/scan {qrToken,eventId}` → `GET /sessions/mine?eventId` → toast partner 2.6s. 400 token inválido/expirado, 409 cooldown pareja (~4min), 401 unauth, camera-error+retry.
- `/escanear` = redirect legacy a /qr?modo=escanear.

### Amigos `/amigos`, `/amigos/[id]`
- Lista: invite link (share/clipboard → /amigos/{myId}); búsqueda ≥2c debounced → `GET /people/search`; acción por estado (none→Agregar `POST /friends`; sent→cancel `DELETE`; received→Accept/Decline; friends→badge).
- Secciones: "Tus amigos van a" (eventos con amigos ticket ACTIVE, ≤2+expand), solicitudes recibidas/enviadas, lista → /amigos/{id}. 409 = ya aplicado → refetch silencioso.
- Detalle `/amigos/[id]`: `GET /people/:id` → identidad + acción amistad + upcomingEvents (solo ACCEPTED) + styleRoles; footer Eliminar → sheet → `DELETE /friends/:fid` → /amigos.

### Prácticas `/practicas`, `/practicas/nueva`
- Lista: `?view=todas|mias`, chips `?style`; `GET /practices` + `/practices/mine` (lazy en mias; sin sesión → card login). Cards por día → /eventos/{id} (badges tuya/voy/LIVE).
- Nueva (gate /me): nombre*, dirección, notas, descripción, estilo, capacidad 2–60, fecha*(≥hoy), horas* (cruce medianoche permitido) → `POST /practices` → card creada → /eventos/{id} 1.2s. Prácticas nunca pasan por checkout (RSVP gratis en detalle).

### Perfil `/perfil`, `/perfil/datos`, `/perfil/pagos`
- Hub: `?sub=error` alert; identidad→datos; badges de roles; ProfileReminder (dismiss→`POST /me/onboarding`); "Interactuar como" radiogroup (lens); KPIs DANCER; streak+badges por modo; ThemeToggle; link pagos; **logout** `POST /auth/logout`→`/`。
- Datos: PATCH /me {name*,phone,instagram,gender,birthDate} (409 phoneTaken); selector idioma → PATCH /me {language} + router.replace locale; sección por modo (academy→enrollments; otro→editor styleRoles PUT /me/style-roles).
- Pagos: `GET /payments/mine` + `/subscriptions/mine` (CANCELED fuera); cancel sub → 2-pasos → `POST /subscriptions/:id/cancel`; filas expanden ledger `GET /payments/:id/events`.

---

## 4. Productor (rol PRODUCER; permisos `events.manage`, `social.manage`, `discounts.manage`; owner-check `producerId===me.id || admin.access`)

### Dashboard `/productor` → redirect `/inicio`

### Eventos `/productor/eventos`
- `GET /events/mine{?q,status,type,from,to}` paginado 25 — permiso events.manage; stats por card (sold/gross/checkins).
- Filtros FilterBar: q, status (DRAFT|PUBLISHED|LIVE|CLOSED|CANCELLED), type (SOCIAL|PRACTICA|GALA|CONGRESS|COMPETITION), from/to. `?crear=1` legacy → /nuevo.
- CTA → /productor/eventos/nuevo; card → /eventos/{id} ficha. Empties: sin filtro (CTA crear) vs filtrado.

### Crear/editar evento `/productor/eventos/nuevo` (+`?edit={id}`)
- Boot paralelo: `/venues`, `/styles`, `/events/mine?pageSize=100` (series propias; oculto si no hay). Edit: `GET /events/:id`.
- Campos: nombre*, startsAt*/endsAt* (fin>inicio), venueId select (edit pre-selecciona por match de nombre), type (disabled en edit), seriesId, presalePrice/doorPrice, capacity, presaleCap/doorCap, presaleCutoff (HH:MM→minutos; >1439 post-medianoche solo vía API/dirty-flag), tablesTotal, tableSeatMax, tableSeatsTotal, primeThreshold, happyHourMinutes, scheduleBlocks[] (blockStart/End/style/dj; end≤start inválido; edit solo si dirty), djs (texto personIds separados; edit solo si dirty).
- Create `POST /events` → siempre DRAFT → banner → /productor/eventos 1200ms. Edit `PATCH /events/:id` (409 no-editable) → ficha.
- Negativos: 400 class-validator, 403 serie ajena/fee, 409, no-editable screen, notFound.

### Ficha evento `/productor/eventos/[id]` (consola operativa)
- `GET /events/:id` + `useMe`; canManage = producerId===me.id||admin.
- Acciones header (canManage): **Publicar** (solo DRAFT) `POST /events/:id/publish` (409) sin confirm; **Editar** → /nuevo?edit=; **Cancelar** (DRAFT|PUBLISHED|LIVE) → bottom-sheet confirm → `POST /events/:id/cancel` (409).
- Secciones: FeeInline (admin+editable: PATCH platformFeePct); Live (PUBLISHED/LIVE/CLOSED: ventas, checkins, ocupación, barras por hora); Staff (lista + CTA nuevo [Pro-gated]); Passes (read-only tipos PAID|ARTIST|STAFF|COMP|LIST|FREE_WINDOW); Payments (`/payments/by-event`, filtros status+perPage); AcademySales (deals propios+serie → academias/{dealId}, CTA nueva); Suggestions (top-20); Reservations (`/table-reservations/manage`, filtro status, expandible editar partySize/tableNo→PATCH CONFIRMED, **cancelar sin confirm**); EventLists (guest-lists del evento → /listas/{id}, CTA nueva?eventId); Ratings summary (k-anon <3→notEnough); Analytics (**Pro-gated**, <3 asistentes→insufficient).
- Edge: CLOSED→recap; DRAFT/CANCELLED→sin live; no-owner→canManage false.

### Deal academia `/productor/eventos/[id]/academias/nueva` y `[agreementId]`
- Nueva: select academia (`GET /academies` aprobadas), commissionPct* int 1–90, maxTickets≥1 opcional → `POST /events/{id}/academy-deals` (409 duplicado, 400 academia no aprobada) → deal INVITED → ficha.
- Ficha: stats (sold/codes/commission/settled/pendingClp con signo); share link `/eventos/{id}?a={academyId}`+copy; editar términos PATCH (commissionPct/maxTickets; futuras órdenes); lista de códigos con redención; **Mark paid** (pendingClp≠0) → `POST /academy-deals/{id}/mark-paid {evidenceUrl?}` (409 sin balance); **Disable** (ACTIVE) → confirm → PATCH {action:disable}.

### Staff puerta `/productor/eventos/[id]/staff/nuevo` (Pro-gated)
- Búsqueda ≥2c debounce → `GET /events/{id}/staff/candidates` (roster + historial propios, minus asignados); select listbox → chip; rol DOOR|DOOR_SALES → `POST /events/{id}/staff` (upsert) → ficha. Pool vacío para productor nuevo (roster se arma en /colaboradores).

### Listas `/productor/listas*` (`/listas` → redirect /productor/eventos)
- Nueva: `?eventId=` preset o select de `/events/mine`; nombre* → `POST /events/{id}/guest-lists {ownerId,label}` → ficha evento.
- Detalle `/listas/[id]`: `GET /guest-lists/{id}`; entries PENDING|ARRIVED; agregar personId (texto crudo) → `POST .../entries` (404/409 dup); **emitir pase** por fila → `POST .../entries/{id}/pass` (idempotente 200/201; precio=specialPrice|0; NO marca ARRIVED).

### Códigos `/productor/codigos*`
- Lista: `GET /discount-codes{?q,status,from,to}` + `/events` (nombres); status ACTIVE|EXPIRED derivado de expiresAt; cards → /{id}; CTA nuevo.
- Nuevo: code*, type (CUMPLEANOS|CORTESIA|CASO_BORDE_PUERTA|CAMPAIGN|WINBACK|STAFF_COMP), percentOff 1–100 XOR amountOff≥1 (mutex), maxUses, expiresAt, eventId (solo PUBLISHED públicos) → `POST /discount-codes` (400 invalid, 409 duplicado).
- Detalle: read-only por diseño (sin edit/delete; retiro = dejar expirar) + redemptions.

---

## 5. Productor — backoffice

### `/productor/apariencia` — ThemeToggle (localStorage, sin API).
### `/productor/colaboradores` — `GET /producer/staff`; add→/nuevo; **remove sin confirm** `DELETE /producer/staff/{personId}`. Nuevo: buscador `GET /people/search`→`POST /producer/staff {personId}` o invite email → `{invited}` (magic link 7d); 400 self-add; upsert idempotente.
### `/productor/comprobantes` — cola claims: default 3 GETs paralelos (PENDING|APPROVED|REJECTED) → grid pendientes + historial; con filtro status → paginado. Detalle `claim/[id]`: datos+receipt stream; PENDING → **Approve** `POST .../approve` (atómico+emite ticket, 409 resuelto) | **Reject** → panel nota* → `POST .../reject`.
### `/productor/medios-pago` — A) Gateway propio: `GET /producer/gateway-account` (mask); upsert provider FLOW|MERCADOPAGO|FINTOC + apiKey(+secret) → `PUT`; disable 2-pasos → `DELETE` (fallback plataforma). B) Métodos directos: `GET /producer/payment-methods`; create TRANSFER(6 campos)|PAYMENT_LINK(url)|CASH(instrucciones) + label*+order → POST; toggle active PATCH; delete ConfirmSheet.
### `/productor/pagos` — `GET /me/payouts` (permiso crm.manage): filtros status/orderType/channel/from-to; cards período/bruto/neto/líneas deducción → /{id}. Detalle read-only + evidenceUrl. Sección billing docs `GET /me/billing` → PDF inline.
### `/productor/parametros` — `GET /producer/table-params`: tablesTotal/tableSeatMax/tableSeatsTotal/presaleCutoff (HH:MM; >1439 render vacío + dirty-flag) → `PUT` solo campos dirty.
### `/productor/suscripcion` — `?pro=ok|error`; `GET /producers/{id}/pro` + `/params/public`. Estados FREE|trial|PENDING_CARD|ACTIVATING|ACTIVE|CANCEL_PENDING. Suscribir: ciclo MONTHLY|SEMIANNUAL|ANNUAL (tier auto por GMV), consent* → `POST .../pro/subscribe` → PENDING_CARD+paymentUrl → intersticial → Flow registro tarjeta. Cancel 2-pasos → `POST .../pro/cancel` (efectivo nextInvoiceAt). Sección fee read-only.

---

## 6. CRM (`/crm/*` — actor PRODUCER propio [Pro-gated] | ACADEMY propia | ADMIN manual; permiso `crm.manage`)

- PickActor obligatorio; proBlocked → ProPaywall.
- `/crm` personas: `GET /crm/people?actor&q&segment&tag&sort&page`; segment-count badges; **Recompute** `POST /crm/scores/recompute`; bulk select → tag add/remove `POST /crm/people/tags/bulk` | bulkCampaign→/campanas/nueva?personIds=; card → /personas/{id}.
- `/crm/personas/[personId]` (**privado por actor**): score+breakdown+timeline; add tag POST; remove tag DELETE (sin confirm).
- `/crm/campanas`: lista; nueva: name*, actionType NOTIFY(título*,body)|DISCOUNT_CODE(percent XOR amount+maxUses+expiresAt), audiencia OR{segment,segmentRef,tags,personIds,academy:allStudents/enrollmentStatus/planId/seriesId}, scheduledAt → DRAFT|SCHEDULED; preview debounce `POST /campaigns/preview` → count. Detalle: métricas sent/engaged/redemptions; Send/cancel-schedule con sheet; SENT → WhatsApp `GET .../whatsapp?text=` → wa.me links (**expone teléfonos de audiencia**).
- `/crm/segmentos`: lista; nuevo: name, match all|any, condiciones field/op/value (score,attendance,streak,months,purchases,early,tenure,referrals,spend,segment,tag); preview debounce; detalle: edit PATCH + delete sheet; miembros → personas.
- `/crm/triggers`: lista (existingKeys); evaluate-now `POST /triggers/evaluate`; toggle active PATCH (sin confirm); edit (resuelve por lista, no GET-by-id). Nuevo: key (WINBACK|TRIAL_EXPIRING|REGULAR_NO_PRESALE|ATTENDANCE_DROP|SEGMENT_ENTER|SEGMENT_EXIT, scope academy|producer), days/cooldownDays o config {segmentId,action NOTIFY|NOTIFY_OWNER|TAG_ADD|TAG_REMOVE}.

---

## 7. Analítica B2B (`/analitica` — permiso por lens activo)

- Boot `GET /analytics/roles`; lens no-query-role → noQueries/forbidden; PRODUCER sin Pro → paywall.
- `GET /query/catalog?role` → entidades por lens (PRODUCER: sales,checkins,guestlist,attendees,reservations,waitlist,rsvps con scopeId evento/serie; ACADEMY: students,attendance,bookings,memberships,payments,private_lessons; ADMIN: catálogo completo 13 entidades).
- FilterBar + lazy `/query/options?source&scopeId`; Run → `POST /query/run` → tabla + summary + Pager (re-run por página); export CSV/PDF `/query/export.*`; consultas guardadas CRUD (system templates + propias; rename inline; **delete sin confirm**).
- `/analitica/consultas` → redirect /analitica. `/analitica/usuarios` (ADMIN): búsqueda ≥2c → `GET /admin/users`; detalle `[personId]`: `GET /admin/users/:id/detail` + PillTabs por rol → `GET /admin/users/:id/analytics?role=` (secciones por rol; 400 ROLE_NOT_HELD).

---

## 8. Academia (rol ACADEMY_OWNER + staff por caps `students|payments|plans|schedule|profile|team|billing`; instructor operativo limitado)

### Hub `/academia` — owner → redirect /inicio; staff/instructor ven dashboard + ModuleGrid filtrado por caps (alumnos, clases/series, particulares[no instructor puro], videos, cobros, preventas, equipo, config, CRM[owner/ADMIN], suscripción).

### Alumnos `/academia/alumnos*`
- Lista (requireManage; gestión solo no-instructor): KPIs + insights (topAttendance/topPayers); filtros q(≥2)/status(ACTIVE|PAUSED|TRIAL|FROZEN|ONLINE)/planId; cards → /alumnos/{personId} (score+segment privados academia). Import CSV (cap students): template download + upload ≤2MB → tabla por fila.
- Nuevo (UI solo owner/ADMIN aunque backend acepta cap students): personId texto crudo*, planId*, status, startsAt/endsAt → `POST /enrollments` (409 DUPLICATE_ENROLLMENT) → lista 1200ms; sin planes → CTA crear plan.
- Ficha `[personId]`: header score/segment/breakdown; editor enrollment (si canEdit server=cap students): status+endsAt → `PATCH /enrollments/{id}` (400 transición inválida); pagos (enrollments), historial, próximas. Sin acciones destructivas.

### Asistencia `/academia/asistencia` → redirect /academia/series. Marcación real en roster de clase.
### Clases (instructor) `/academia/clases` — sin AcademyGate; lens OWNER → /inicio. `GET /classes/teaching` filtros academy/series/from-to; cards con quorum+waitlist → /academia/clases/{id}.
### Roster `/academia/clases/[id]` — `GET /classes/:id/roster` (requireManage). Booked: fila→alumno; "Marcar presente" solo si canMark (instructor de la clase/ADMIN, owner NO) y ventana ±30min → `POST /classes/:id/attendance` (400 fuera ventana, 409 dup); waitlist numerada. Sin un-mark ni "ausente".

### Series `/academia/series*` (cap schedule)
- Lista: q/status/styleId/levelId+typeId multi; insights; CTA nueva; toggle import horarios CSV.
- Nueva/edit (`?edit=` metadata-only, slots ocultos): name*, desc, styleId/levelId/instructorId selects, quorum (∅→hereda academy.defaultQuorum), dropInPrice, typeIds chips, **slots[]** (weekday+start*+end*, ≥1; client NO valida start<end en create) → `POST /series` → materializa clases rolling window + notifica instructores. Edit → PATCH.
- Detalle `[id]`: editar; desactivar/reactivar PATCH (reactivar rematerializa+notifica); slots: X→ConfirmSheet DELETE slot (**cancela clases futuras + reembolsa bookings**), agregar slot PATCH addSlots (client valida start<end); próximas/historial → roster; CourseSurveyResults (owner/ADMIN only, 403 oculto); **zona roja Eliminar** → ConfirmSheet → DELETE series (soft delete + cascada) → lista.

### Particulares `/academia/particulares` (requireManage; oculto a instructor puro en nav pero URL accesible para sus clases)
- `GET /academies/:id/private-lessons` filtros status/instructorId/commission/from-to; KPIs por-asignar/por-confirmar.
- Acciones por card `PATCH /private-lessons/{id}`: **assign** (owner, REQUESTED sin instructor|fecha) instructor*+datetime* → CONFIRMED+notifica; **confirm** (owner|instructor asignado); **done** (solo instructor); **reschedule** datetime*; **cancel** (owner|estudiante; instructor NO) → ConfirmSheet → CANCELLED (pagada → notifica owner reembolso manual). `pay-commission` existe en API sin UI.

### Equipo `/academia/equipo*` (cap team)
- Lista: instructores (payType/acuerdo) → /profesor/{id}; staff (q≥2, cap badges) → /{id}. CTA + Agregar.
- Nuevo: kind radio staff|instructor; email*+name; staff → 7 caps checkbox → `POST /staff` (upsert); instructor → payType none|MONTHLY|PER_CLASS|COMMISSION + campos condicionales → `POST /instructors`. Email nuevo → stub+invite 7d `{invited}`.
- Staff `[id]`: editar permisos → /editar (7 caps → PATCH); **Baja** ConfirmSheet → DELETE. Profesor `[id]`: acuerdo+stats (taughtMonth/Total/attendanceMonth)+próximas+surveys(owner/ADMIN); editar acuerdo (validaciones por payType) → PATCH; **removeInstructor** ConfirmSheet → DELETE.

### Cobros `/academia/cobros*` (cap payments)
- Hub: KPIs cobros (`/cobros/kpis`, oculto si falla); planes por vencer (hoy/semana → alumno); cola claims (default PENDING+AWAITING paralelos; con filtro → paginado); historial unificado claims+payments (ventana 20, "cargar más" +20, cap 200/fuente).
- Claim `[id]`: datos+receipt stream; PENDING → Approve `POST .../approve` (crea Payment MANUAL claim-<id> + Enrollment ACTIVE renueva desde endsAt|now; 409) | Reject nota*≤500 → POST reject (400/409; errores genéricos sin mensaje server).
- Pago `[id]`: `GET /academies/:id/payments/:paymentId` read-only (404 anti-enumeración por refId prefix mem_/wks_/pvt_/claim-).

### Planes `/academia/planes*` (cap plans)
- Lista: q/status(active|inactive)/sort + KPIs; recurrentes vs pago-único; CTA nueva.
- Nueva/edit `?edit=`: name*, type (disabled si flowPlanId — mirror Flow), price*, classCount, weeklyClasses (solo recurrentes), periodDays (PERIOD), description líneas≤12, active (edit) → POST/PATCH (502 si Flow mirror falla).
- Detalle: editar; **desactivar/reactivar sin confirm** PATCH {active}; alumnos ACTIVE listados.

### Preventas `/academia/preventas*` (deals como vendedora)
- Lista sin filtros: status INVITED|ACTIVE|DECLINED|DISABLED + pendingClp signado → /{id}.
- Detalle (sin GET-by-id; resuelve de lista): INVITED → accept|decline PATCH (**decline sin confirm, irreversible**); ACTIVE → share link `?a=`+copy; generar código `POST /academy-deals/:id/codes` (409 cap) + lista códigos copy; DECLINED/DISABLED read-only.

### Suscripción `/academia/suscripcion` (cap billing; exenta de billing.blocked)
- `GET /academies/:id/billing` + `/params/public`; `?sub=ok|error`. Estados ACTIVE|CANCEL_PENDING|PENDING_CARD|ACTIVATING|FAILED_CARD + trial/grace/blocked; barra uso alumnos/max (≥90% warn).
- Tier cards STARTER|PRO|STUDIO (disabled tierExceeded; ENTERPRISE→/soporte) × ciclo MONTHLY|SEMIANNUAL(5.75×)|ANNUAL(11×).
- Subscribe: consent* → `POST /subscribe` → needs_card → intersticial → Flow registerUrl. Change (sub viva): PATCH → upgrade inmediato / downgrade+ ciclo → pendingTier/Cycle en nextInvoiceAt; re-seleccionar actual = revert. Cancel (ACTIVE) 2-pasos → POST cancel → CANCEL_PENDING. Facturas PLATFORM_SUB listadas.

### Config `/academia/configuracion*` (cap profile/payments; canAdminister = owner|ADMIN)
- `/configuracion` → redirect general.
- General: defaultQuorum (∅→20; **client acepta 0 pero server @Min(1) → 400**), privateLessonPrice (∅→no vende) → PATCH /settings.
- Apariencia: ThemeToggle (tema del visor, sin gate ni API).
- Perfil público: description/address/lat-lng (valida rango)/instagram/whatsapp/website → PATCH /settings (normalización server; 400 inválidos).
- Pagos: lista métodos admin (incluye inactivos) → /{methodId}; nuevo: type TRANSFER|PAYMENT_LINK|CASH + label*≤60 + details por tipo + order → POST (errores genéricos sin server msg); [methodId]: PATCH label/details/order/active; delete ConfirmSheet.

### Videos `/academia/videos*` (lectura amplia; escritura cap schedule + canAdminister UI)
- Lista `GET /academies/:id/videos?q` paginado 24: no-staff ven restringidos masked `locked:true` (unlock por asistencia/enrollment); cards → link externo si unlocked; admin ve CTA nuevo + delete ConfirmSheet.
- Nuevo: title*, url* (solo externos), classId texto libre (404 si no es de la academia), restrictedToAttended (default true) → POST → lista 1200ms.

---

## 9. Admin (`/admin/*` — `admin.access`/isSuperuser; todo mutación audita AuditLog)

- Chrome móvil: **drawer-only** (sin bottom tab bar, igual que owner/productor); drawer/sidebar por dominio: Inicio primero, **Gestión** (usuarios/roles/academias/catálogos), **Facturación** (transacciones/suscripciones/documentos/finanzas), **Comercial** (CRM 4 secciones + difusión `/admin/campanas`), **Analítica** (consultas/datos/usuarios), **Plataforma** (params/jobs/auditoría), **Social** (eventos/staff). `/crm` y `/admin/facturacion` matchean activo exacto; `/admin` redirige a `/inicio`.
- `/inicio` (lente ADMIN): KPIs `home/stats` — pendingRoles, **leadsNew**, **txRevenueMonth** (fees neto+IVA PAID no-PLATFORM_SUB del mes CL), **subRevenueMonth** (PLATFORM_SUB PAID del mes), users, activeEvents, pendingPayouts — + sección "Leads por revisar" (NEW asc, 6 filas → `/admin/datos?entity=leads&status=NEW`) + hero.
- `/admin` → redirect a `/inicio` (hub eliminado: los destinos viven en el sidebar).
- `/admin/usuarios`: búsqueda q≥2 + role enum (catálogo RBAC vivo) → `GET /admin/users` paginado `{items,total,page,pageSize}` (size 25) + `Pager`; cambio de filtro resetea a página 1; card muestra contadores "N academia(s)"/"N evento(s)" cuando >0 → /{personId}.
- `/admin/perfiles-por-validar`: cola PersonRole PENDING de ACADEMY_OWNER/PRODUCER (registro por landing) → checklist nombre/email verificado/teléfono/datos del actor; Aprobar exige checklist completo (409 si falta) → APPROVED (visible); Rechazar ConfirmSheet → REJECTED auditable. El actor ve el mismo checklist en `PendingRoleCard` (en `/perfil` y en su home de lente): `GET /me/role-checks` + links a resolver cada ítem; email se verifica inline (`POST /auth/resend-verification` → OTP `POST /auth/otp/verify`).
- `/admin/usuarios/[personId]` ⚠️: cambiar status de rol (select inline sin confirm) `POST /users/:id/roles`; agregar rol; revocar ConfirmSheet `DELETE .../roles/:role`; **hard-delete** ConfirmSheet `DELETE /users/:id` (400 self-delete; irreversible); listas de "Actividad por rol" con expand tras 5 filas ("Ver las {count}"/"Ver menos"); link analytics.
- `/admin/roles` ⚠️: toggle grant `POST /roles/:key/permissions` **sin confirm** (cuidado lockout admin.access); crear rol/permiso existe sin UI.
- `/admin/parametros` ⚠️: `PUT /params/:key` (JSON libre, sin confirm — efecto global); `GET/PUT /producers/:id/fee-params` (fee+preset cutoff; >1439 preserva raw).
- `/admin/datos`: catalog ADMIN 13 entidades → `GET /admin/browse/:entity` (cap 100); **deep-link `?entity=<e>&<key>=<v>` precarga entidad+filtros declarados**; payments→verificar cadena ledger; leads→**Convertir** `POST /leads/:id/convert` (crea cuenta demo + email magic-link real); payloads expandibles; export csv/pdf; consultas guardadas.
- `/admin/finanzas` ⚠️: KPIs `finance/summary`; tabs payouts (approve `POST /:id/approve` sin confirm idempotente; pay `POST /:id/pay` evidence opcional), accrual (`POST /payouts/generate` idempotente), payments read-only, saas MRR.
- `/admin/facturacion`: candidates → Emitir `POST /billing/generate` (idempotente); docs filtros → PDF inline; **Anular** inline razón* → `POST /billing/:id/void`.
- `/admin/facturacion/transacciones`: KPIs del mes `finance/summary` (ingreso plataforma, GMV tx, costo pasarela, por transferir) + desglose segmento + FilterBar `payments` + lista `browse/payments` (default PAID; KPIs del período no siguen el filtro).
- `/admin/facturacion/suscripciones`: KPIs `finance/mrr` (MRR/ARR/activas/a convenir) + byTier + funnel de estados clickeable (filtro client-side) + lista suscripciones (kind, actor, tier, ciclo, status, monto mensual, próximo cobro).
- `/admin/jobs` ⚠️: pause/resume PATCH sin confirm; edit cron PATCH; **Run now** ConfirmSheet `POST /:key/run` (efectos reales: mails, payouts); runs list.
- `/admin/campanas` ⚠️: lista; Edit (DRAFT|SCHEDULED); **Test** send sin confirm; **Run now** ConfirmSheet (audiencia completa real); Cancel ConfirmSheet. Form: audiencia ALL|ROLE|EVENT|lifecycle+days; audience-count debounce; schedule ONCE|CRON.
- `/admin/auditoria`: read-only `GET /admin/audit` filtros.
- `/admin/academias`: score-health read-only + drill a usuarios.
- `/admin/catalogos`: styles(+genre)/class-levels(+order)/class-types — filas de lectura (nombre|meta|Editar+Eliminar); alta en `/admin/catalogos/nuevo?cat=` y edición en `/admin/catalogos/[cat]/[id]/editar` (ambas páginas dedicadas, cat inválido→styles, id inválido→notFound); delete ConfirmSheet; 409 en uso; 409 dup.

## 10. Soporte `/soporte` (SUPPORT|ADMIN, read-only total)
- Búsqueda ≥2c debounce → `GET /support/users` (top 20) → detalle inline `GET /support/users/:id` (person, contadores, roles, últimos 10 tickets→evento, últimos 10 pagos). Sin impersonación/refunds/edición. Superficie más segura para smoke.

## 11. Staff puerta (rol STAFF → `checkins.write`+`social.manage`)
- `/staff`: `GET /events` público (PUBLISHED/LIVE) → cards → /staff/{id}. v1 muestra TODOS los eventos (sin filtro de asignación).
- `/staff/[eventId]` (consola puerta, ~1100 líneas): boot `GET /events/:id`, `/door-manifest`→IndexedDB cache, cola offline, `/checkins` (poll 15s), wake lock.
  - Scan cámara → dedupe <1.5s → `POST /checkins {qrToken,eventId,method:SCAN}` → overlay verde 201 ✓+nombre (ámbar nopass) / rojo 409 duplicado / rojo error; auto-clear 2.5s.
  - Manual: con manifest → búsqueda offline ≤8 → `POST /checkins/manual`; sin manifest → personId crudo.
  - Offline: decode JWT local (expired→error), dup check local, encola IndexedDB → overlay con sello offline; banner pending+edad manifest.
  - Sync `POST /checkins/sync` (online/30s/mount/post-scan): synced→dequeue; duplicate/invalid/error→badges conflict/failed (resolución humana, sin UI).
  - **Sin UI pero en API:** check-out `/checkins/:id/out`, void (requiere assignment), door-sale `POST /checkins/door-sale` (crea cuenta light + ticket USED + check-in atómico, doorCap).
  - Autorización solo a nivel permiso — cualquier `checkins.write` registra en cualquier evento.

## 12. Venue `/venue` (VENUE_MANAGER → `venues.manage`)
- `GET /venues/mine` → selector si >1; dashboard `GET /venues/:id/dashboard`: KPIs (eventos próximos/30d, check-ins 30d agregado — sin live ni Prime Time), próximos eventos, reservas de mesas, flujo por hora 30d, menús externos.
- Única mutación: rentals REQUESTED → Confirmar|Cancelar (mini-confirm 2 pasos inline) → `PATCH /venues/:id/rentals/:rentalId`.

---

## Anexo A — Gaps y notas para automatización

1. **Sin infra e2e actual**: no existe playwright.config ni specs e2e; solo Vitest unit en api y un test web (`wallet-sort.test.ts`). El "Playwright smoke e2e" de AGENTS.md está por construir — este inventario es su backlog.
2. **Sin `data-testid`** — usar roles/texto/`data-tour`. Recomendación: agregar `data-testid` en CTAs críticos de checkout/confirmaciones antes de escribir la suite (evita fragilidad por i18n).
3. **Tours OnboardingRunner** pueden interceptar clicks en primera visita — fixtures deben pre-sembrar `me.onboarding` o driver descarta el tour.
4. **Estado de filtros no-URL en consolas** — tests deben interactuar; no deep-link.
5. **Acciones destructivas sin confirmación** (lista en §0) — automatizar con datos seed sacrificables; documentar como riesgo de UX/datos.
6. **Timers fijos** (~1200ms redirects, 2.5s overlays puerta, 50s re-mint QR, 15s poll checkins) — usar `waitFor` en vez de sleeps; fake timers no trivial con SSR.
7. **Determinismo de pagos**: stub:// + `POST /payments/webhook` cubre PAID/FAILED sin Flow. Claims manuales: upload multipart testeable con fixture de imagen.
8. **Privacidad a asertar**: ratings nunca individuales ni identidad del evaluador (k-anon ≥3); scores CRM por actor; receipt streams auth'd; gateway keys solo mask; WhatsApp audience phones intencional pero acotado al actor.
9. **Offline puerta**: flujo IndexedDB + sync — candidato a tests de integración específicos (Playwright offline mode).
10. **Blast radius admin**: role grants, params globales, payouts, billing void, campaigns (emails reales), lead convert, jobs run-now — preferir rol custom de prueba y stubs de mailer.
11. **Render stale al cambiar de entidad/vista** (bug real 2026-10-18 en `/admin/datos`): al seleccionar otra entidad hay un frame con rows viejas bajo la entidad nueva antes de que corra el fetch — `renderRow` formateaba campos inexistentes → `RangeError: Invalid time value`. Fix: filas etiquetadas con la entidad que las produjo (`result.entity === entity`). Caso QA: cambiar de entidad/píldora repetidamente con datos cargados no debe crashear; vale para cualquier página con filas shape-per-entity (`/admin/datos`; `/analitica` es inmune por shape genérico de celdas).
