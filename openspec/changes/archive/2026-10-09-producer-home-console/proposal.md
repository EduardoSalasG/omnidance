# Cambio: producer-home-console

## Por qué

El home del productor es un hero genérico + KPIs sueltos; su consola
tiene un hub `/productor` que duplica la navegación y la barra lateral
mezcla operación con configuración (comisión/defaults y liquidaciones
junto a los módulos del día a día). El dueño de academia ya resolvió
esto: su inicio ES el dashboard (KPIs + colas operativas) y su
sidebar separa dominios con una sección "Configuración" encima de
Cuenta.

Además hay un bug productivo: los server components del web fetchean
`process.env.API_URL ?? "http://localhost:4000"` - en Netlify `API_URL`
no existe, así que todo server fetch cae a localhost y las páginas
SSR (eventos, academias, clases, locales, checkouts, evaluar,
reclamar) muestran error o vacío en prod.

## Qué cambia

- **Fix prod**: `lib/server-api.ts` resuelve la base del API en
  `API_URL → API_PROXY_TARGET → NEXT_PUBLIC_WEB_URL → localhost:4000`
  y los 11 server modules la usan.
- **Home del productor** (`/inicio`, lente PRODUCER): dashboard propio
  estilo owner - KPIs (eventos agendados, entradas vendidas,
  facturación del mes), top 5 eventos por facturación, top 5 por
  asistencia y la cola "Cobros por revisar" (comprobantes PENDING).
  Sin hero ni "Próximos eventos".
- **API**: `GET /producer/dashboard` (SessionGuard + productor
  aprobado o admin) agrega esos datos en un solo request.
- **Nav del productor**: tab "Crear evento" fuera; el item del hub
  `/productor` se elimina y la página redirige a `/inicio`; los
  `backHref` de los módulos apuntan a `/inicio`; sección
  "Configuración" (Comisión y defaults + Mis pagos) sobre Cuenta;
  fuera el grupo Social→Eventos del drawer.
- **Retorno de Flow Pro**: el redirect `/productor?pro=ok` pasa a
  `/productor/parametros?pro=ok` (el aviso vive donde está la sección
  Pro).
- **Perfil del productor**: sin "Semanas seguidas", insignias ni
  "Mis pagos" (su dinero vive en su consola).
- **CTA "Nuevo evento"** en /productor/eventos pasa a `primary`
  (morado de la lente social).

## Impacto

- Specs: `events/producer-console`, `people-profile`.
- API: nuevo endpoint `GET /producer/dashboard`; redirect del retorno
  de Flow actualizado.
- Web: home del productor, sidebar/tabs, 6 backHref, perfil, CTA.
- Sin migraciones ni cambios de contrato existentes.
