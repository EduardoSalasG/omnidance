# Tareas; home-weekly-quota

- [x] 1. Change + artifacts.
- [x] 2. API: `GET /classes/my-quota` en classes.controller; sesión,
       enrollments BOOKABLE, por c/u {academyId, academyName, kind, used,
       limit}; WEEKLY usa isoWeekRange(ahora); PACK desde startedAt;
       plan null → UNLIMITED. Sin `any`. Spec vitest.
- [x] 3. Fix copy agotamiento: mensaje con mayúscula inicial y plural
       correcto ({N} clase(s)) donde se emite el error de cuota.
- [x] 4. Web: `WeeklyQuotaCard` en HomeHub (vista dancer); fetch del
       endpoint, SkeletonList al cargar, nada si vacío; fila por
       inscripción con barra/contador + CTA "Agendar" → /clases?scope=mias.
       i18n singular/plural en los 4 estados + PACK + UNLIMITED.
- [ ] 5. Orquestador: tsc+vitest+i18n-audit, openapi regen, qa-inventory,
       archive, commit.
