# Change: product-line-flags

## Why

La operación puede partir solo con academias o solo con nightlife. Si
el primer cliente es academia, mostrar superficies sociales (eventos,
bailes, prácticas) vacías daña la percepción; igual al revés. Dos flags
independientes permiten activar la línea que tenga oferta real.

## What Changes

- Dos flags nuevos en el catálogo `FEATURE_FLAG_SEED`: `social_line`
  (Nightlife: eventos/bailes/prácticas/ciudades/mi-viaje/pase) y
  `academy_line` (Academy: clases/directorio), ambos default ON.
- Gating front: `Tab.flag` nuevo en BottomNav — tabs del bailarín y
  de roles de escena filtrados por flag público; drawer/sidebar ya
  filtraban por `spec.flag`. Lentes: items sociales → `social_line`,
  items academia → `academy_line`.
- Fuera de scope v1: gating de landing marketing y del toggle de lente
  en /inicio (follow-up).
