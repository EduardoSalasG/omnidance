# Omni-Dance - Documento de Producto y Negocio

> v2 - Consolidado de la conversación de diseño + iteraciones.
> Contexto: **1 dev, one-man company**. Web app / PWA mobile-first.
> Mercado inicial: escena SBK de Santiago, Chile.
> Naming (provisional): **Omnidance Nightlife** y **Omnidance Academy** - los dos productos sobre la misma plataforma.

---

## 1. Visión

Plataforma integral para el ecosistema SBK (salsa, bachata, cubano) que conecta bailarines, academias, productores y locales a través de:

- Validación de actividad real (QR)
- Reputación privada y justa (promedios agregados, nunca evaluaciones individuales)
- Ticketing con comisión todo incluido al productor (precio exacto al asistente)
- Analíticas operativas B2B (SaaS)
- Suscripciones académicas y talleres

**En una frase:** integra aprendizaje y baile social, valida actividad real, construye reputación justa y entrega herramientas profesionales a academias, productores y locales.

### Pilares del ecosistema (mapa completo)

**Decisión de arquitectura de producto:** una sola app, dos superficies - consumidora (PWA bailarín: Social + Mi Aprendizaje) y de gestión (consolas role-gated: productor, staff, local, academia, admin). Mismo backend, misma identidad, mismo QR. Dos líneas de producto con roadmaps separados, no dos apps.

| # | Pilar | Qué es | Estado |
|---|---|---|---|
| 1 | **Nightlife / social** | Eventos, ticketing, sesiones, rankings, gamificación | ✅ Core |
| 2 | **Academias** | Gestión integral (estructura tipo BoxMagic - ver §11) | ✅ Fase 5 |
| 3 | **Instructores** | `person` con rol `instructor`: puede ser dueño de academia, impartir clases EN academias (`academy_instructor`), o independiente (= academia de uno). Clases privadas se venden vía gestión de academia | ✅ Modelado |
| 4 | **Prácticas sociales** | Micro-encuentros modelo Nomadtable - ver §8 | ✅ Modelado |
| 5 | **Congresos/festivales + competencias** | Multi-día con workshops + fiestas (`event_day`, pass por jornada) + competencias con scoring en vivo (ver §8) | ⏸️ Segunda prioridad - pendiente de refinar |
| 6 | **Pareja de práctica** | Matchmaking: "busco follower on2, intermedio, Ñuñoa" | ❌ Feature retirada (modelo eliminado - nunca tuvo UI) |
| 7 | **Capa media** | Fotos (Drive link ya definido), videos de shows, entrevistas | Parcial |
| 8 | **Arriendo de espacios** | Venue ↔ academia para galas/prácticas - `venue_rental` | Parcial |

**Fuera de scope (decisión):** marketplace de zapatos/ropa, transporte, dating - no tocan el moat (data de actividad validada).

---

## 2. Contexto operativo - Santiago

### Escena - Orixas (detalle por evento)

| Evento | Productor | DJ habitual | Frecuencia | Preventa | Puerta | Pagos actuales |
|---|---|---|---|---|---|---|
| Bachatamanía | Carlos Andrés | Matías Herrera | Miércoles (semanal) | $5.000 | $6.000 | Efectivo + transferencia |
| Baila Cubano con Bachata (Jueves Cubano) | Ardilla | DJ Steban | Jueves (semanal) | $5.000 | $7.000 | Efectivo + transferencia |
| La Gozadera | Ardilla | DJ Steban (casi siempre; si no, Ardilla) | 3 viernes/mes | ~$5.000* | ~$7.000* | Efectivo + transferencia |
| Desafío de Tronos | **MuéveteOnTour (academia)** | - | 1 viernes/mes | $6.000 | $8.000 | SumUp + efectivo + transferencia |
| Social con Estilo | Carlos Andrés | Fabián Valladares | 2/mes | $6.000 | $8.000 | Efectivo + transferencia* |
| Ashe | César Moreno (DJ + productor) | César Moreno* | ~1/mes | $6.000 | $8.000 | Efectivo + transferencia |

\* por confirmar

**Multi-rol:** Ardilla y César Moreno son **DJ + productor** simultáneamente → en el modelo, una `person` puede tener varios roles (dancer, dj, producer, staff, academy_owner). No entidades separadas por rol.

**La tabla anterior es la programación completa de Orixas.** Además, academias **arriendan el local** (vie/sáb/dom) para hacer sus **galas** - eventos esporádicos, ~1/mes en total.

**Implicancia de modelo:** las galas son `event` **standalone sin `event_series`**, producidos por una `academy` (rol producer de la academia). El local como "arrendatario de espacio" es otro caso de uso del venue → `venue_rental` o simplemente el evento queda ligado al venue igual.

### Escena - Tierra Dura y Havana

| Local | Eventos | Productor | DJ | Preventa | Puerta | Pagos actuales |
|---|---|---|---|---|---|---|
| Tierra Dura | Mar–Sáb (~5/semana) | Productor propio* | * | $5.000 | $7.000 | Efectivo + transferencia |
| Havana | Sábado y domingo solamente | Productor propio* | DJ Jesús | $5.000 | $7.000 | Efectivo + transferencia |

\* por confirmar

**Pricing especial - Tierra Dura:** martes y miércoles suelen tener **entrada liberada hasta las 23:30**, después **$4.000 en puerta**. Implicancia de modelo: `ticket_tier` soporta **precio por ventana horaria** (gratis hasta X hora → precio Y después). Es además un incentivo de llegada temprana alineado con el Prime Time - el local ya quiere gente temprano consumiendo.

**Estimado total:** Orixas ~15–16 fijos + ~1 gala academia · Tierra Dura ~20–22/mes (mar–sáb; noches de semana probablemente más chicas) · Havana ~8–9/mes → **~45–48 eventos/mes en la escena** (de los cuales ~20–25 son "evento promedio ~200 personas").

**Nota estratégica:** **MuéveteOnTour** (Desafío de Tronos) es academia *y* productor → early adopter ideal tanto para el módulo de academias (fase 5) como para Productor SaaS; además ya usa SumUp → el pitch es *reemplazar* su costo de pasarela, no agregar uno nuevo. Los productores que son también DJ (Ardilla, César) reciben doble exposición en los rankings (productor + DJ).

### Asistencia

- Evento promedio: **~200 personas**
- Evento top (ambiente lleno): **300–350 personas**

### Precios actuales (ponderado por eventos/mes)

- Preventa: $5.000–6.000 → **promedio ponderado ~$5.300**
- Puerta: $6.000–8.000 → **promedio ponderado ~$7.000**
- Mix estimado: ~80% preventa / ~20% puerta

### Situación actual de pagos

- Preventa: transferencia electrónica directa al productor (0% comisión, pero reconciliación manual + fraude de comprobantes falsos)
- Puerta: **~80% efectivo/transferencia (costo $0), ~20% POS SumUp (~3,81% que paga el productor)**

### Baseline productor - evento de 200 personas (HOY)

*Promedios ponderados: preventa ~$5.300, puerta ~$7.000*

| Canal | Tickets | Bruto | Costo pago | Neto productor |
|---|---|---|---|---|
| Preventa transferencia | 160 × $5.300 | $848.000 | $0 | $848.000 |
| Puerta efectivo/transf. | 32 × $7.000 | $224.000 | $0 | $224.000 |
| Puerta SumUp | 8 × $7.000 | $56.000 | ~$2.133 | $53.867 |
| **Total** | 200 | **$1.128.000** | **$2.133** | **$1.125.867** |

### Ritual típico del evento

- Apertura ~22:00 (evento nominal), gente llega ~23:00
- Alternan bloques de 2-3 salsas y 2-3 bachatas
- ~00:30 shows de academias (2-3 shows de 1:30–5 min + narración; eventos grandes hasta 6-7)
- Después: cumpleaños
- Social hasta ~03:45; la mayoría se va ~01:30
- Ventana Prime Time: **23:00–00:00**

---

## 3. Roles del sistema

| Rol | Funciones |
|---|---|
| **Bailarín** | Baila, evalúa, aprende, asiste a eventos, ve su reputación agregada |
| **Productor** | Crea eventos/series, gestiona staff, configura rankings, métricas básicas |
| **Productor Pro (SaaS)** | Analíticas avanzadas (llegada/salida, permanencia, leader/follower, salsa/bachata), comparativas, activaciones, exportes |
| **Local** | Métricas agregadas del local (flujo, permanencia, horas pico), sube su carta (PDF), gestiona reservas de mesa |
| **Local Pro (SaaS)** | Analítica avanzada, correlación eventos ↔ consumo, medición de activaciones |
| **Staff** | Escanea QR de ingreso, registra pagos en puerta; solo eventos asignados |
| **Academia** | Gestión integral (estructura tipo BoxMagic): alumnos, planes/membresías, horarios con cupos, asistencia QR, talleres, videos (pago), clases privadas, eventos propios |
| **Instructor** | `person` con rol instructor - dueño de academia, profe en academias (`academy_instructor`), o independiente (academia de uno) |
| **Soporte** | Incidencias, reprocesos; no toca reglas ni finanzas |
| **Admin** | Control total |

---

## 4. Sesión de baile (core loop) - rediseñado

**Regla: 1 sesión = 1 canción. Se crea solo por QR.**

### Flujo como registro directo

1. Persona A toca **"Escanear"** → cámara
2. Escanea el **QR personal** de B (id público, rotativo)
3. Se crea la sesión **CONFIRMED al instante** - el QR rotativo acredita que ambas personas están en la pista; el escaneo ES la confirmación (timestamp = hora del escaneo → define el género por bloque horario)
4. B recibe notificación "A registró un baile contigo" con foto + nombre - puede verificar en un local oscuro que es la persona frente a ella

No hay ciclo invitación/confirm/rechazo: se eliminó por decisión de producto (menos superficie de abuso - las invitaciones podían enviarse a desconocidos; los bailes solo nacen del escaneo en persona). Las `DanceSession` históricas INVITED/DECLINED se conservan como dato.

**Regla Prime Time:** el **contador** y el **premio/reveal** usan sesiones confirmadas (y evaluadas, para el reveal) - el escaneo ya nace confirmado, así que cuenta de inmediato.

### Bailes sin escanear - eliminados

- La declaración retroactiva (`POST /sessions/declare`) se **eliminó** junto al ciclo de invitaciones: los bailes solo se registran por escaneo QR en pista. Las sesiones históricas INVITED quedan como dato (visibles como expiradas; el inviter aún puede descartarlas).

**Insight clave:** el escaneo no es solo captura de datos, es el *gesto social de bailar* digitalizado - resolver el momento de pedir un baile es el incentivo intrínseco.

**Reglas finas del core loop:**

- **Descartar**: A puede descartar su propia invitación pendiente (declaración errónea) - también silencioso
- **Cooldown ~4 min**: tras una sesión creada entre A→B, no se puede crear otra entre ellos por ~4 min (duración típica de una canción) - evita sesiones duplicadas inmediatas
- **Solo se puntúan sesiones confirmadas** - una sesión expirada/descartada nunca genera rating

**Safety:** el sistema de bloqueo de personas (`user_block`) se eliminó junto al ciclo de invitaciones - su superficie de enforcement desapareció cuando el alta de bailes quedó solo-por-QR en persona.

### Estilo de la sesión

- El productor/DJ define **bloques por horario** ("22:00–23:30 salsa, 23:30–00:00 bachata…")
- La sesión **hereda el género por timestamp** - cero input del usuario
- Corrección manual opcional

### Botones del bailarín en evento

- **Nuevo baile** (escanea)
- **Mi QR** (para ser escaneado - mismo QR que sirve para ingreso)

---

## 5. Evaluaciones - modelo híbrido (decisión nueva)

### Evaluación del baile (privada)

- Puntaje global (obligatorio) + dimensiones opcionales: **Conexión, Comodidad, Musicalidad**
- UI: 4 filas × 5 estrellas
- Nunca se muestran evaluaciones individuales ni quién evaluó a quién
- El bailarín ve solo promedios por estilo + rol

### Ventanas de puntuación (híbrido)

| Ventana | Regla |
|---|---|
| **En vivo (hasta ~00:00 Prime Time)** | Puntuación en vivo normal. El productor y el DJ **anuncian e incentivan** escanear + puntuar hasta las 00:00. Alimenta el reveal de premios. |
| **Diferida (post-midnight)** | Cola de "bailes pendientes de puntuar" que persiste hasta ~24h post-evento (notificación "¿Cómo estuvo tu noche?"). Ratings **editables mientras la ventana esté abierta**, bloqueados al cerrar. Alimenta perfil histórico y post-midnight, no el reveal en vivo. |

**Anti-gaming (escena chica, todos se conocen):**

- Elegibilidad Prime Time: mínimo N sesiones con N parejas **distintas** (ej. 5 sesiones / 4 parejas únicas)
- Cap de influencia por par A→B (votos de pareja repetida pesan menos)
- Solo cuentan sesiones de usuarios con check-in validado
- Ponderación por actividad del evaluador (quien bailó con 10 personas distintas pesa más que quien escaneó 3 veces a amigos)
- Umbral de agregación: no mostrar promedio propio hasta ≥5 evaluaciones recibidas

### Evaluación del evento (privada, sin texto libre)

**Ventana**: se pide al cierre del evento, editable durante las mismas ~24h post-evento que los ratings de baile. Solo asistentes con check-in validado pueden evaluar.

Dimensiones con **atribución separada por actor** - cada dimensión alimenta el ranking de quien es realmente responsable:

| Dimensión | Alimenta ranking de | Por qué |
|---|---|---|
| Música (selección, mezcla, volumen) | **DJ** (y refleja en Productor, que lo contrató) | La calidad musical es del DJ |
| Ocupación / convocatoria | **Productor / Evento** | El lleno depende de la difusión y la marca de la fiesta |
| Organización (fila, ingreso, staff, horarios) | **Productor** | Operación del evento |
| Comodidad del espacio / pista (suelo, área bailable) | **Local** | Infraestructura física |
| Temperatura / ventilación | **Local** | Aire acondicionado no es culpa del productor |
| Iluminación / sonido (infraestructura) | **Local** | Equipamiento del venue |

**Regla de diseño:** un mal aire acondicionado no debe castigar el ranking del productor, y un mal DJ no debe castigar al local. Esto además justifica el SaaS separado por rol (Local Pro ve sus dimensiones, Productor Pro las suyas).

---

## 6. Rankings e incentivos

| Ranking | Regla |
|---|---|
| **Prime Time** | Ventana ~23:00–00:00. Reveal en vivo: Mejor Leader / Mejor Follower del social. **Premio bloqueado hasta alcanzar umbral de sesiones confirmadas, escalado por aforo del evento** (~20% del aforo esperado; configurable por el productor dentro de límites de admin) - la meta colectiva es la mecánica: el DJ anuncia "nos quedan N" y una **pantalla en vivo muestra el contador** en tiempo real. Desbloqueado antes de 00:00 → reveal a las 00:00; desbloqueado después → reveal al alcanzar (gracia ~00:30); sin desbloqueo → no hay premio esa noche |

| **Post–Midnight** | Después de medianoche. No se anuncia en vivo. Impacta perfil histórico. |
| **Públicos** | Rankings separados de **productores, series/fiestas, locales y DJs** - alimentados por las dimensiones atribuidas de las evaluaciones de evento. |
| **Landing de fiesta** | Cada serie muestra leaderboard público de sus bailarines (ver abajo) |

No hay rankings en tiempo real visibles.

### Ranking en el landing de cada fiesta

Cada `event_series` tiene leaderboard público con **tabs**:

| Tab | Fuente | Sensibilidad |
|---|---|---|
| **Asistencia / Rachas** | Check-ins y streaks de la serie | Segura - conducta, no juicio |
| **Temporada** | Top-N por score agregado de la serie (bayesiano, decay 90d) | Muestra solo el **orden**, no los puntajes - como ranking de tenis, no una review |
| **Parejas** | Mejores evaluaciones mutuas históricas de la serie | Premia conexión |

**Regla de privacidad:** las evaluaciones individuales siguen 100% privadas - lo público es la *posición agregada*. Se muestra top-N (ej. 20), no el ranking completo - estar fuera del top no es exposición.

### Mecánica del contador Prime Time

- **Umbral escalado por aforo**: ~20% del aforo esperado del evento (ej. aforo 200 → umbral 40; martes chico de Tierra Dura → ~15). El productor lo ajusta dentro de límites que fija admin - ni tan fácil que se desbloquee siempre, ni imposible en noches chicas
- **Contador en vivo** (websocket): pantalla del local (proyector/TV) y vista en app - "X / N sesiones para desbloquear el premio"
- **Cuenta sesiones confirmadas**, no evaluadas: feedback inmediato al escanear/confirmar - si midiera solo evaluadas, el número no subiría al bailar y la mecánica pierde fuelle
- **Guion del DJ:** 23:00 "faltan 40" → updates cada ~15 min → "¡premio desbloqueado!" (peak de energía) → 00:00 reveal
- **Hora feliz:** el productor/DJ activa una ventana (~30 min) donde las sesiones **cuentan doble** para el contador - palanca para reanimar un momento muerto de la noche. Es el botón de "activación" más concreto que se vende en el SaaS
- Reveal usa solo sesiones confirmadas **y evaluadas** antes del reveal

### Scoring (diseño)

- **Promedio bayesiano por estilo+rol**: `score = (Σvotos + C·m)/(n + C)`, C≈10, m = media global. Evita que 2 votos de 5★ superen a un veterano con 200 votos de 4,6★
- **Decay temporal**: ventana ~90 días o peso exponencial → refleja forma actual
- **Umbral de muestra**: mínimo de evaluaciones para aparecer en rankings públicos (k-anonymity en escena de ~200 personas)

---

## 7. Gamificación

**Regla de diseño:** gamificar **conductas** (escanear, llegar temprano, bailar diverso, puntuar, invitar novatos) - **nunca el puntaje en sí**. "Mejor Leader" es el único ranking competitivo; todo lo demás es progreso personal o meta colectiva. Si gamificamos el puntaje, la gente baila solo con "los buenos" y el social se elitiza - lo opuesto al espíritu SBK.

**Regla de los ~5 segundos:** la gamificación vive en los **márgenes del ritual** (mesa, antes del evento, al día siguiente). Si una mecánica exige mirar el teléfono más de ~5s en pista, está mal diseñada - compite con bailar.

### Loop de la noche

- **Score final de la noche** (card compartible): bailes, parejas únicas, estilos, horas en pista. **Se desbloquea solo al cerrar los ratings pendientes** → puntuar deja de ser chore y pasa a ser parte del loop
- **Streaks** - la escena ya es ritual semanal; el streak solo lo hace explícito (loss aversion = retención barata). Familia completa:

| Streak | Ejemplo | Tipo |
|---|---|---|
| Por serie/evento | "12 Gozaderas seguidas" | Asistencia |
| Por productor | "8 eventos de Ardilla seguidos" | Lealtad al productor |
| Por venue | "10 semanas seguidas en Orixas" | Lealtad al local - data que vende el Local Pro |
| Salidas semanales | "Saliste 8 semanas seguidas" (cualquier evento) | Ritual de vida |
| Salidas mensuales | "No faltaste ningún mes del año" | Largo plazo |
| Con un amigo | "10 eventos seguidos con tu parcero" | Vínculo social |
| Por estilo | "Bailaste bachata 10 semanas seguidas" | Dedicación al género |
| Clases (academia) | "15 clases seguidas sin faltar" | Alimenta el score de fidelidad - tie directo con fase 5 |
| Contribución | "Cerraste tus ratings 10 noches seguidas" | Alimenta el sistema |

Cada streak le vende data a un actor distinto (venue, productor, academia) - es gamificación que produce exactamente las métricas del SaaS.

### Puntos y progresión

- **Puntos de temporada** - única moneda, **no gastable**: se acumulan por conductas (sesiones, misiones cumplidas, ratings cerrados, check-in temprano), alimentan la posición en el leaderboard de temporada y **resetean cada temporada**. No gastable = no es economía ni juicio, es solo progreso
- **Progreso visible**: "te faltan 3 bailes para Mariposa social" - efecto Zeigarnik: el progreso incompleto jala de vuelta. Cada misión/badge muestra su barra
- **Nivel de comunidad**: por **contribución** (sesiones registradas, ratings cerrados, novatos traídos, asistencia) - NO por habilidad de baile. "Veterano de la escena" se gana sirviéndola

### Premios del reveal

- **Prime Time (Leader/Follower):** entrada gratis a la próxima edición (costo $0 para el productor, garantiza retorno) + **corona 👑 en el QR por 1 semana** - el ganador la muestra justo en el momento del escaneo; el status vive en el ritual, no escondido en el perfil
- **"Pareja de la noche"** (segundo premio): la pareja mejor evaluada *mutuamente* (ambos se puntuaron alto). Premia la conexión, no la técnica individual; no se puede farmear solo; nivela leader/follower

### Misiones (sistema de quests)

Misión = **condición verificable por data + recompensa**. El productor elige de una **biblioteca de templates** (no creación libre en v1 - control de calidad y simplicidad). Máx. 2-3 activas por evento.

**Templates para productor** (cada una ataca un dolor real del social):

| Misión | Condición verificable | Dolor que ataca | Recompensa típica |
|---|---|---|---|
| Madrugador | Check-in antes de 23:00 | Todos llegan tarde | Entrada a sorteo / cortesía del local |
| Baila diverso | N sesiones con N parejas **distintas** | Bailar siempre con los mismos | Badge / puntos de temporada |
| Primera vez contigo | Sesión con alguien con quien nunca bailaste (sin sesiones previas) | Cliques cerrados | Badge / sorteo |
| Invitación follower | Una follower **registra** el baile (escanea ella) | Norma "el leader pide" desequilibra la pista | Badge / puntos |
| Explorador de estilos | Sesiones en salsa Y bachata en la misma noche | Gente que solo baila un género | Badge |
| Resistente | Sesiones confirmadas post-02:00 | Éxodo masivo ~01:30 | Sorteo / puntos |
| Cierra tu noche | Todas las evaluaciones pendientes completadas | Ratings sin cerrar | Desbloquea score final |

**Templates de plataforma** (automáticas, sin configuración):

- Semanal: "asiste a 2 eventos esta semana"
- "Invita a alguien con badge 'primera vez'" (novato)
- "Padrino": tu invitado por gift ticket asiste a su 3er evento
- Academia (fase 5): "baila con 3 compañeros de tu academia"

**Recompensas posibles:** badge, entrada a sorteo, descuento próxima entrada, cortesía del local (la paga el venue - incentiva su consumo), puntos de temporada. Todas usan las mismas reglas anti-gaming (parejas únicas, check-in validado).

**Tie B2B:** las misiones son el producto "activaciones e incentivos" del Productor Pro. Free: 1 misión default (Madrugador). Pro: elección de templates + métricas de cumplimiento (qué % llegó antes de 23:00, etc.) → la misión ES el SaaS.

### Competencia social segura

- **Retos entre amigos**: los usuarios crean misiones para sus amigos ("te reto a bailar 10 bachatas esta noche") - misiones user-generated = contenido infinito sin crearlo nosotros
- **Leaderboard privado con amigos**: "quién bailó más esta semana de tu crew" - competencia sin exposición pública
- **Devuelve el baile**: X te invitó y no le has devuelto → ping de reciprocidad (el ritual social real funciona así)

### Novatos y padrinos

- Badge opt-in **"primera vez"** en el QR/perfil - visible al ser escaneado → otros reciben misión "invita a alguien nuevo"
- La primera vez en un social es el mayor punto de abandono de la escena entera; gamificar la bienvenida es gamificar la supervivencia de la escena
- **Padrino:** invitaste/regalaste ticket a alguien que llega a su 3er evento → badge

### Equipos

- **Contador por academia** en el evento: "¿qué academia bailó más esta noche?" - las galas ya son rivalidad implícita; el contador la hace visible toda la noche. Las academias se convierten en canal de adquisición, no solo cliente B2B

### Badges y pasaporte

Los badges son la **moneda universal** del sistema: premian misiones, marcan status y dan colección - todo sin juicio ni ranking (regla de oro: badge por conducta, nunca por puntaje).

**Categorías:**

| Categoría | Ejemplos | Naturaleza |
|---|---|---|
| **Pasaporte** | Bailaste en Orixas / Tierra Dura / Havana / los 3; en cada serie | Colección, permanente |
| **Hitos** | 1ª sesión, 100 / 500 / 1.000 bailes, 1 año en la app | Acumulativo, permanente |
| **Conducta** | Madrugador (check-in <23:00), Último en pista (>03:00), Maratonista (15+ bailes una noche), Mariposa social (8+ parejas distintas una noche) | Por noche, repetible |
| **Roles y estilos** | Bailaste casino / sensual / dominicana; Switch (leader Y follower misma noche) | Colección |
| **Sociales** | Bailaste con un DJ, con un artista de show, **con el ganador del Prime Time** (post-reveal), con alguien de otra academia | Proximidad - celebras haber bailado con ellos, no ser ellos |
| **Eventos especiales** | Estuviste en el 1er Prime Time de la historia (OG), gala, aniversario de serie | **Escasos** - solo existen una vez; son los más valiosos |
| **Novato/padrino** | "Primera vez" (opt-in, auto-expira tras N eventos), Padrino (tu invitado llega a 3 eventos) | Temporales / logro |
| **Contribución** | Evaluador consistente (cierras ratings siempre), Historiador (50+ sesiones registradas) | Premian lo que alimenta el sistema |
| **Status temporal** | Corona 👑 Prime Time (1 semana), racha activa | **Expiran** - hay que defenderlos |

**Reglas de exhibición:**

- **Perfil**: colección completa
- **Al ser escaneado**: 1 **badge destacado** que el bailarín elige (o el status activo: corona, "primera vez") - el status vive en el momento del ritual
- **Feed**: los desbloqueos de amigos son contenido off-night

**Rareza:** comunes (conducta, repetibles) vs. escasos (OG, aniversarios - existen una sola vez en la historia). La escasez real es lo que da valor sin necesidad de rankings.

**Interacción con misiones:** los badges pueden ser recompensa Y requisito - "con el sello de los 3 locales desbloqueas la misión Embajador".

### Recompensa variable

- **Escaneo dorado**: aleatoriamente, un escaneo de sesión dispara sorpresa - "¡dorado! ambos entran al sorteo". Refuerzo de ratio variable sobre el hábito central: escanear
- **Ruleta de cierre de noche**: al cerrar todos tus ratings pendientes, giras la ruleta (puntos, badge, entrada a sorteo mayor) - puntuar como slot machine benigna

### Retención y retorno

- **SBK Wrapped anual**: "tu año en la escena" - bailes, parejas, locales, tu noche más larga. Todos lo comparten = marketing masivo gratis
- **Win-back**: "llevas 3 semanas sin salir" → misión de regreso con recompensa boosteada
- **Streak freeze**: 1 congelada por mes - la racha no muere por viaje/enfermedad
- **Quest chain de onboarding**: primera semana = checklist (perfil completo, primer check-in, primera sesión, primer rating) - guía sin tutorial aburrido

### Off-night (la app no puede morir de lunes a jueves)

- **Feed social**: "X confirmó que va a Gozadera", "Y desbloqueó sello", actividad de amigos - razón de apertura sin evento
- **Temporada**: leaderboard por estilo+rol con el decay ya diseñado; fin de temporada = reveal mayor (campeonato)
- Streaks y posición de temporada visibles en el perfil

### Gamificación B2B (bonus)

- Productor/local: milestones propios - "sold out", "100% preventa", "60% llegada antes de 00:00", "evento mejor evaluado del mes" - retención del lado que paga

## 8. Módulo Social del bailarín

- **Calendario** de próximos eventos (global, por serie, por productor)
- **RSVP** ("voy") y ver qué **amigos van**
- **Amistades** entre bailarines; historial de sesiones con cada amigo
- **Check-in**: "Ya llegué" (manual) o automático vía escaneo de ticket → notificación suave a amigos que también asistirán
- **"Me fui"** → marca salida; cierre automático al término del evento
- **Comprar entradas** (preventa) y **regalar entradas a amigos** ← *feature nuevo; cada regalo es un invite que instala la app*
- **Reservar mesa**: al comprar la entrada (opción en el checkout) o después desde el evento. Se guarda: nombre del solicitante + cantidad de personas. Estado: solicitada → confirmada/cancelada por el productor/venue
- **Sugerir canción**: en el checkout de preventa, campo opcional "¿qué canción quieres escuchar?" → `song_suggestion` agregada para el DJ/productor. Gancho de gamificación: **"la canción más pedida suena a las X"** - otro momento de reveal en la noche
- **Ver si tus amigos que van tienen mesa reservada** - ayuda a organizar el punto de encuentro de la noche
- **Carta del local**: el venue sube su carta (usualmente PDF) → visible en la página del evento y del local. v1 = PDF; el tracking de vistas durante el evento es métrica de engagement para el Local Pro
- **Progreso de la noche**: barra temporal, cantidad de bailes, proporción salsa/bachata
- Perfil con reputación agregada por estilo + rol (nunca votos individuales)

### Features de nightlife (benchmark Tablelist/Discotech)

**Guest list + capacidad + waitlist**

- **Guest list self-service**: inscripción desde el landing del evento → genera `entry_pass` tipo "list" (gratis o precio reducido hasta cierta hora). Generaliza la "entrada liberada hasta 23:30" de Tierra Dura
- **Capacidad por evento**: aforo del local, cap de preventa y de puerta, estado "agotado", **waitlist** que libera cupos si alguien no llega/cancela

**Fotos del evento (v1 liviana)**

- La página del evento linkea al **Google Drive del fotógrafo** (se abre en navegador in-app). No hosteamos fotos - el fotógrafo ya sube todo a Drive; nosotros solo somos la puerta. Captura el tráfico off-night de "buscar mi foto"

**Cumpleaños (está en el ritual: post-shows ~01:00)**

- El productor marca **cumpleañeros de la noche** en el lineup
- El cumpleañero tiene una **lista de invitados con precio especial** (hoy: preventa a $4.000 para sus invitados vs $5-6k normal) → cada invitado compra su entrada al precio cumpleañero, validado por la lista
- El productor recibe **la lista de invitados de la noche consolidada** - dato que hoy maneja a mano por WhatsApp
- Futuro: paquetes (mesa+torta+shoutout) - fuera de v1

**NO entra (competencia con Fudo):** paquetes de mesa con consumo mínimo, vaquita/split payment, pedidos desde la carta - Orixas ya usa **Fudo** para mesas/consumo. No competir con el POS del local; nuestra mesa es solo reserva/registro.

**Pase mensual de serie**

- Suscripción-ticket: "todos los miércoles de Bachatamanía del mes por $X" - primer revenue recurrente B2C (distinto de academias). Genera `entry_pass` válido para toda la serie del mes

**Lineup del evento**

- La página del evento muestra el programa de la noche: DJ + horarios de sets (`schedule_block`), shows de academias ~00:30 (`show`), cumpleañeros - ya están las entidades, es solo la vista

### Prácticas sociales (modelo Nomadtable)

Micro-encuentros de baile **creados por cualquier bailarín** - no requieren academia ni productor. Llenan el vacío entre-semana (la app vive de noche; las prácticas son de día/parque).

- **Crear práctica**: título, lugar (parque/plaza/venue/academia), hora, género/estilo foco, aforo chico (~8-15), gratis, first-come
- **Host** = el creador: fija tono, recibe gente, trae parlante. Check-in igual por QR
- **"Disponible para bailar"**: *feature retirada* (el toggle de disponibilidad y las solicitudes de pareja se eliminaron - nunca tuvieron UI)
- **Coordinación**: chat ligero por práctica (v1: comentarios del evento o link a WhatsApp; chat real es scope pesado)
- **Venues como hosts de prácticas**: Tierra Dura está muerto de día → prácticas de tarde = tráfico + consumo (métrica Local Pro). Academias igual
- **Safety**: perfiles verificados, reportar, opción "práctica solo mujeres" - crítico en parques con desconocidos
- **Gamificación**: badge "organizador de prácticas", misión "organiza una práctica", prácticas cuentan como actividad (check-in ligero, sin sesiones Prime Time)
- **Futuro (premium bailarín)**: boost de perfil, ver quién vio tu perfil - mapea al tier premium tipo Nomadtable Plus

### Congresos y competencias (segunda prioridad - pendiente de refinar)

**Congresos/festivales**: `event` multi-día → `event_day` por jornada, pass por día o full-pass, workshops + fiestas en el mismo evento. Ya modelado como gap conocido.

**Competencias** - benchmark: plataformas tipo echecksystem / DanceScore / DanceSync. Lo que ofrecen y mapea a nuestro ecosistema:

- **Landing de la competencia**: página propia con categorías, reglas, precios
- **Registro de participantes**: por categoría (pareja/solista/grupo), con pago de inscripción
- **Horario en vivo (running order)**: orden de salida por categoría, actualizado en tiempo real - el público y los participantes lo siguen en la app
- **Participantes y categorías visibles**: quién compite en qué
- **Scoring de jueces**: jueces puntuando en tablet/móvil, rúbricas por categoría, resultados calculados en tiempo real
- **Puntajes y ganadores en vivo**: publicación de resultados al cerrar cada categoría
- **Streaming**: embebido externo (YouTube Live) - nunca self-host

**Lo que ya transferimos gratis**: QR check-in (participantes, staff, público), ticketing, lineup, rankings, venue. Lo nuevo que requiere: `competition` (categorías, heats, participantes/parejas), `judge` + `score` (rúbricas por categoría), `running_order` en vivo, resultados públicos.

**Por qué segunda prioridad**: comprador distinto (organizador de congreso, no productor semanal), frecuencia baja (pocos al año vs ~45 sociales/mes) aunque ticket alto, y operación más pesada. Pero es el mismo stack - cuando el core funcione, es expansión natural. Refinar cuando nightlife esté validado.

### Jornada del bailarín en el evento (happy path)

1. Compra preventa → QR activo
2. Llega → staff escanea → check-in automático + "Ya llegué" + notificación a amigos
3. En pista: escanea el QR de su pareja para registrar el baile
4. Puntúa en vivo hasta ~00:00 (empujado por DJ/productor) o deja pendientes
5. **00:00 - reveal Prime Time** (anuncio del DJ + notificación/pantalla en app)
6. Sigue la noche; ratings diferidos post-midnight
7. "Me fui" o cierre automático al término
8. Al día siguiente: notificación con resumen de la noche + bailes pendientes de puntuar (editable hasta que cierre la ventana de 24h)

## 9. Módulo Aprendizaje del bailarín

- Academias a las que pertenece; estado (presencial / online / pausado)
- Historial de clases y talleres
- Videos (si la academia sube y el alumno paga): solo clases asistidas, sin descarga ni share
- Score interno de academia visible en versión suave (etiquetas)
- Progreso personal no competitivo
- `/clases` prioriza las academias del alumno: lista y calendario muestran solo clases de academias con inscripción vigente (`activa`/`trial`/`online`); la vista **Explorar** muestra todas las academias
- **Reservar exige inscripción vigente** en la academia de la clase (sin ella el CTA es "requiere inscripción" y el API responde 403) - la academia inscribe al alumno, no hay auto-inscripción

---

## 10. Ticketing y modelo de comisiones (rediseñado oct-2026)

### Modelo de precio - comisión "todo incluido" al productor

**El comprador paga exactamente el precio de lista** - no hay cargo por servicio al asistente. La plataforma monetiza cobrando al **productor** un % todo incluido sobre la venta, descontado en la liquidación.

| Tier comercial | % todo incluido | Uso |
|---|---|---|
| **Precio de lista** | **10%** | Default de `platformFeePct` - conversación inicial |
| **Promo de cierre** | **8%** | Override por productor (`ProducerParams.platformFeePct`) - "oferta" para convencerlo; es el objetivo económico real |

**Desglose del % todo incluido** (ej. 10% sobre $6.000 → deducción $600):

| Línea de liquidación | % sobre venta | CLP | Destino |
|---|---|---|---|
| `GATEWAY_FEE_PASSTHROUGH` | ~3,19% (real por medio) | $191 | Pasarela, al costo |
| `PLATFORM_FEE_NET` | ~5,72% | $344 | Ingreso omni-dance |
| `PLATFORM_FEE_IVA` | ~1,09% | $65 | IVA 19% sobre nuestro fee - facturado al productor |
| **Total** | **10%** | **$600** | |

Con promo 8%: neto omni ~4,05% ($243/ticket), productor recibe $5.520. El neto omni por ticket queda **en torno a los ~$300 históricos** del flat $500 - el cambio es de estructura, no de nivel de ingreso.

**Un solo parámetro deriva todos los modos de cobro:**

| Modo de cobro | Tasa | Detalle |
|---|---|---|
| **Gestionada** (nuestra pasarela) | `platformFeePct` (10% / promo 8%) | Recaudamos nosotros → payout |
| **Métodos propios** (transferencia/link/comprobante) | `platformFeePct − gateway card pct` → **6,81% / 4,81%** | Mismo all-in menos la pasarela que no usamos; la promo baja sola. El fee se **devenga y se netea** contra payouts gestionados (o se factura mensual). Flujo: el comprador elige el método en checkout → orden queda PENDING con instrucciones → sube comprobante → el productor lo valida en `/productor/comprobantes` (aprobar = misma liquidación que un webhook de pasarela; rechazar exige motivo y permite re-intento) |
| **Pasarela propia** (su cuenta Flow/MP) | mismo derivado que métodos propios | Credenciales cifradas del productor; la plata va directo a él; fee devengado igual |
| **Efectivo en puerta** (staff registra) | **0%** | Es validación/QR + data, no procesamos plata |
| **Entrada liberada** ($0) | **0%** | Nada que cobrar |

Justificación: la diferencia gestionada↔propia es exactamente el costo de pasarela que evitamos - "con nosotros no pagas el 3,19% de Flow aparte, está dentro del 10%". Más honesto y más vendible que un surcharge arbitrario.

### Estudio de mercado (oct-2026) - por qué 8-10% es defendible

| Plataforma | Fee | Quién paga |
|---|---|---|
| PortalTickets (Chile) | 10% IVA incl. todo incluido | Organizador o comprador, a elección |
| Ticketeras grandes Chile (Puntoticket…) | 10–20% | Comprador |
| **Passline (AR/CL) — techo** | hasta ~15% (no publica, va en acuerdo) | Según acuerdo |
| Shotgun (EU electrónica) | ~15% cap €15/$30 | Comprador |
| DICE (EU) | ~10–12% | Comprador |
| Resident Advisor | ~9,5% + processing | Comprador |
| Eventbrite | ~8% Essentials / ~11% Pro | Comprador |
| Sway | 3% + €0,30 | Comprador |

El mercado cobra al **comprador** 8–15%+. Cobrar al **productor** es contracultural pero es nuestro USP: *"publicas tu precio, el asistente paga exactamente eso"*. Y 8–10% todo incluido compite contra el 10–20% chileno sin regalar el producto - el diferencial real es la plataforma completa (check-in, CRM, analítica, academias), no el precio.

**Passline es el techo explícito**: ~15% comisión sola, sin SaaS encima, liquidando 7 días hábiles post-evento (mata el cashflow de preventa). Nosotros cobramos **además** SaaS (tiers de academia + Producer Pro) → la comisión de ticketing debe quedar claramente bajo ese techo para que el take total del ecosistema no se compare con una ticketera pura: **8–10% todo incluido vs 15% + payout diferido de Passline** es la conversación ganadora, y el 10% deja margen de negociación hasta el 8% objetivo.

### Trazabilidad BIAN - auditoría a nivel banco

Cada peso debe rastrear a su origen, con la misma disciplina que el ledger bancario:

- **Descomposición congelada por pago**: `Payment` persiste `feeMode` (MANAGED/OWN_METHOD/OWN_GATEWAY/FREE), `platformFeeRate` (snapshot de la tasa aplicada - un cambio de param nunca recalcula órdenes viejas), `platformFeeNetClp`, `platformFeeVatClp`, `gatewayFeeExpected`, `producerNetClp`, `currency` (ISO 4217 - Europa).
- **`PayoutLine` como tabla real**: cada deducción es una fila tipada (`PLATFORM_FEE_NET`, `PLATFORM_FEE_IVA`, `GATEWAY_FEE_PASSTHROUGH`, `OWN_METHOD_FEE_NET/VAT`, `MANUAL_ADJUSTMENT`) enlazada a la orden que la generó - el neto del payout es auditable peso a peso. Las ventas por métodos propios generan líneas `OWN_METHOD_*` que se **netean** en el payout del período.
- **Ledger hash-chain** (ya existe): nuevos eventos `FEE_ASSESSED` (al crear la orden - congela la tasa en la cadena) y `PAYOUT_LINE_ASSIGNED` (al liquidar). `AMOUNT_MISMATCH` reconcilia fee esperado vs reportado por la pasarela.
- **Reglas**: montos Int en unidad menor, nada se actualiza post-PAID (solo append), `GatewayTransaction` append-only sanitizado de cada llamada a la pasarela.
- **`BillingDocument` (implementado, spec admin-billing-documents)**: nota de cobro **interna** por las deducciones de cada liquidación (folio correlativo atómico, snapshot RUT/nombre del receptor desde `FiscalProfile`, líneas agregadas por tipo de cargo, neto/IVA/total, PDF en storage privado). Emisión idempotente por `payoutId`; VOID conserva el PDF como evidencia. **No es DTE tributario** (sin CAF/SII) - el documento formal al productor por nuestro fee sigue siendo deuda para cuando exista facturación electrónica.

### Arquitectura de pasarelas - puertos, no acoplamiento

Flow, MercadoPago y Fintoc son **adaptadores detrás de un puerto normalizado**, no dependencias del dominio - preparado para más países (incl. Europa):

- **Órdenes**: `PaymentGateway.createOrder/verifyWebhook/refreshStatus` → `GatewayConfirmation` normalizado (`status/amount/feeClp/media/paidAt/raw`) - el dominio nunca parsea campos de proveedor. Webhook por proveedor `/payments/webhook/:provider`.
- **Suscripciones**: puerto `SubscriptionProvider` con tipos normalizados (los `Flow*` salen del contrato); Flow hoy, MP preapproval/Stripe como slots.
- **Credenciales por actor**: `ProducerGatewayAccount` cifrado (AES-256-GCM, `PRODUCER_GATEWAY_KEY`) — implementado (spec producer-gateway-accounts): el productor configura su cuenta Flow/MP desde `/productor/parametros`, el checkout cobra por su adaptador (`OWN_GATEWAY`), el webhook se enruta por `?account=<id>` y la comisión se netea en su payout.
- **Moneda**: `Payment.currency` + `Event.currency` (ISO 4217, default CLP).

**Política: sin reembolsos.** Los tickets son **transferibles a otro usuario** (mismo mecanismo que gift ticket). Reembolso excepcional solo manual, a pedido del productor.

**Fiscal:** omni-dance emite **nota de cobro interna al productor por su comisión** (neto + IVA, `BillingDocument` por liquidación - documento interno, no DTE); el productor emite por el precio de lista (split en la liquidación).

### Unit economics por evento (200 personas, preventa migrada a la app)

Neto omni por ticket gestionado = `(all-in% − pasarela%) / 1,19` del precio:

| Tasa | Preventa $5.300 | Puerta app $7.000 | Neto/evento (160 + 8) |
|---|---|---|---|
| **10% lista** | $303 (5,72%) | $401 | **~$51.700** |
| **8% promo** | $214 (4,04%) | $283 | **~$36.500** |

Puerta cash registrada (32) y entrada liberada: **$0** — el valor es la data de asistencia. Rango real: **$36–52k/evento** según mezcla de tasas negociadas - equivalente al flat histórico pero con upside en preventas más caras y trazabilidad limpia.

**Sensibilidad:** si solo 50% de la preventa migra a la app → ~$18–26k/evento. La mitigación: la preventa oficial del productor es solo por la app - la transferencia muere sola cuando el ticket-QR con check-in es el único camino.

### Métricas startup - GMV, take rate, MRR, ARR

Lo que se mide cada mes (el `PayoutLine` + `Payment.platformFee*` dejan todo queryable):

| Métrica | Definición | Para qué |
|---|---|---|
| **GMV** | Bruto vendido por nuestros rails (tickets + planes gestionados) | Volumen real del marketplace |
| **Net revenue** | `PLATFORM_FEE_NET` + `OWN_METHOD_FEE_NET` + SaaS cobrado | Ingreso nuestro post-pasarela, pre-IVA |
| **Take rate efectivo** | Net revenue ticketing / GMV tickets | Debe moverse en 4–5,7% según mix de tasas |
| **MRR** | SaaS recurrente del mes (academias + Producer Pro) | La base estable, separada del transactional |
| **ARR run-rate** | MRR × 12 (+ transactional anualizado si se quiere "revenue run-rate") | El número de conversación con inversores |
| **NRR / churn / LTV / CAC** | Retención neta por actor, bajas, valor de vida, costo de adquisición | Salud del modelo SaaS - medir desde el día 1 |

### Proyecciones por escenario (CLP/mes → ARR)

Supuestos: ticket ponderado ~$5.5k gestionado a tasa media 9% (~5% neto tras pasarela e IVA); mezcla SaaS academia promedio ~$90k/mes; Producer Pro promedio ~$140k/mes.

| Escenario | Eventos/mes | Neto ticketing | Acad. SaaS (MRR) | Producer Pro (MRR) | Total/mes | ARR run-rate |
|---|---|---|---|---|---|---|
| **Piloto** (1 productor + 2 academias) | 5 | ~$0,23M | ~$0,1M | ~$0,1M | **~$0,43M** | **~$5,2M** |
| **Tracción** (3 productores + 8 academias) | 15 | ~$0,69M | ~$0,72M | ~$0,55M | **~$1,96M** | **~$23,5M** |
| **Captura escena** (20–25 eventos + 15 academias) | 22 | ~$1,01M | ~$1,35M | ~$1,12M | **~$3,48M** | **~$42M** |

Lecturas:
- **El SaaS pesa más que el ticketing** desde tracción — es la tesis de margen: comisión valida volumen, suscripción sostiene MRR. La comisión no puede acercarse al techo Passline porque el take total (fee + SaaS) ya es mayor.
- A captura total de escena (~20–25 eventos/mes, ~15 academias): **~$42M ARR** sin contar venue-pro, marketplace de instructores ni otros países — la expansión multi-país/multi-gateway del rediseño de puertos es el siguiente multiplicador.
- Sensibilidad a la tasa: cada punto de % gestionado ≈ ±$7k/evento neto → la negociación 10→8% cuesta ~$15k/evento de neto vs lista.

### Comparativa de pasarelas (investigación sep-2026)

| Pasarela | Comisión | Fijo | Efectivo en $5.500 | Veredicto |
|---|---|---|---|---|
| **Flow** | 2,89% +IVA (T+3) / 3,19% (T+1) | $0 | ~$190–210 | **MVP**: una integración → Webpay + transferencia + MACH + Servipag |
| **Webpay Plus** | Débito 1,49% / Crédito 2,29% +IVA | mín. ~$87–135 | ~$98–150 | **Escala**: migrar tarjetas aquí cuando el volumen lo justifique. Mall = split payments; Oneclick = mensualidades |
| **Mercado Pago** | Link ~3,19% / QR ~2,6% +IVA | $0 | ~$170–215 | Abono inmediato, sin inicio de actividades. Sinergia: producers ya usan MP Point |
| **Khipu** | 0,69% +IVA | **UF 0,0105 (~$410)** | ~$520 | Fee fijo mata tickets chicos. Útil para montos grandes (mensualidades, liquidaciones) |
| **SumUp** | Link: 3,2% +IVA (3,81%) | $0 | ~$210 | Link no mejora a Flow. Su fuerza es POS físico (débito desde 1,29%+IVA) - los productores ya lo usan en puerta; integrarlo como "venta externa registrada", no como pasarela |

### Consolidaciones y liquidaciones (todos los perfiles)

Omni-dance (empresa de software propia) recauda y liquida por **transferencia semanal/post-evento** - sin marketplace-split técnico en v1, calza con cómo ya operan. Todo rol que recibe dinero debe tener `fiscal_profile` (RUT, razón social, empresa/persona, giro).

| Perfil | Qué recauda omni por ellos | Liquidación |
|---|---|---|
| **Productor** | Precio de lista de tickets (preventa + puerta app), pases mensuales, inscripciones | `payout` por evento o semanal: **bruto − % todo incluido** (`platformFeePct`, default 10 / promo 8; líneas `PLATFORM_FEE_NET` + `PLATFORM_FEE_IVA` + `GATEWAY_FEE_PASSTHROUGH` al costo) − fee devengado por métodos propios neteado → transferencia + comprobante |
| **Academia** | Mensualidades, packs, talleres, clases privadas, trial pagos | `payout` mensual/semanal consolidado: **bruto − tarifa Flow** (`GATEWAY_FEE_PASSTHROUGH`, ~3,19%); **sin comisión ni cargo al comprador** - la academia monetiza vía suscripción SaaS (ver abajo) |
| **Instructor** | Clases privadas (vía academia - liquida a través de la academia, que cobra su comisión) | Dentro del payout de la academia, desglosado |
| **Venue** | Futuro: arriendos (`venue_rental`), cortesías cobradas | `payout` cuando aplique |
| **omni-dance** | Comisiones todo incluido (neto+IVA de productor, fee propio de métodos), suscripciones SaaS, futuro premium bailarín | Es nuestra plata - no se liquida, se factura |

**Flujo fiscal**: omni-dance emite **nota de cobro interna al actor por su comisión** (neto + IVA; `BillingDocument` por liquidación - documento interno, la trazabilidad de cada línea queda en `PayoutLine`) y cobra el SaaS; cada actor emite por **su precio de lista** (el dinero que recaudamos en su nombre). El desglose queda en el `payout` - el actor ve exactamente qué facturar.

**Estados del `payout`**: `pending → approved → paid` con evidencia de transferencia; todo auditado. La operación completa vive en **`/admin/finanzas`** (consola de finanzas, spec `admin-finance-console`): KPIs del período (GMV segmentado social/academia/SaaS, ingreso plataforma neto+IVA, costo pasarela, por transferir), tabs de Liquidaciones (líneas expandibles, aprobar, marcar pagada con comprobante), Por liberar (devengado no liquidado por actor - incluye lo que los actores **nos deben** por métodos propios, que se netea), Pagos (desglose congelado por orden) y SaaS (MRR/ARR, funnel de suscripciones).

### Modelo SaaS - suscripción de academia y Producer Pro (implementado oct-2026)

El cargo por venta desaparece para la academia: pasa a **suscripción mensual por tier de alumnos activos** (spec `academy-billing`, precios en `PlatformParam` - `academy_tier.*`, ajustables desde `/admin` sin deploy; referencia de mercado: BoxMagic).

| Tier | Alumnos activos | Mensual | Semestral (−2%) | Anual (−4%) |
|---|---|---|---|---|
| STARTER | ≤50 | $49.990 | $48.990 | $47.990 |
| PRO | ≤150 | $99.990 | $97.990 | $95.990 |
| STUDIO | ≤400 | $189.990 | $185.990 | $181.990 |
| ENTERPRISE | ilimitado | contratación manual | - | - |

- El precio apunta al **~8–9% de la facturación típica** de cada banda (ticket mensual $25–35k/alumno); al tope del tier el % efectivo cae → descuento por volumen implícito.
- Cobro: suscripción recurrente Flow (`PlatformSubscription`, mismo motor que membresías de alumnos). Trial 30d; al superar el límite del tier el sistema exige subir en la próxima compra (`tier_limit` 400).
- **Mora**: renovación fallida → 5 días de gracia → día 6 bloqueo (`billingBlockedAt`): consola read-only, academia y clases fuera de explorar, sin reservas ni compras nuevas - **el alumno conserva todo su historial**. Un pago recuperado desbloquea solo (`RENEWAL_SETTLED`).
- Los productos de la academia **no cobran cargo de servicio al alumno**; la academia absorbe la tarifa Flow como línea `GATEWAY_FEE_PASSTHROUGH` explícita en su payout.

**Productor**: su monetización core es la **comisión todo incluido por venta** (`platformFeePct`, default 10% / promo 8% - ver "Modelo de precio" arriba) **+ Producer Pro opcional** - suscripción por tier de facturación mensual media (90d): `PRO_STARTER ≤$2,5M → $99.990`, `PRO_GROWTH ≤$8M → $249.990` (ciclos con −2%/−4%), `PRO_BIG` manual. Pro desbloquea analítica avanzada, exports CSV/PDF, CRM y multi-staff - el ticketing base, venta y check-in **nunca se cortan** por la suscripción. Trial de lanzamiento: +90d a productores registrados.

**Contexto competitivo (evaluado oct-2026, decisión: no competir en precio)**:
- **BoxMagic** (gestión deportiva): ~$39.900+IVA hasta 120 clientes - referencia del pricing de tiers.
- **Membrezia** (cobranza pura, multi-vertical): 0,6 UF (~$28.200 c/IVA) hasta 150 clientes / 1 UF (~$47.000) hasta 300 - pero el dinero va a la pasarela de la propia org (paga su ~3% aparte) y **no** incluye gestión, clases, check-in ni marketplace. Para una academia de 60 alumnos el costo total queda ~$85k vs ~$107k con STARTER - más caro nuestro en sticker, con mucho más producto.
- Decisión: **sin tier Lite** - el cliente que compara solo precio de sticker no es el segmento objetivo; el producto compite en gestión completa + liquidez del marketplace. Gaps identificados si se revisa: recordatorios WhatsApp (hoy push/email), integración SII/boletas, plata directa a cuenta de la org (nuestro payout es la contrapartida del onboarding sin pasarela propia). Referencia completa de features/precios de ambos en `docs/competitive-references.md`.

### Flujo de ingreso en puerta (staff)

**Caso A - ticket en app:** bailarín muestra su QR personal → staff escanea → valida ticket / evento / no-usado → check-in automático + hora de llegada → "Ya llegué" + notificación a amigos.

**Caso B - sin ticket (venta puerta): todos entran con cuenta.** Ya no hay conteo anónimo:
- Staff crea **cuenta ligera en el momento** (nombre + teléfono, sin onboarding completo) → genera QR personal al instante
- Luego: asocia una **entrada ya pagada** (cash/transferencia registrada por staff, aprobada por staff) **o** la persona **compra en la app** recién creada (paga el precio de lista exacto - la comisión va al productor)
- El staff aprueba la operación en su pantalla - queda auditado
- Casos borde en puerta (precio distinto, cortesía de último minuto, error) → el productor genera **`discount_code`** para resolverlos

**Caso C - entrada liberada (Tierra Dura mar/mié):** el ticket de $0 igual pasa por el QR → check-in + data de llegada temprana. Es exactamente la métrica que el local quiere.

**Caso D - pases sin pago:** el QR personal es la *identidad*; lo que el escaneo resuelve es un **pase**. Tipos:

| Pase | Quién | Paga | Notas |
|---|---|---|---|
| Ticket pagado | Comprador | Sí | Preventa o puerta |
| **Pase artista** | Bailarines de los shows (~00:30) | No | Asignado por la academia/productor del show; check-in como "artista". Bailan social igual que todos → sus sesiones cuentan |
| Pase staff | Staff del evento | No | No participa en sesiones ni rankings |
| Cortesía / lista | Invitados del productor | No | Cortesías normales del rubro |

**Implicancia analítica clave:** el check-in registra el **tipo de pase** → 200 personas adentro ≠ 200 tickets vendidos. Las métricas separan público pagante / artistas / staff - el productor ve el desglose real.

**Reglas operativas:**

| Regla | Por qué |
|---|---|
| **QR rotativo (~30s, tipo TOTP)** | Un screenshot compartido por WhatsApp no sirve para entrar ni para crear sesiones falsas - en una escena de 200 personas ese exploit es trivial |
| **Staff app offline-first** | Cachea la lista de tickets del evento y valida localmente, sincroniza al volver la red. La puerta NO puede depender de señal en un subterráneo a las 23:00 |
| **Doble escaneo** | "Ya ingresó a las 23:14" → el staff decide; puede anular check-in erróneo (con auditoría) |
| **Todos entran con cuenta** | No hay anónimos: el staff crea cuenta ligera en puerta al momento (nombre + teléfono → QR al instante). Sin esto no hay grafo de baile completo ni CRM completo |

**El QR personal es la única credencial - no hay QR por entrada** (decisión oct-2026, spec wallet-passes): redundar credenciales suma fricción. El wallet pass de Google (`/wallet/google`, GenericPass) es un **lanzador** que abre `/qr` - sin barcode propio. La visibilidad day-of la resuelve el **push `ticket.day_of`** (cron ≈09:00 Chile a dueños de ticket ACTIVE de eventos del día, dedup por día) + la cadena de instalación (`PushOptIn`/`InstallPrompt`); no hay gating del QR por fecha. Y las órdenes manuales en revisión se muestran en "Mis entradas" como **"pago en validación"** (ámbar, sin QR) - nadie llega a puerta creyendo que tiene entrada antes de la aprobación del comprobante.

### Regalos / gift tickets

- Comprar entrada para un amigo → el ticket queda ligado a la cuenta del receptor (entra con su propio QR personal)
- Sin cuenta → el regalo es el onboarding (link + claim)

### Códigos de descuento (`discount_code`)

- El productor (o admin) genera códigos con **tipo predeterminado por caso de uso** - no libre: `cumpleaños`, `cortesía`, `caso_borde_puerta`, `campaign` (CRM), `winback`, `staff_comp`
- **Tracking completo**: quién lo creó, usos, máximo de usos, quién lo redimió, evento/serie asociado - auditable contra abuso
- Resuelven los casos borde de puerta y son el instrumento de precio del CRM (ofertas a segmentos)

### Reglas de sistema

- **Estados del evento**: `draft → published → live → closed` (+ `cancelled`)
- **Sin reembolsos de ningún tipo, a ningún perfil.** Si el evento se cancela, no hay devolución automática: el productor decide honrar el ticket en fecha reprogramada o emitir cortesía. ⚠️ Validar con contador/abogado: la ley del consumidor chilena puede exigir devolución en cancelación - pendiente legal
- **Claim de asistencia histórica** ("estuve en X evento", casos previos a la app): cuenta **solo para historial personal**, nunca para streaks/rankings/puntos - sino es exploitable
- **Auth**: Google OAuth + **magic link por email vía Resend** (free tier ~100/día - suficiente para MVP; escalar a AWS SES si se acaba). OTP por WhatsApp queda como opción cara a evaluar
- **Onboarding B2B - landings por rol**: cualquiera puede registrarse bajo el rol que quiera (productor, venue, academia, DJ, instructor) desde su landing → queda en **sandbox/demo** (data de prueba, puede explorar su consola) **hasta que admin aprueba**. Nadie se autoproclama productor de "La Gozadera", pero todos pueden ver su consola funcionando antes de la aprobación
- **Roles con dinero requieren `fiscal_profile`**: RUT, razón social, tipo (empresa / persona natural), giro - obligatorio para cualquier rol que reciba liquidaciones o emita boletas/facturas
- **omni-dance opera como empresa de software propia** (SpA) - contrata la pasarela de pagos, emite **factura al productor por su comisión todo incluido** (neto + IVA), factura el SaaS
- **18+**: la app se declara para mayores de edad (eventos con alcohol)
- **Legal**: ToS + política de privacidad (ley 21.719 Chile) - los ratings son data que requiere consentimiento informado
- **i18n - bases listas desde el día 1**: solo `es-CL` habilitado, pero todos los strings pasan por catálogo de mensajes (next-intl), fechas/moneda/timezone por APIs Intl. Refactor tardío sería mucho peor

---

## 11. Academias (estructura tipo BoxMagic)

Gestión integral - el benchmark es BoxMagic (reservas con aforo, membresías, check-in QR, reportes, contenido). Todo con **el mismo QR personal del bailarín**.

### Planes y membresías

- Tipos de plan: **mensualidad recurrente**, **por cantidad de clases** (pack de 8), **por periodo**, **plan de prueba** (clase gratis)
- Estados del alumno: **activo / pausado / trial / congelado / online**
- Prorrateo, pausas configurables, recordatorios automáticos de membresía impaga
- Cobro recurrente: Khipu / Webpay Oneclick
- **Clase de prueba con link compartible** - herramienta de adquisición para redes sociales de la academia

### Horarios y asistencia

- `class_slot`: horario con cupos + reserva + lista de espera de clase
- **Cuota del plan**: los planes por tiempo llevan `weeklyClasses` (clases por semana ISO; `null` = ilimitado); los packs llevan `classCount` total. Reservar exige inscripción vigente + cuota disponible; la lista de espera no consume crédito hasta promover, y al promover se salta a quien no tenga saldo.
- **Cancelación de reserva**: siempre libera el cupo físico; el crédito vuelve solo si se cancela antes del corte `classes.cancel_refund_minutes` (default 60, param operativo). Después del corte el alumno puede cancelar pero la clase se consume igual. Cancelaciones originadas por la academia siempre devuelven el crédito.
- Check-in de asistencia con el **mismo QR personal** → `attendance` alimenta score de fidelidad
- Horarios por instructor (`academy_instructor`)

### Instructores y clases privadas

- `instructor` = rol de `person`: puede ser dueño de academia, profe en una o más academias, o **independiente** (= academia de uno)
- **Clases privadas como producto vendible de la academia**: `private_lesson` (instructor, alumno, slot, precio, estado) - la academia lo administra y cobra comisión
- Compra online (private-lesson-product): la academia fija un precio único (`Academy.privateLessonPrice`) y el alumno lo compra desde el perfil (`POST /checkout/private-class`, orden `PRIVATE`); el pago crea la `private_lesson` en REQUESTED sin instructor ni fecha - el owner los asigna después (`action=assign` → CONFIRMED + snapshot de comisión). El alumno no elige fecha ni instructor al comprar.

### Talleres pagos

- Venta desde la app + check-in QR + reportes de ingresos

### Contenido (feature pago)

- Videos de rutinas/clases: solo clases asistidas, sin descarga - **links privados de YouTube/Vimeo en v1** (nunca self-host, egress mata free tier)
- Alumnos online: solo videos, suscripción mensual, sin sociales

### Score de cercanía del alumno (`academy_score`)

**Privado - solo lo ve quien gestiona la academia.** No es gamificación para el alumno, es **CRM para la academia**: la herramienta para saber qué alumnos son claves y a quién está por perder.

**Inputs**: clases compradas (planes/packs), tasa de asistencia, asistencia a eventos de la academia (galas, prácticas, sociales propios), antigüedad, puntualidad de pago. Mide compromiso, no técnica.

**Uso de negocio - segmentación accionable:**

| Segmento | Señal | Acción de la academia |
|---|---|---|
| Alumnos núcleo | Score alto | **Upsell**: plan premium, bootcamp, clases privadas, talleres - "mandar oferta de bootcamp a los 20 con más score" |
| En riesgo | Score/asistencia cayendo | **Churn**: actúa ANTES de que abandone (oferta, mensaje, clase de cortesía) |
| Nuevos | Trial reciente | Onboarding: ¿está enganchando o no? |

- El alumno **nunca ve el número** - del lado consumidor solo se expresa como "nivel de comunidad" genérico
- Streak de clases lo alimenta directamente
- Es la métrica que hace vender el producto a academias: convierte data en plata

### Reportes (para la academia)

- Ingresos actuales/históricos, nuevos alumnos, asistencia por clase, performance de instructores (horas), retención, performance por plan

---

## 12. Modelo de datos (entidades núcleo)

`person` + `person_role` (dancer, dj, producer, staff, academy_owner, **instructor** - multi-rol),
`style` (jerarquía género→estilo), `person_style_role`, `friendship`,
`event`, `event_series`, `venue`, `schedule_block`, `event_dj`,
`dance_session` (`invited → confirmed | expired → rated/closed`), `session_rating`, `event_rating`,
`entry_pass` (paid / artist / staff / comp / **list** - con ventana horaria y precio especial), `ticket` (incl. gifted), `checkin` (in/out, registra tipo de pase), `staff_assignment`,
`guest_list` (event, dueño - ej. cumpleañero - + invitados con precio especial), `waitlist` (event, orden), `series_pass` (suscripción mensual por serie), `event` (aforo, caps preventa/puerta, `photos_url` → Drive del fotógrafo),
`show` (academia, slot ~00:30), `show_performer`,
`table_reservation` (event, solicitante, cantidad personas, estado, opcional nº mesa - mesa = proxy de consumo para el Local Pro),
`venue_menu` (venue, PDF, versión - vistas durante el evento = métrica de engagement),
`mission_template`, `mission` (por evento, condición verificable + recompensa), `mission_progress`,
`badge` (pasaporte, corona Prime Time, "primera vez", padrino), `streak` (por serie/productor/venue/etc), `streak_freeze`,
`point_ledger` (puntos de temporada, no gastables, resetean), `friend_challenge`, `prize_draw` (ruleta/sorteos/escaneo dorado), `community_level`,
`song_suggestion` (event, person, canción - del checkout; top-N para DJ/productor, habilita "la más pedida suena a las X"),
`season` (leaderboard por estilo+rol), `night_summary`, `happy_hour_window` (sesiones cuentan doble para contador),
`academy`, `academy_instructor` (profe en N academias / dueño / independiente=academia de uno), `enrollment` (activo/pausado/trial/congelado/online), `membership_plan` (mensual/pack clases/periodo/trial), `class_slot` (horario+cupos+reserva+lista espera), `class`, `attendance`, `private_lesson`, `academy_score`, `video`, `subscription`,
`practice` (event tipo práctica, creador=host bailarín, aforo chico, gratis, `chat_thread` o comentarios), ~~`availability_toggle`~~ (retirado), `user_verification`, `report`,
`event_day` (congresos multi-día), ~~`practice_partner_request`~~ (retirado), `venue_rental` (local↔academia para galas/prácticas),
**CRM transversal**: `relationship_score` (actor→person, privado por actor: academy/producer/venue/dj/instructor_score), `campaign` (actor, segmento, acción, resultado), `discount_code` (descuento/cortesía/comp), `actor_tag` (nota manual actor→person), `referral` (quién trajo a quién), `crm_trigger` (regla automática: win-back, trial expira, regular no compró),
**Transaccional**: `rsvp` ("voy" - mencionado en features pero faltaba como entidad), `payment` (orden/ticket, pasarela, fee, neto - la liquidación lo necesita), `payout` (liquidación a productor/academia: periodo, monto, estado), `notification` (push/in-app; preferencias por categoría: social / transaccional / marketing-CRM), ~~`user_block`~~ (retirado junto al ciclo de invitaciones), `analytics_event` (append-only de eventos de producto → materialized views para Pro/CRM), `fiscal_profile` (RUT, razón social, empresa/persona, giro - requerido en todo rol que recibe liquidaciones o emite documentos)

---

## 13. Vistas por rol (inventario de pantallas)

### Bailarín (PWA mobile-first)

| Pantalla | Contenido clave |
|---|---|
| Onboarding / claim | Nombre, foto, estilos + roles; claim de ticket regalado o asistencia retroactiva |
| Home / feed | Próximos eventos de la semana, actividad de amigos ("X va a Gozadera"), tu streak, progreso de misiones |
| Calendario | Global, por serie, por productor, por local |
| Landing de evento | Lineup (DJ, sets, shows, cumpleañeros), quién va + amigos con mesa, leaderboard de la serie, comprar / guest list / reservar mesa, carta, fotos (Drive), sugerir canción |
| Checkout preventa | Ticket a precio de lista exacto, reserva de mesa opcional, sugerir canción opcional |
| Mi QR | QR rotativo + badge destacado / corona 👑 - la pantalla que muestras en puerta y en pista |
| En vivo | Escanear QR (registrar baile), Mi QR, contador Prime Time, progreso de la noche |
| Cola de ratings | "Bailes pendientes de puntuar" - 4 filas × 5 estrellas por sesión |
| Score final | Card compartible de la noche (desbloqueada al cerrar ratings) → ruleta |
| Perfil | Reputación agregada por estilo+rol, badges, streaks, puntos de temporada, nivel de comunidad |
| Amigos | Lista, historial de sesiones por amigo, retos enviados/recibidos, leaderboard privado |
| Leaderboards | Por serie (tabs: asistencia / temporada / parejas), temporada global |
| Pasaporte | Colección de badges y sellos con progreso |
| Misiones | Activas con barra de progreso, disponibles, cumplidas |
| Prácticas | Explorar prácticas cercanas, crear práctica (host), chat/comentarios de coordinación |
| Notificaciones | Preferencias por categoría: social / transaccional / marketing |

Wireframe - pantalla "En vivo" (la pantalla de la noche):

```
┌─────────────────────────┐
│ La Gozadera · Orixas    │
│ ████████░░ 23:47        │  ← barra temporal de la noche
│                         │
│  PREMIO: 28 / 40 🔒     │  ← contador Prime Time en vivo
│  sesiones para desbloq. │
│                         │
│ ┌─────────────────────┐ │
│ │   [ NUEVO BAILE ]   │ │  ← cámara (el botón grande)
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │      [ MI QR ]      │ │
│ └─────────────────────┘ │
│                         │
│ Invitaciones (2)        │
│ · Camila  [confirmar]   │
│ · Diego   [confirmar]   │
│                         │
│ Esta noche: 7 bailes ·  │
│ 5 parejas · S60%/B40%   │
└─────────────────────────┘
```

Wireframe - Mi QR:

```
┌─────────────────────────┐
│        TU QR            │
│                         │
│   ┌───────────────┐     │
│   │               │     │
│   │   ▓▓ QR ▓▓    │     │  ← rota cada ~30s
│   │               │     │
│   └───────────────┘     │
│                         │
│   Salomón 👑            │  ← nombre + badge destacado
│   Ganador Prime Time    │
│   La Gozadera           │
└─────────────────────────┘
```

### Staff (PWA, uso bajo presión, offline-first)

| Pantalla | Contenido clave |
|---|---|
| Login / eventos asignados | Solo eventos donde el productor lo asignó |
| **Scanner** | Cámara → resultado inmediato: verde "PASA - ticket válido / pase artista / lista" o rojo "YA INGRESÓ 23:14 / ticket otro evento / sin ticket". Tipo de pase visible. Funciona offline contra lista cacheada |
| Venta puerta | Registrar venta (efectivo = conteo + check-in / link de pago = cuenta ligera) |
| Lista de ingresos | Quién entró, hora, tipo de pase; anular check-in (auditado) |
| Guest list | Búsqueda por nombre para validar lista/cumpleañeros |

### Productor

| Pantalla | Contenido clave |
|---|---|
| Dashboard | Próximos eventos, ventas en curso, ocupación esperada |
| Crear/editar evento y serie | Precios, aforo, lineup (DJ, bloques de género, shows, cumpleañeros), staff asignado, misiones activas, config Prime Time (umbral, premios) |
| **En vivo** | Ingresos en tiempo real (check-ins por minuto), ocupación, contador Prime Time, activar hora feliz |
| Asistentes | Lista por tipo de pase, guest lists consolidadas (incl. cumpleaños), reservas de mesa |
| Post-evento | Evaluaciones agregadas por dimensión, resumen de la noche |
| Liquidaciones | Qué cobró, cuándo se transfirió, desglose de comisiones |

### Productor Pro - catálogo de insights (el producto SaaS)

**Asistencia y flujo**
- Check-ins por tipo de pase (pagante / artista / staff / lista / cortesía)
- **Curva de llegada**: histograma de check-ins por hora - el "llegan tarde" medido con datos
- **Curva de éxodo**: check-outs por hora - dónde está realmente el ~01:30
- Ocupación vs aforo en el tiempo

**Pista**
- Sesiones por hora (heatmap) - cuándo se baila más en la noche
- Ratio leader/follower, proporción salsa/bachata por bloque horario
- Distribución de bailes por persona, parejas únicas promedio
- Densidad de pista: % de asistentes que bailó (vs. sentados)

**Público**
- **Nuevos vs recurrentes** → retención del público: LA métrica de salud de la fiesta
- % que vino con amigos, clusters por academia, reincidencia por serie

**Engagement**
- % asistentes con app, % que escaneó, % que puntuó, completitud de ratings
- Cumplimiento por misión (ROI de activaciones)

**Comercial**
- Preventa vs puerta, curva de venta anticipada (predicción de aforo), gift tickets, pases mensuales
- Revenue por evento + comparativa histórica

**Reputación**
- Evaluaciones agregadas por dimensión (las suyas: música, ocupación, organización), comparativa vs eventos anteriores, benchmark anónimo vs la escena
- **Canciones más pedidas** (de `song_suggestion`) - compartible con el DJ

**CRM** (del §14)
- Segmentos de asistentes: núcleo / en riesgo / nuevos / trae-gente
- `campaign` builder: elegir segmento → acción (push, código de descuento, cortesía) → resultado
- Embudo de conversión, cohort retention, LTV por asistente
- `crm_trigger` activos (win-back, "regular no compró preventa")

**Exportes** - CSV/PDF por evento y por serie

### Academia (consola de gestión)

| Pantalla | Contenido clave |
|---|---|
| Dashboard | Alumnos activos/trial/en riesgo, asistencia de hoy, ingresos del mes, clases del día |
| Alumnos | Lista con `academy_score` + segmento (núcleo/riesgo/nuevo), `actor_tag`, historial de pagos y asistencia |
| Planes | CRUD de `membership_plan`, estados de `enrollment`, prorrateo/pausas, morosos con recordatorio automático |
| Horarios | `class_slot` semanal: cupos, reservas, lista de espera, instructor asignado |
| Asistencia | Check-in QR del alumno, registro manual |
| Clases privadas | `private_lesson`: instructor, alumno, slot, precio, comisión - compra online como producto (`Academy.privateLessonPrice`, orden PRIVATE), el owner asigna instructor+fecha post-pago |
| Talleres | Crear taller pago, ventas, asistencia |
| Contenido | Links de videos por clase (YouTube/Vimeo privado), quién puede ver qué |
| CRM | Segmentos → `campaign` (oferta de bootcamp a núcleo, win-back a riesgo), `crm_trigger` (trial expira, asistencia cayó) |
| Reportes | Ingresos, nuevos alumnos, retención por cohorte, performance por plan e instructor |

### Local / Local Pro

- Local: flujo, permanencia, horas pico, reservas de mesa, vistas de carta
- Local Pro: correlación evento↔consumo, medición de activaciones, comparativa entre noches

### DJ (vista ligera)

- Top canciones pedidas por el público del evento
- Su evaluación agregada de "música" por evento

### Admin

| Pantalla | Contenido |
|---|---|
| Usuarios y roles | Asignar/verificar roles (productor, staff, academia), multi-rol |
| Entidades | CRUD de locales, series, eventos, academias |
| **Flags anti-gaming** | Sesiones sospechosas (parejas repetidas, escaneos anómalos), anulaciones auditadas, colas de revisión |
| Incidencias | Reprocesos operativos, refunds manuales a pedido del productor |
| Config global | Comisiones, umbrales Prime Time, parámetros anti-gaming, templates de misión |
| Métricas plataforma | Eventos/mes, escaneos por noche, revenue, adopción por serie |
| Health técnico | Estado de sync offline de staff, webhooks de pago, errores |

### Soporte

- Cola de incidencias, reprocesos puntuales (re-emitir ticket, corregir check-in) - sin tocar reglas ni finanzas

---

## 14. CRM - gestión comercial transversal

El `academy_score` generalizado: **cada actor B2B tiene un score privado de relación sobre "su" gente**. Framework base: **RFM** (recencia, frecuencia, monto) + engagement. Todos los scores son privados por actor - el productor no ve el score de la academia, el bailarín nunca ve ninguno.

### El score por actor

| Actor | Score sobre | Señales | Acciones que habilita |
|---|---|---|---|
| **Academia** | Alumno | Clases compradas, asistencia, eventos de la academia, antigüedad, pago | Upsell (bootcamp/plan/clase privada), anti-churn, seguimiento de trial |
| **Productor** | Asistente | Asistencia a SUS eventos, compra preventa temprana vs puerta, trae amigos (referrals), ratings de sus eventos | Upsell `series_pass`/pases VIP, win-back a regulares ausentes, convertir nuevos en regulares |
| **Venue** | Cliente del local | Asistencia al local **independiente del productor**, mesas reservadas, carta vista | Lealtad al local (cortesías, mesa prioridad), detectar churn atribuible al LOCAL (piso/ruido/trato) no al evento |
| **DJ** | Público | Quién evalúa bien su música + **permanencia durante su bloque** (se quedan o se van cuando toca) | Menos CRM, más reputación demostrable: "mantengo/traigo público" → argumento de negociación con productores |
| **Instructor** | Alumno (privadas) | Clases privadas tomadas, continuidad | Upsell de packs de privadas, retención |
| **omni-dance** | Todos (meta-CRM) | Adopción por evento (% escaneado vs anónimo), actividad de productores/venues/academias, quién decae | Nuestro propio pipeline comercial: qué actor pitch-ear, quién se está yendo de la plataforma |

### Los segmentos universales (mismo patrón, todos los actores)

- **Núcleo** (score alto) → upsell, early access, trato VIP
- **En riesgo** (score/asistencia cayendo) → actuar ANTES del churn
- **Nuevos** (primera interacción) → la segunda visita es la métrica clave: todo el esfuerzo es convertir primera→segunda
- **Trae-gente / embajador** (referrals altos) → promoter codes, cortesías - son canal de adquisición, no clientes

### Funcionalidades CRM que faltaban (y hay que agregar)

El score sin acción es decoración. Estas son las piezas del CRM que no estaban en el modelo:

1. **`campaign`** - acción sobre segmento: "enviar oferta/push a los 20 con más score" / "a los en riesgo". Sin esto los scores son solo reportes
2. **`discount_code`** - instrumento de precio: códigos de descuento, cortesías, comp codes. **No existía en el modelo** y sin códigos no hay upsell posible
3. **Comunicación segmentada** - push/in-app a un segmento ("te extrañamos", "tu trial expira en 3 días"). No broadcast masivo: segmentado
4. **Embudo de conversión** - landing view → RSVP → compra → check-in → repite. El chart de CRM por excelencia; para el productor: "de 500 que vieron el evento, 80 compraron, 72 llegaron, 30 repiten"
5. **Cohort retention** - "de los 30 alumnos nuevos de septiembre, ¿cuántos siguen en diciembre?" - tabla de cohortes clásica
6. **LTV** - cuánto ha gastado esta persona con este actor (CLP lifetime). Cambia decisiones: un alumno de $500k lifetime merece otra atención que uno de $15k
7. **`actor_tag` / notas manuales** - el productor marca "VIP", "amigo del DJ", "cumpleañero frecuente". CRM clásico: la data que el sistema no infiere
8. **`referral`** - quién trajo a quién (gift tickets + invites ya dan la data). El embajador medible
9. **`crm_trigger` / automatizaciones** - reglas que disparan solas: "regular no compró preventa para el próximo evento" → alerta/oferta; "trial expira en 3 días" → push; "asistencia cayó 50%" → flag. Esto convierte el CRM de dashboard manual en sistema activo

### Privacidad transversal

- Scores privados por actor; el bailarín solo ve el **beneficio** (ofertas, early access, invitaciones) - nunca el número ni que existe
- Un actor no puede comprar data de otro: la academia no ve el score del productor
- La única excepción es omni-dance (meta-CRM) - y eso es nuestra ventaja estructural: **somos el único actor que ve el grafo completo**

---

## 15. Roadmap (1 dev - scope despiadado)

**Decisión: ticketing primero.** Revenue e instalaciones desde el día 1; cada comprador entra a la app y el escaneo de staff en puerta genera la primera data real de asistencia.

| Fase | Contenido | Valida |
|---|---|---|
| **0** | Perfiles + QR personal, eventos/series, calendario, RSVP + amigos, check-in "Ya llegué" | Adopción base |
| **1** | Ticketing preventa (Flow) + escaneo staff en puerta + check-in automático + gift/transferencia de tickets | **Revenue real + base instalada** |
| **2** | Sesiones (escaneo QR → confirmada al instante, retro-declaración), ratings híbridos, progreso de la noche | **¿La gente escanea?** |
| **3** | Ranking Prime Time + reveal en vivo, rankings públicos (productor/local/DJ), métricas básicas productor | El incentivo y el pitch B2B |
| **4** | SaaS Productor Pro / Local Pro (analíticas) | Monetización B2B |
| **5** | Academias: score fidelidad → mensualidades → talleres → videos | Segundo producto |

### Alcance del build - todas las funcionalidades

**Decisión: el MVP es el producto completo.** Las fases de arriba no son recortes de scope - son el **orden de construcción**. Se construye todo lo especificado en este documento, en ese orden:

1. **Fase 0-1 primero** porque ticketing genera revenue y base instalada desde el día 1
2. Sesiones + ratings después (fase 2) - el diferenciador
3. Prime Time + rankings (fase 3) - el espectáculo
4. Pro/Local Pro (fase 4) - el SaaS
5. Academias (fase 5) - el segundo producto
6. Prácticas, congresos, competencias - expansiones del mismo stack

**Criterio de lanzamiento**: un evento real (idealmente Bachatamanía o DDT - Carlos Andrés o MuéveteOnTour como early adopters) vende ≥50% de su preventa por la app y el staff opera puerta completa con el scanner.

**Cortado de v1:** videos self-hosted, alumnos online, marketplace split, app nativa.

---

## 16. Arquitectura técnica (alto nivel)

**Principio rector**: 1 dev, ~$0/mes, pico de uso 22:00–04:00 corto y predecible. **Monolito modular** - no microservicios. Una sola PWA sirve todas las superficies.

### Diagrama

```
                    ┌─────────────┐
   Bailarín PWA ───►│             │
   Staff PWA ──────►│  Cloudflare │──► CDN estáticos + proxy + TLS
   Consolas B2B ───►│   (free)    │
   Pantalla local ──┘      │
                           ▼
                  ┌──────────────────┐      ┌──────────────┐
                  │  Backend (OCI VM) │◄────►│   Postgres   │
                  │  API REST + WS    │      │  (Neon free) │
                  │  Node/TS monolito │      └──────────────┘
                  └────────┬─────────┘
                           │          ┌──────────────┐
                           ├─────────►│    Redis     │  cache + pub/sub WS
                           │          │  (en la VM)  │  + cola de jobs
                           │          └──────────────┘
                           │
              ┌────────────┼────────────┬───────────────┐
              ▼            ▼            ▼               ▼
          Flow API    Web Push     OCI Object      Webhooks
          (pagos)    (VAPID)      Storage (imgs)   (pasarela)
```

### Frontends

**v1: una sola PWA - Next.js + React** (SSR para landings públicos con SEO, service worker para offline/push), superficies por ruta y rol:

| Superficie | Notas técnicas |
|---|---|
| Bailarín | Mobile-first, installable, Web Push. **IndexedDB** para sesión/QR offline en pista |
| Staff | **Offline-first real**: lista de tickets del evento cacheada en IndexedDB, validación local, cola de sync al volver red. La pantalla más crítica del sistema |
| Consolas (productor/local/academia/admin) | Mismo bundle, role-gated, responsive pero desktop-friendly |
| Pantalla del local | Vista pública de solo-lectura: contador Prime Time por websocket, proyector/TV |

**Decisión mobile**: PWA primero, **React Native + Expo como fase posterior opcional**. Por qué no Expo desde el día 1:

- El checkout de preventa debe funcionar desde un link de Instagram/WhatsApp **sin instalar nada** (punto de conversión crítico), y las consolas B2B son web
- **$0 developer account de Apple** ($99/año) y **$0 comisión In-App Purchase** (15-30% de Apple sobre bienes digitales - los tickets podrían caer en esa regla en app nativa). La PWA paga solo el fee de la pasarela
- Sin fricción de review del App Store para cada release
- Costo conocido: en iOS la instalación es manual (Share → "Agregar a pantalla de inicio") y Web Push solo funciona instalada (iOS 16.4+) - el onboarding debe pedir instalación explícitamente

Cuando haya tracción, la app Expo puede compartir API y design tokens con la PWA - pero sería una app *adicional*, no reemplazo de la web.

### Design system

**Atomic design** - tokens → atoms → molecules → organisms → templates → pages:

- **Tokens**: colores, espaciado, tipografía - compartibles entre web y futuro Expo. **Dark-first**: la app se usa de noche en locales oscuros - el tema oscuro no es opción, es el default
- **Atoms**: botones, inputs, badges, estrellas de rating, QR display
- **Molecules**: cards de evento, ítem de invitación pendiente, resultado de scan verde/rojo
- **Organisms**: scanner, contador Prime Time, leaderboard, checkout
- Stack sugerido: Tailwind + componentes propios (o Radix/shadcn como base) - design tokens exportables a NativeWind si llega Expo

### Backend

- **NestJS (TypeScript)** en la VM de Oracle - **arquitectura hexagonal** (ports & adapters): dominio puro sin framework, puertos para DB/pasarela/push, adapters Postgres/Flow/WebPush. **SOLID + clean code** - con 1 dev, la mantenibilidad ES la velocidad
- **API REST** para CRUD + **WebSockets** (gateway de Nest) para tiempo real: contador Prime Time, notificaciones de bailes registrados, check-ins en vivo → Redis pub/sub
- **Jobs en Redis** (BullMQ): notificaciones, `crm_trigger`, liquidaciones, cierre de ventanas de rating
- **QR rotativo**: token firmado tipo TOTP (~30s de ventana) - verificable offline por staff con datos cacheados

### Notificaciones (sistema propio)

In-app (centro de notificaciones) + **Web Push (VAPID, gratis)**. Habilita todo el CRM: `campaign` segmentada, `crm_trigger`, y notificaciones de producto:

| Tipo | Ejemplos |
|---|---|
| Social | "X llegó al evento", "Y registró un baile contigo", actividad de amigos |
| Transaccional | "Te puntuaron" (anónimo), "Ganaste el Prime Time", "Badge desbloqueado", resumen de la noche + ratings pendientes |
| CRM/marketing | Campañas segmentadas, win-back, "tu trial expira", "regular que no compró preventa" |
| Operacional | Staff: sync offline; productor: "se agotó la preventa" |

Preferencias por categoría - el usuario apaga marketing sin perder transaccionales.

### Datos

- **Postgres** (Neon free / o self-host en OCI): todo el modelo transaccional (~50 entidades). **ORM: Prisma**
- **Redis**: cache de sesiones, pub/sub websocket, rate limiting, colas, listas de tickets calientes por evento
- **Object storage** (OCI free): avatares e imágenes propias. **Fotos de evento y videos NUNCA se hostean** - links externos (Drive, YouTube/Vimeo)

### Stack de build (decidido)

- **Repo**: monorepo **pnpm** - `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (types + validación zod compartidos front/back)
- **Auth**: JWT propio (`jose`) + Google OAuth; magic links vía Resend
- **Testing**: **Vitest** (unit) + **Playwright** (smoke e2e del flujo crítico: checkout, check-in)
- **Monitoreo**: **Sentry** free tier (errores front + back)
- **CI/CD**: GitHub Actions → Docker → deploy a la VM OCI

### Integraciones externas

Flow (pagos + webhooks + suscripciones recurrentes de mensualidades de academia) · Google Drive (fotos) · YouTube/Vimeo (videos/streaming embebido) · futuro: Webpay Oneclick/Khipu si el volumen justifica migrar de pasarela

### Riesgos técnicos conocidos

- **Offline de puerta**: la pieza más delicada - doble-check-in offline se resuelve por timestamp + auditoría al sincronizar
- **Oracle reclama VMs idle**: plan B Hetzner ~$5/mes ya documentado
- **Web Push en iOS**: requiere PWA instalada - la estrategia de "instala la app" es necesaria, no cosmética
- **Pico concurrente trivial**: ~200 por evento - el monolito aguanta de sobra en la VM free

### Datos analíticos y backups

**Opciones exploradas para analytics:**

| Opción | Costo | Veredicto |
|---|---|---|
| Postgres + materialized views | $0 | **Decisión v1** - las métricas de negocio (curvas, cohortes, scores) salen de las tablas transaccionales + `analytics_event` (append-only). Sin infra extra |
| PostHog self-hosted (product analytics) | $0 pero pesa en la VM | Opcional después - embudos de producto tipo landing→compra. Suma mucha RAM para el valor que da al inicio |
| Metabase self-hosted (BI interno) | $0 en la VM | Opcional - dashboards internos de admin sin escribir queries. Útil pero no crítico |
| Warehouse (BigQuery/etc.) | Crece | Innecesario a esta escala |

- **Backups**: `pg_dump` nocturno a OCI Object Storage como red de seguridad (Neon free tiene retención limitada)

---

## 17. Economía e infra

### Infra (objetivo: ~$0/mes)

- **Oracle Cloud Always Free** (4 ARM cores, 24GB RAM, 200GB) → backend + websockets
- **Neon free tier** (Postgres, 0.5GB) → DB; plan B: Postgres propio en Oracle
- Cloudflare free (CDN/estáticos), storage de imágenes en OCI free
- **Caveats**: Oracle puede reclamar VMs Always Free idle (plan B documentado: Hetzner ~$5 USD/mes); el pico 22:00–04:00 es corto y predecible; NUNCA videos en free tier

### Proyección mensual

- Ticketing: ~$0,9–1,3M CLP neto a captura total (20–25 eventos); ~$200–300k con un solo productor
- SaaS futuro: Productor Pro $25–40k, Local Pro $20–30k, Academia $15–30k/mes

---

## 18. Decisiones tomadas (iteración v2)

- Invitación de baile: expira al **cierre del evento + 24h de gracia**
- Bailes sin escanear: **eliminados** (declaración retroactiva retirada - solo escaneo QR en pista)
- Ratings diferidos: **editables mientras la ventana esté abierta** (24h), bloqueados al cerrar
- Roadmap: **ticketing primero** (fase 1), sesiones en fase 2
- Comercial: **comisión todo incluido al productor** (10% lista / 8% promo gestionada; derivado por modo de cobro; efectivo puerta y entrada liberada 0%); **sin reembolsos**, tickets transferibles
- QR personal **rotativo (~30s TOTP)** - anti-screenshot
- Staff app **offline-first** con lista de tickets cacheada
- Staff puede **anular check-in erróneo** (con auditoría)
- Asistente sin cuenta = "fantasma" (sin QR → fuera del grafo de baile); puede reclamar asistencia retroactiva al crear cuenta
- Venta puerta por app/QR → **cuenta ligera** (nombre + teléfono)
- QR personal es la *identidad*; el escaneo resuelve un `entry_pass` (paid / **artist** / staff / comp) - artistas de shows no pagan, check-in como "artista", participan en sesiones normalmente
- Check-in registra tipo de pase → métricas separan público pagante / artistas / staff
- Confirmación retroactiva conserva **timestamp del escaneo** (género inferido correcto)
- Gift ticket a persona sin cuenta: **sí** - el regalo es el onboarding (claim por link)
- QR rotativo aplica a sesiones: **sí** - solo escaneo presencial en vivo; mata el escaneo remoto de amigos
- Comisión **% todo incluido al productor** (reemplaza el cargo flat al comprador): 10% lista / 8% promo gestionada, derivada por modo de cobro; desglose pasarela al costo + fee neto + IVA; trazabilidad BIAN por pago y `PayoutLine` por liquidación
- **Una app, dos superficies** (consumidora + gestión role-gated) sobre un backend - no dos apps
- Instructor = rol de `person`: dueño de academia, profe en academias, o independiente (academia de uno); **clases privadas se venden vía gestión de academia** (`private_lesson`, la academia cobra comisión)
- Academias modeladas con **estructura tipo BoxMagic**: planes/membresías (mensual, pack, periodo, trial), estados (activo/pausado/trial/congelado/online), horarios con cupos, check-in QR, reportes, clase de prueba con link
- Sugerir canción en checkout → `song_suggestion` agregada para DJ; "la más pedida suena a las X"
- Reserva de mesa (nombre + cantidad), amigos ven quién tiene mesa, carta PDF del local
- Nightlife benchmark: guest list self-service, capacidad+waitlist, fotos vía Drive link, cumpleaños con lista de precio especial $4.000, pase mensual de serie, lineup del evento. **NO entra**: paquetes de mesa/vaquita/pedidos (Orixas usa Fudo - no competir con el POS del local)
- **Stack técnico definido**: backend **NestJS + arquitectura hexagonal + SOLID/clean code**; frontend **Next.js + React PWA** (una sola app, todas las superficies); **Expo/RN como fase posterior opcional** (el checkout debe funcionar sin instalar); **Postgres** + Redis; design system **atomic design, dark-first**
- Prime Time: **umbral escalado por aforo** (~20% del aforo esperado), configurable por productor dentro de límites de admin
- Notificaciones: **sistema propio** - in-app + Web Push; habilita CRM/campaigns, "te puntuaron", "ganaste", etc. Preferencias por categoría
- Core loop: **alta solo por escaneo QR** (sesión nace confirmada) + **descartar** (A cancela su declaración pendiente), **cooldown ~4 min** entre sesiones del mismo par, notificación a la pareja escaneada con foto+nombre, solo se puntúan sesiones confirmadas
- **Todos entran con cuenta** - no hay anónimos en puerta: staff crea cuenta ligera al momento, asocia entrada pagada o vende en app; casos borde se resuelven con `discount_code`
- `discount_code` con **tipos predeterminados** (cumpleaños, cortesía, caso_borde_puerta, campaign, winback, staff_comp) + tracking completo de usos
- **Sin reembolsos de ningún tipo** - cancelación → productor honra ticket en fecha reprogramada o emite cortesía (⚠️ validar ley del consumidor)
- **Onboarding B2B**: landings por rol, auto-registro → **sandbox/demo hasta aprobación de admin**; roles con dinero requieren `fiscal_profile` (RUT, razón social, empresa/persona)
- **omni-dance = empresa de software propia**: contrata pasarela, emite factura al productor por su comisión, factura SaaS; liquidaciones por transferencia a todos los perfiles que recaudan
- Auth: Google OAuth + **magic link vía Resend** (~100/día gratis); OTP WhatsApp como opción cara
- Reglas de sistema: estados de evento (draft→published→live→closed→cancelled), claim histórico solo para historial personal, 18+, i18n con bases listas (catálogos + Intl, solo es-CL habilitado)
- Analytics: **Postgres + materialized views** (v1); PostHog/Metabase self-hosted opcionales después
- **Build decidido**: monorepo pnpm (`apps/web`, `apps/api`, `packages/shared`), Prisma, JWT `jose` + Google OAuth, Vitest + Playwright, Sentry, GitHub Actions → Docker → OCI. Naming provisional: **Omnidance Nightlife** + **Omnidance Academy**
- **`song_suggestion`**: 1 por ticket, deduplicada por canción para el top-N
- **Chat de prácticas**: comentarios ligeros en v1; chat real después
- **WhatsApp**: diferido - push + email; WhatsApp API cuando haya revenue
- **Escaneo de clase en academia**: instructor/recepción escanea el QR del alumno (mismo patrón que puerta)
- **Acciones CRM v1**: push + `discount_code`

## 19. Pendientes externos (fuera del doc)

- **Fiscal/legal**: factura por comisión todo incluido (neto+IVA) + split en liquidación - validar con contador antes de fase 1
- **Legal cancelación**: "sin reembolsos" vs ley del consumidor chilena en eventos cancelados - revisar con abogado
- **ToS + privacidad** (ley 21.719): redactar antes de producción
- **Seed data pendiente**: productor/DJ de Tierra Dura, productor de Havana, precios exactos de La Gozadera, confirmación Social con Estilo (pagos) y Ashe (DJ)
- **Nombre/dominio definitivo**: omni-dance provisional; comprar dominio cuando se cierre el nombre
- **Constituir SpA + contrato Flow**
