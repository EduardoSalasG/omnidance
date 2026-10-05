# Tasks - pwa-install-prompt

- [x] `components/install/InstallPrompt.tsx`: bip nativo (Chromium),
  instrucciones iOS, guards (standalone, onboarding flag, consent,
  rutas sin chrome).
- [x] Mount en `(app)/layout.tsx` junto a ConsentBanner.
- [x] `manifest.json`: `id`, `scope`, `handle_links: "preferred"`.
- [x] i18n: part `install.json` + registro en `messages.ts`.
- [x] Verificación: `tsc --noEmit` web, i18n audit ALL_KEYS_OK.
