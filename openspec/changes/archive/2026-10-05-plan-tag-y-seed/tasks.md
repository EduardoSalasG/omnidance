# Tasks — plan-tag-y-seed

## Implementación

- [x] `profile-plans-section.tsx`: tipo de plan como `Badge variant="neon"`;
      la línea gris queda solo para cuotas
- [x] `seed-dev.ts`: `plan()` con `aliases` (renombre in-place + desactivar
      restos); nombres de categoría variables por academia
- [x] Todas las academias con `TRIAL` "Clase de prueba" y `SINGLE`
      "Clase suelta"
- [x] Descripciones sin repetir lo que ya comunican tag/metadata

## Verificación

- [x] `pnpm exec tsc --noEmit` web + api
- [x] openspec validate
- [x] impeccable detect sobre el componente tocado
- [x] reseed + smoke visual de `/academias/:id` con sesión real (2 corridas
      idempotentes, tags neon confirmados en SSR)
