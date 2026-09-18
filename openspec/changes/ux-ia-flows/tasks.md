# ux-ia-flows — tareas

## 1. Hub QR unificado

- [x] `MyQr` y `DanceScanner` extraídos a `src/components/qr/`
- [x] `/qr` = hub con segmented control radiogroup (Mi QR | Escanear)
- [x] `?modo=`/`?event=` deep link + localStorage last-mode
- [x] `/escanear` → redirect preservando params
- [x] Tab central → /qr (label "QR"); nav visible en /qr; item "Mi QR" filtrado de la hoja
- [x] bailes scanHref → /qr?modo=escanear&event=…

## 2. HomeHub por rol

- [x] Hero de acción primaria por rol (ADMIN>PRODUCER>ACADEMY>STAFF>DANCER)
- [x] Secciones "Para ti" + "Gestión" (solo módulos no-hero)
- [x] /escanear fuera de tiles (vive en /qr)

## 3. MoreSheet seccionado

- [x] Grupos Personal/Gestión por heurística de href
- [x] Item /qr filtrado (redundante con tab central)

## 4. i18n + Apple-design

- [x] nav.scan → "QR"; nav.personal/management; home.* heroes
- [x] radiogroup APG, indicador transform-only, pointer-down feedback, reduced-motion

## 5. Cierre

- [x] tsc limpio · build verde (28 rutas) · smoke /qr /escanear /inicio 200
- [x] Commits
