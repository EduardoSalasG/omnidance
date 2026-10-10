# Tasks

## 1. Fix SSR base URL (bug prod)

- [x] `lib/server-api.ts` con `SERVER_API_URL` (API_URL →
  API_PROXY_TARGET → NEXT_PUBLIC_WEB_URL → localhost:4000)
- [x] Los 11 módulos SSR usan el helper (eventos, evento detalle,
  checkout, evaluar, academias detalle/checkout, clases, locales,
  reclamar, public-events, public-academies)

## 2. API - dashboard del productor

- [x] `GET /producer/dashboard` en ProducerController: kpis
  (upcoming/sold/grossMonth/pendingClaims), topRevenue y
  topAttendance top-5, cola pendingClaims (count+amount+items≤5)
- [x] Spec del endpoint (fakes de prisma como los specs vecinos)

## 3. Web - home del productor

- [x] `components/producer/producer-dashboard.tsx` (KPIs + cobros por
  revisar + tops) con skeleton/error/empty
- [x] HomeHub: lente PRODUCER renderiza el dashboard; fuera el hero
  del productor

## 4. Nav del productor

- [x] TABS_BY_ROLE.PRODUCER sin el tab "Crear evento" ni Payouts
- [x] Drawer: fuera item /productor (hub) y grupo Social→Eventos;
  pagos + parametros bajo grupo "Configuración" al final
- [x] `/productor` page → redirect a /inicio; ProReturnNotice se mueve
  a /productor/parametros; webhook retorna `?pro=ok` ahí
- [x] backHref `/productor` → `/inicio` en los 6 módulos
- [x] CTA "Nuevo evento" en /productor/eventos → variant primary
- [x] i18n: keys producer.dash.*, navGroups.config

## 5. Perfil

- [x] PRODUCER sin racha, insignias ni "Mis pagos" (STREAKLESS,
  GAMIFLESS, guard de pagos)

## 6. Verificación

- [x] `npx tsc --noEmit` api y web
- [x] Vitest afectados
- [x] `node scripts/i18n-audit.cjs`
- [x] `openspec validate` + archive
- [x] impeccable detect sobre los web tocados
