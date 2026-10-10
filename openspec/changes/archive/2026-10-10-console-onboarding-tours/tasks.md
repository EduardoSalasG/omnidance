# Tasks — console-onboarding-tours

## 1. Tour del productor

- [x] 1.1 `ProducerDashboard`: anchors `data-tour` en KPIs
  (`producer-kpis`), cobros por revisar (`producer-claims`) y tops
  (`producer-tops`)
- [x] 1.2 `HomeHub` rama PRODUCER: `OnboardingRunner tour="productor"`
  con pasos dashboard → nav → campana (chrome dual: `appbar-menu`
  `<lg` / `app-sidebar` `≥lg`)
- [x] 1.3 `BottomNav.SIDEBAR_TOUR`: `"/productor/eventos"` →
  `nav-events` para que el paso de eventos resuelva en desktop
- [x] 1.4 i18n: reescribir `tours.productor` al copy de la consola v2

## 2. Tour del instructor

- [x] 2.1 `HomeHub`: `data-tour="home-classes"` en la sección Próximas
  clases
- [x] 2.2 `OnboardingRunner tour="instructor"` en la rama INSTRUCTOR:
  semana → próximas clases → Mis clases → Alumnos → campana → perfil
- [x] 2.3 i18n: namespace `tours.instructor` nuevo

## 3. Verificación

- [x] 3.1 `openspec validate` (2 passed) + i18n audit `ALL_KEYS_OK`
- [x] 3.2 `tsc` web limpio + `impeccable detect` `[]` sobre el diff
- [ ] 3.3 Release: version + changelog + dev→main + tag + push +
  supervisar deploy
