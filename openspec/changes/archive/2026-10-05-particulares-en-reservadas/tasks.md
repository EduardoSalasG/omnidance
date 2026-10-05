# Tasks — particulares-en-reservadas

- [x] API: `GET /private-lessons/mine` rama alumno incluye
      `academy: {id, name}` (join Academy por academyId)
- [x] `/clases`: `loadMine` hace Promise.all `/classes/mine` +
      `/private-lessons/mine`; union `ReservedItem`; merge por día en
      lista y calendario; grupo "Por agendar" fijado arriba para las
      sin fecha; card de particular con estado + cancelar
      (REQUESTED/CONFIRMED)
- [x] `/clases` historial: merge de particulares DONE/CANCELLED
- [x] Eliminar `clases/particular/page.tsx`, chip `privateTray`,
      entrada en BottomNav sheet (`+`), label y redirect de
      notificaciones → `/clases?scope=reservadas`
- [x] `PrivateLessons`: retirar rama alumno (mine) — queda staff +
      instructor; `academy` prop requerida
- [x] i18n: retirar keys huérfanas (`classes.privateTray`,
      `lessons.mineTitle`, `lessons.emptyMine`, `lessons.requested` si
      queda sin uso); audit ALL_KEYS_OK
- [x] Verificación: tsc api+web, tests tocados, impeccable detect,
      openspec validate, smoke manual /clases reservadas (pendiente — requiere sesión real)
