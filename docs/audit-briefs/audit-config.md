# Brief: audit-config

Lee `docs/audit-briefs/_common.md` primero: contiene el checklist, la
referencia de expand y el formato de output. Audita SOLO estos archivos
(varios son redirects legacy — clasifícalos como tal si solo redirigen):

- `apps/web/src/app/[locale]/(app)/academia/configuracion/page.tsx` (NO tocada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/clases/page.tsx` (NO tocada; ex `general`, renombrada en este change)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/general/page.tsx` (¿redirect legacy?)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/niveles/page.tsx` (NO tocada; mantenedor llegó en change previo `academy-niveles-to-config`)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/perfil/page.tsx` (NO tocada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/apariencia/page.tsx` (tocada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/importar/page.tsx` (tocada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/suscripcion/page.tsx` (NO tocada; ex `/academia/suscripcion`)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/metodos-de-pago/page.tsx` (NO tocada; ex `pagos`, renombrada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/metodos-de-pago/nuevo/page.tsx` (NO tocada)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/metodos-de-pago/[methodId]/page.tsx` (tocada ~2)
- `apps/web/src/app/[locale]/(app)/academia/configuracion/pagos/page.tsx` + `pagos/nuevo` + `pagos/[methodId]` (¿redirects legacy?)
- `apps/web/src/app/[locale]/(app)/academia/suscripcion/page.tsx` (¿redirect legacy?)
- `apps/web/src/app/[locale]/(app)/academia/niveles/page.tsx` (¿redirect legacy?)

Verifica además que los redirects legacy apunten a la ruta nueva correcta.
