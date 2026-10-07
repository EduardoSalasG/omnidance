## 1. Landing (/, /para-academias, /para-productores, /pro)

- [x] 1.1 Hero `lg:pt-32 lg:pb-24`; sección de dolor PAS `lg:py-16` +
  `lg:max-w-3xl`; strip social en fila `lg:flex-row lg:flex-wrap`;
  features `lg:gap-6` + `lg:p-8`; CTA final `lg:py-28`. En `/pro`:
  hero `lg:pt-28`, cards `lg:p-10`, grid `lg:gap-6`.

## 2. Flujos públicos

- [x] 2.1 Login: contenido dentro de card en `lg` (borde night-700,
  fondo night-900/60, `lg:px-10 lg:py-12`, sombra suave); heading
  `lg:text-3xl`.
- [x] 2.2 LegalPage `lg:py-16` (medida `max-w-2xl` intacta);
  `/bienvenida` `lg:max-w-xl`; `/checkout/return` `lg:max-w-lg`;
  `/reclamar` card `lg:max-w-md`; `/qr` `lg:max-w-3xl`.

## 3. Cierre

- [x] 3.1 `tsc --noEmit` limpio; sin cambios de i18n; `impeccable
  detect --json` sobre los archivos tocados sin findings nuevos;
  verificación visual 1024px/1440px en preview.
