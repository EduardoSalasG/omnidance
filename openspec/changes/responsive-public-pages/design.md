# Design - responsive-public-pages

## Alcance real (auditado)

Las landings ya tienen base responsive (`sm:` en header, hero
`lg:text-7xl`, features `sm:grid-cols-3`, contenedores `max-w-5xl`).
Las páginas de flujo (login, reclamar, checkout/return, bienvenida) son
correctamente angostas - en desktop el patrón correcto ES una columna
centrada; lo que falta es presentación (card) y aire, no más ancho.

## Decisiones

- **Login card en `lg`**: el contenido (título + selector de método +
  form) se envuelve en un contenedor que solo en `lg` muestra borde,
  fondo `night-900/60`, padding generoso y sombra - móvil intacto.
- **Landing**: hero `lg:pt-32 lg:pb-24`; features `lg:gap-6` + cards
  `lg:p-8`; strip social a fila en `lg:flex-row lg:flex-wrap`; CTA final
  `lg:py-28`. Sin cambios de jerarquía ni de copy.
- **/pro**: hero `lg:pt-28`, cards `lg:p-10`, grid `lg:gap-6`.
- **LegalPage**: `lg:py-16` solamente - `max-w-2xl` se mantiene (medida
  de prosa legal ~70ch es la correcta).
- **bienvenida**: `lg:max-w-xl`; **checkout/return**: `lg:max-w-lg`;
  **reclamar**: `lg:max-w-md` en la card.
- **/qr**: `lg:max-w-3xl` (el escáner/QR aprovecha el ancho).

## Riesgos

- Ninguno estructural: solo clases `lg:` aditivas. El único cambio de
  DOM es un wrapper extra en login (visualmente neutro en `<lg`).
