# Handoff - 2026-10-19c (admin-jobs-mail-campaigns + context-audiences)

## Completado en esta sesión (commits en dev)

### `mail-campaign-context-audiences` → audiencias con ctx + plantillas

Decisión (conversada): el admin quería crear recordatorios tipo
"vencimiento del plan" por su cuenta — las campañas con HTML estático
no alcanzaban.

- **Variables `{{var}}`** en subject+HTML interpoladas por destinatario;
  `{{name}}`/`{{email}}` siempre. Variable no soportada por la audiencia
  → 400 al guardar (lista las disponibles).
- **Audiencias de ciclo de vida** `{days}` (default 7, 1-365):
  `ENROLLMENTS_EXPIRING` (endsAt en [now,now+days), ACTIVE/ONLINE →
  `{{academy}}`,`{{plan}}`,`{{endsAt}}`), `ENROLLMENTS_EXPIRED` (gracia)
  y `PLATFORM_SUB_EXPIRING` (nextInvoiceAt → `{{plan}}` tier,
  `{{nextInvoiceAt}}`).
- **Dedup por ciclo** `MailCampaignSent` (`@@unique(campaignId,dedupKey)`,
  `enr:<id>:<endsAt>`/`psub:<id>:<nextInvoiceAt>`): un cron diario no
  re-envía por el mismo ciclo (SKIPPED "ciclo ya recordado"); FAILED no
  quema la marca; renovar cambia la clave y rearma. Audiencias genéricas
  sin dedupKey → cada corrida envía a todos (newsletter).
- testSend sustituye vars con el ctx del primer destinatario real.
- Un mail por persona por corrida (ctx del primer match si tiene 2
  inscripciones por vencer - el recipient es único por personId).
- Migración `20261019000002_mail_campaign_sent`.
- Suite: **1717/1717, 86 archivos** (+8 specs del slice); web build
  71/71; i18n OK; OpenSpec válido; openapi/postman regenerados (249).



### `admin-jobs-mail-campaigns` → consola de jobs + campañas de mail

Decisión de producto (conversada): ambos alcances - control de los
crons existentes Y campañas de mail programables por el admin
(audiencias ALL/ROLE/EVENT, única + recurrente, HTML libre + preview).

**Consola de jobs** (`ScheduledJob`/`JobRun`):
- `JOB_REGISTRY` global (`JobsModule` @Global, patrón STORAGE): los 4
  schedulers registran `{key, label, defaultCron, handler}` en
  `onModuleInit` - ya no llaman `node-cron.schedule()`.
- `JobsService.sync()` en bootstrap: upsert por key SIN pisar
  `cronExpr`/`enabled`/`timezone` editados por el admin; key sin
  handler → `orphaned`; runs RUNNING stale → ERROR + libera mutex.
- `JobsRunner`: UN tick `* * * * *` corre jobs `enabled && !orphaned
  && nextRunAt <= now` (catch-up tras downtime). `nextRunAt` con
  **cron-parser** (dep nueva aprobada; DST de America/Santiago).
- Cada corrida → `JobRun` (RUNNING→OK|ERROR, trigger CRON|MANUAL,
  actorId, meta con contadores del handler). `runningRunId` = mutex
  (run manual concurrente → 409).
- `tickets.day_of` cambió de "13:00 hora servidor" a `0 9 * * *`
  America/Santiago explícito (los demás eran hora local del servidor
  → ahora CL explícito también).
- Endpoints `admin.access` + AuditLog: `GET/PATCH /admin/jobs/:key`,
  `POST :key/run`, `GET :key/runs`. Front `/admin/jobs`.

**Campañas de mail** (`MailCampaign`/`MailCampaignRun`/
`MailCampaignRecipient`):
- Audiencia = especificación re-anclada por corrida: `ALL` (con email)
  | `ROLE`+roleKey APPROVED | `EVENT`+eventId (owners tickets ACTIVE).
- `scheduleKind` ONCE (runAt) | CRON (cronExpr+tz). Estados
  DRAFT→SCHEDULED→SENDING→DONE|FAILED|CANCELLED.
- `mail.campaign_dispatch` es un ScheduledJob (`* * * * *`) - pausable
  desde la consola detiene TODOS los envíos.
- `sendRun`: recipients dedup por run, envío secuencial ~150ms,
  SENT|FAILED|SKIPPED por destinatario; cancel mid-send corta y marca
  SKIPPED; crash recovery en bootstrap (run ERROR, campaña SENDING →
  SCHEDULED si CRON / FAILED si ONCE).
- `POST :id/test` = copia `[TEST]` al email del admin. Editar solo
  DRAFT/SCHEDULED (SENDING → 409).
- Front `/admin/campanas`: form con textarea HTML + preview iframe
  `sandbox`, audiencia con conteo vivo (`GET audience-count`),
  once/cron + presets, test/run/cancel. Cards en hub `/admin`.

## Verificación

- API vitest: **1709/1709, 86 archivos** (38 nuevos del slice)
- API tsc + web tsc limpios; `next build` 71/71 páginas; i18n
  `ALL_KEYS_OK`
- openapi/postman: **249 paths** (+11: jobs 4 + campaigns 7)
- openspec validate: válido
- En vivo: sync creó los 5 ScheduledJob con nextRunAt calculado;
  `/api/admin/jobs` y `/api/admin/mail-campaigns` → 401 sin sesión
- Dep nueva: `cron-parser@^5.10.1` (aprobada por usuario)

## Credenciales prod (confirmado por usuario)

- `RESEND_API_KEY` — **cargada en prod** ✅
- `VAPID_*` (web push) — **cargadas en prod back + Netlify** ✅
- Pendientes sin verificar: `GOOGLE_WALLET_*` (el botón se oculta sin
  ellas), `FINTOC_*` (adaptador testeado solo con mocks).
- Al promover a prod, primer chequeo operativo: test-send de una
  campaña DRAFT en `/admin/campanas` + verificar un push `ticket.day_of`
  real en el próximo evento del día.

## Gaps conocidos

- Sin e2e de los nuevos endpoints (unit specs de service+controller
  cubren la lógica; falta spec e2e del wiring completo).
- Envío real nunca ejercido en dev (key cargada solo en prod - el
  test-send post-deploy es la verificación).
- Campañas sin opt-out/unsubscribe (declarado en proposal - las
  audiencias son usuarios registrados de la plataforma).
- Multi-instancia: el runner asume 1 proceso (prod actual). Si se
  escala hay que agregar claim atómico (`UPDATE ... WHERE runningRunId
  IS NULL`) - documentado en design.md.
- Selector de eventos del form trae solo PUBLISHED (browse take ~50).
- Audiencias de ciclo: 1 mail por persona por corrida (ctx del primer
  match si tiene N inscripciones por vencer).
- QA visual de ambas páginas en browser real pendiente.

## Próximos pasos posibles

- QA visual + e2e sandbox antes del release gate `dev → main`.
- Credenciales prod pendientes: GOOGLE_WALLET_*, FINTOC_*.

---

# Append - academy-checkout-manual-pay (misma sesión, commit propio)

### Qué cambió

La sección "Pagar a la academia" salió de la ficha pública y entró al
checkout de membresía. Pedido del usuario: elegir el medio en el
checkout, datos de transferencia copiables (nombre/RUT/banco/tipo/n°
cuenta/email + bloque completo para pegar en la app del banco), intento
persistido reanudable al salir de la app, y seguimiento del intento.

### Modelo

- `ClaimStatus` + `AWAITING` (agregado al final del enum para que
  `ORDER BY status ASC` siga mostrando PENDING primero en la cola).
- `PaymentClaim.receiptKey` nullable (null solo en AWAITING) +
  `methodId` (reanuda el intento con los datos vigentes del método).
- Migración `20261020000000_academy_claim_intents`. **Ojo**: la migración
  se aplicó a la DB dev ANTES de agregar `methodId` al archivo - la
  columna se aplicó aparte con `prisma db execute`. El archivo final es
  íntegro para prod/fresh installs.

### Endpoints nuevos (SessionGuard)

- `POST /academies/:id/claims/intent {planId,methodId}` → claim
  AWAITING idempotente por person+plan (devuelve el AWAITING/PENDING
  vivo si existe; REJECTED no bloquea). Snapshot `amount=plan.price`.
- `POST /academies/:id/claims/:claimId/receipt` multipart → AWAITING→
  PENDING + notifica owner (mismas reglas de archivo que POST /claims).
- `POST /academies/:id/claims/:claimId/cancel` → borra el AWAITING
  propio (borrador sin efecto financiero).
- `GET /academies/:id/claims/mine` ahora incluye `planId`, `methodId`,
  `methodType` (el checkout reanuda el intento del plan en curso).
- Cola del owner: `listClaims` incluye `receiptKey`; AWAITING se
  muestran aparte ("Pagos iniciados sin comprobante"), no accionables.

### Front

- `ManualPayPanel` en `checkout/membership-checkout-client.tsx`: radio
  "Tarjeta o Webpay" + métodos activos (solo mode=once - la suscripción
  recurrente no aplica a medios manuales). Confirmar → intent → panel
  de instrucciones: TRANSFER con copy por campo + "Copiar todos"
  (incluye monto), PAYMENT_LINK con botón, CASH con instrucciones;
  upload de comprobante → "Comprobante en revisión"; "Cambiar medio de
  pago" cancela el intento. Claim REJECTED muestra el motivo y permite
  reintentar. Cuando el panel está activo se oculta el CTA de Flow
  (evita doble pago).
- Ficha `/academias/:id`: `AcademyPaySection` eliminado →
  `AcademyClaimsMine` (lista read-only de intentos/comprobantes propios).

### Verificación

- 11 specs nuevas (`academy-claims.service.spec.ts` - el servicio no
  tenía spec); suite **1728/1728, 87 archivos** (gap-crm e2e falló una
  vez por Notification creada por el JobsRunner del dev server sobre la
  DB compartida - pasó aislado).
- tsc api+web limpio; build web 71/71; i18n ALL_KEYS_OK;
  `impeccable detect` = []; OpenSpec válido; openapi/postman 251 paths.
- Endpoints nuevos verificados en vivo: 401 sin sesión.

### Gaps

- Un PENDING deja al alumno sin CTA de Flow (no puede pagar dos veces);
  si el owner nunca revisa, el alumno queda esperando - natural.
- Claim AWAITING huérfano de método borrado: muestra "confirma con la
  academia" y el upload sigue disponible.
- QA visual pendiente; falta e2e del flujo completo.

---

## Addendum — platform-polish-gaps (sesión siguiente, 21-oct)

Todos los gaps menores del slice jobs/campañas cerrados (menos i18n,
decisión de producto pendiente):

- **Opt-out de campañas**: `Person.mailOptOutAt` + footer automático
  con link firmado `GET /api/mail/unsubscribe?p=&t=` (HMAC-SHA256 del
  personId con JWT_SECRET, ruta pública, solo ThrottlerGuard). Las
  audiencias excluyen opt-outs al resolver Y en el loop de envío. Los
  mails transaccionales no se tocan.
- **Recipient por contexto**: `MailCampaignRecipient.dedupKey` +
  unique `(runId,personId,dedupKey)` — N inscripciones por vencer = N
  mails con su propio ctx (antes 1/persona con el primer ctx).
- **Claim atómico de jobs**: `updateMany(id, runningRunId IS NULL)`
  como mutex — multi-instancia seguro, quien pierde descarta el run
  (CRON skip / MANUAL 409).
- **Audiencia `CLAIMS_PENDING {days}`**: owners con claims PENDING
  >N días → vars `{{academy}}`/`{{count}}`, dedup diario por academia.
- **Selector de eventos**: búsqueda por `q` sin filtro de status
  (eventos pasados elegibles — caso mail post-evento).
- **E2e del flujo manual**: intent→AWAITING (idempotente)→receipt→
  PENDING→approve→Payment MANUAL + enrollment; cancel propio.
- Migración `20261021000000_platform_polish_gaps` aplicada (ojo: el
  unique viejo de MailCampaignRecipient era INDEX, no CONSTRAINT —
  la migración usa DROP INDEX).

Verificación: 1739/1739 tests (87 archivos; gap-crm flake conocido por
dev-server compartiendo DB - pasa solo), tsc api+web, build 71/71,
i18n ALL_KEYS_OK, openspec válido, openapi/postman 252 paths,
impeccable detect = [].

Pendiente del usuario: promoción dev→main aprobada tras este slice
(release gate: SemVer+changelog+tag+supervisión).
