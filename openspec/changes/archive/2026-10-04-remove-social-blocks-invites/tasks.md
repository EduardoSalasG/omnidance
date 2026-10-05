# Tasks — remove-social-blocks-invites

- [x] Migración: `DROP TABLE` `UserBlock`, `PracticePartnerRequest`,
      `AvailabilityToggle` (datos históricos de DanceSession intactos)
      → `20261008000000_drop_social_blocks_invites` (no aplicada — la
      corre `migrate deploy`; diff schema↔migrations vacío)
- [x] Schema: eliminar los 3 modelos y sus relaciones/referencias
- [x] API: eliminar `blocks.controller.ts`,
      `partner-requests.controller.ts`, `availability.controller.ts` y
      sus imports/registro en `social.module.ts`
- [x] API: `sessions.controller.ts` — eliminar `invite`, `confirm`,
      `decline` + el chequeo `userBlock`; conservar el resto del
      lifecycle. **Decisión**: el escaneo QR es el único alta de bailes —
      nuevo `POST /sessions/scan` crea la sesión directamente CONFIRMED
      (el QR rotativo acredita presencia mutua; el handshake ya no es
      necesario) + notify `session.confirmed` + puntos/badges de ambos.
      `declare` sigue creando INVITED — su resolución es backlog
      separado.
- [x] API: limpiar `social/infrastructure/people.controller.ts` y
      cualquier otro uso de userBlock/partnerRequest/availabilityToggle
      (grep exhaustivo — 0 residuales en `apps/api/src` y `apps/api/test`)
- [x] e2e: quitar casos de blocks/partner-requests/availability/invite
      en `gap-social.e2e.spec.ts`, `social-endpoints.e2e.spec.ts` y
      mocks relacionados; nuevo bloque `scan` en `sessions.e2e.spec.ts`
      (201 CONFIRMED + cooldown + 404 del ciclo eliminado) y wiring de
      notificación `session.confirmed` en `wiring.e2e.spec.ts`
- [x] Web: quitar `partnerRequests` de `amigos/[id]/page.tsx`,
      `components/social/types.ts`, keys i18n huérfanas; `DanceScanner`
      apunta a `/sessions/scan`; `SessionCard`/`types.ts` sin
      confirm/decline (endpoints 404)
- [x] `tsc --noEmit` + suite de specs tocados + `openspec validate`
      (api+web limpios; 63 tests e2e + 39 unit en verde;
      i18n-audit `ALL_KEYS_OK`; strict valid)
