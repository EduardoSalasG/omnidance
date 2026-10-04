# ux-ia-flows — hub QR, HomeHub por rol, IA de flujos

Reestructura de la arquitectura de información del front por perfil:
unifica las superficies QR, personaliza el home por rol y secciona la
hoja "Más".

## Análisis de flujos (driver del diseño)

| Rol | Flujo crítico | Superficies |
|---|---|---|
| DANCER | descubrir→comprar→asistir→bailar | /eventos→checkout, /qr, /bailes, /entradas |
| STAFF | puerta: check-ins | /staff, /staff/[eventId] |
| PRODUCER | evento→staff→ventas→cobros | /productor, /crm |
| ACADEMY | clases→alumnos→videos→particulares | /academia |
| ADMIN | RBAC, params, payouts | /admin, /crm |

Hallazgos:
1. "Mi QR" y "Escanear" son dos superficies del mismo objeto — el QR
   rotativo sirve para check-in en puerta Y para ser invitado a bailar —
   se unifican en un hub con segmented control.
2. HomeHub duplica el directorio del nav en vez de dar acciones por rol.
3. La hoja "Más" mezcla módulos personales y de gestión sin secciones.

## Alcance

1. **Hub QR** — `/qr` pasa a superficie única con segmented control
   [Mi QR | Escanear]: Mi QR = canvas rotativo (check-in + invitaciones),
   Escanear = cámara para invitar a bailar. `?modo=escanear&event=` deep
   link; última pestaña recordada (localStorage). `/escanear` redirige
   preservando params. Tab central → /qr (label "QR"). Item "Mi QR" sale
   de la hoja Más (ya lo cubre el tab).
2. **HomeHub por rol** — deja de ser directorio: hero de acción primaria
   por rol (STAFF→Puerta, PRODUCER→Crear evento+consola, ACADEMY→Mi
   academia, DANCER→Esta noche: eventos en vivo + CTA QR), luego accesos
   personales y gestión según rol.
3. **Hoja "Más" seccionada** — grupos "Personal" y "Gestión" con headers.
4. **Apple-design aplicado** — segmented control con indicador animado,
   feedback en pointer-down, materiales translúcidos, reduced-motion.

## Fuera de scope

- Cambios de backend o de rutas API.
- Rediseño interno de cada consola (productor/academia/admin/crm).
