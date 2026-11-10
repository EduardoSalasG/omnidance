# Tasks: importación de alumnos con campos mínimos

## Backend

- [ ] 1.1 Spec rojo en `academy-import.service.spec.ts`: fila solo
  `email,nombre` importa (Person + Enrollment `planId:null` +
  invite); `plan` ausente ya no es error; `plan` presente conserva
  semántica actual; columnas nuevas mapean a los campos
  (nationalId/birthDate/gender); errores por `sexo`/
  `fecha_nacimiento` inválidos.
- [ ] 1.2 Schema: `Person.nationalId String?` + `pnpm db:migrate`
  (migración versionada). Sin unique ni índice.
- [ ] 1.3 `importStudents`: required baja a `["email","nombre"]`;
  columnas opcionales nuevas (`rut`/`dni`/`documento` → nationalId
  normalizado; `fecha_nacimiento` → birthDate con dd/mm/yyyy e ISO;
  `sexo` → Gender con aliases). Updates por email solo setean campos
  presentes (regla de `telefono` hoy).
- [ ] 1.4 `parseImportFile`: `.csv` por parser actual + `.xls`/`.xlsx`
  por `xlsx` (hoja 1, raw:false, dep pineada ≥7 días publicada);
  extensión o MIME; mismas cotas/errores.

## Front y cierre

- [ ] 2.1 `/academia/configuracion/importar`: template con columnas
  nuevas + copy required/opcional + formatos aceptados. Keys i18n
  solo es-CL; `i18n-parity.cjs` sin drift nuevo.
- [ ] 2.2 Docs: `qa-flows-inventory.md` (sección importación),
  architecture.md si el endpoint cambia (acepta xlsx ahora - sí, el
  contrato cambió: actualizar).
- [ ] 2.3 Verde: `pnpm --filter @omnidance/api test` + typecheck API
  + `pnpm --filter @omnidance/web typecheck` + test del page
  (`importar/page.test.tsx`) + `openspec validate --changes`.
