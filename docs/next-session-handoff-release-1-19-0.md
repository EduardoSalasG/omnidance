# Handoff — release 1.19.0 + migración Cloudflare (2026-11-10/11)

## Estado: TODO EN PRODUCCIÓN

- `v1.19.0` taggeado, PR #5 mergeado a `main` (01:16Z), deploys verdes:
  QA 3m + Deploy API 8m7s. Health prod 200 por `api.omnidance.tech`
  (CF Full strict) y por el alias viejo. Netlify prod ya sirve con
  `API_PROXY_TARGET` nuevo: `omnidance.tech/api/*` → `api.omnidance.tech`.
- 4 changes implementados + archivados: `2026-11-10-security-event-scope`
  (BOLA), `2026-11-10-api-edge-hardening`, `2026-11-10-web-edge-hardening`,
  `2026-11-10-auth-sessions`. Suite 2733/2733 verde.
- `openspec/changes/multipais-foundation` sigue ABIERTO (tasks 10/11/13
  diferidos por decisión del usuario: multi-day passes, free socials,
  congresses/festivals).

## Infra operada en prod (fuera del repo)

- Zona `omnidance.tech` en Cloudflare (erin/guss NS); `api` A proxied,
  web Netlify + correos Zoho/Resend/SES en DNS-only. Cert origen con
  ambos SAN (certbot --expand). `API_URL` en `/opt/apps/omnidance/.env`
  → `api.omnidance.tech`; alias viejo sigue sirviendo (webhooks Flow
  ya registrados).
- Vhost endurecido INSTALADO en la VM
  (`/etc/nginx/sites-available/api.omnidance.eduardosalasg.dev`,
  backup `.bak-pre-hardening`): limit_req 10r/s+30 y limit_conn 40/60
  por $realip (map x-nf > cf-connecting-ip). Verificado con burst:
  52x200 + 28x503.
- fail2ban activo: jails `sshd` + `nginx-limit-req`.
  UFW solo 22/80/443; unattended-upgrades activo.
- BetterStack: 2 monitores (`api.omnidance.tech/api/health` con
  keyword status:ok + `omnidance.tech`).
- GTM: tag Clarity eliminada (solo nativa `clarity.tsx`); Clarity
  masking = Strict.
- SSH a la VM funciona desde esta máquina:
  `ssh -i "C:/Users/salas/Documents/oracle-cloud/webapps-vps/keys/ssh-key-2026-05-25 (1).key" ubuntu@146.181.44.133`

## Backlog (decisiones del usuario, no urgente)

- **Refinamiento amplio de analíticas admin**: el usuario quiere data
  más precisa y tracking completo por academia/usuario/productor.
  Primer ítem: KPI/vista global de sesiones activas
  (AuthSession: total activas, online <10min, por plataforma;
  hoy solo existe vista por usuario en /admin/usuarios/[personId]
  y entidad `dispositivos` desde app.launch). Encarar como change
  dedicado cuando se defina el alcance completo.
- Pendientes de evaluación diferidos: iOS push real, smoke push
  real por dominio, decisiones `academy.sale_deal.responded` /
  `claimUrl`/`collectUrl`/`paymentUrl`.
- Opcionales infra: DNSSEC en CF (activar + DS en Squarespace),
  CF rate-limit rule sobre api.omnidance.tech, restringir 80/443
  a rangos CF cuando el alias viejo se retire.

## Notas

- Los JWTs legados (sin jti) siguen válidos hasta expirar (30d);
  revocación granular aplica a sesiones emitidas post-1.19.
- Regresión resuelta esta sesión: `issueSession` solo incluye jti
  cuando el repo persiste la fila (specs con AuthService sin repo
  mintean JWT legado). `helpers.ts` limpia authSession (FK).
- DB dev reseteada + reseeded (seed reporta credenciales dev).
- Regla commits: sin atribución de agente (verificada).
