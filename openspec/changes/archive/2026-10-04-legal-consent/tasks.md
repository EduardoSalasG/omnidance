# Tasks — legal-consent

- [x] Migración: `Person.consentVersion String?` +
      `Person.consentAcceptedAt DateTime?` (después de la migración de
      remove-social-blocks-invites — NO aplicar, la aplica el
      orquestador)
- [x] `CONSENT_VERSION` constante; DTOs magic-link/register/login con
      `consent?: boolean`; estampar en Person al autenticar con
      consent:true; `POST /me/consent`; `GET /me` expone los campos
- [x] `/terminos` + `/privacidad` — páginas públicas (marketing layout)
      con el texto completo según design.md (i18n parts o strings
      directos deliberados — son legales, no catálogo; decidir lo más
      simple consistente con el repo)
- [x] Login/register form: checkbox obligatorio con links a ambas
      páginas (target nuevo — no perder el form)
- [x] Banner de consentimiento para usuarios con consent null/versión
      antigua (en (app) layout, dismissible; CTA "Acepto" → /me/consent
      → oculta; link "Ver cambios" a /privacidad)
- [x] Verificación: tsc api+web, specs tocados, i18n audit, impeccable
      detect en las páginas nuevas, openspec validate
- [x] Flag en reporte: campos `[PENDIENTE]` del texto legal para que el
      usuario complete antes de producción
