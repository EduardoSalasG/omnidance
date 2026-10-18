# Handoff — brag batch v2 (módulos × rol, reels 9:16)

Fecha: 2026-10-16 · Batch: `brag-output-2026-10-16-211525/` (26 videos COMPLETOS)

## Qué se entregó

26 videos reel 1080×1920 con `brag.mp4` + `brag.jpg` (frame 0 = hook) + `brag-plan.md` + `share-copy.txt` + `composition/` check-green c/u:

- **Overviews con voz** (Kokoro `ef_dora`, ~30-34s): `overviews/nightlife`, `overviews/academy`
- **Bailarín** (4 flujos × vA/vB): comprar-entrada, la-noche, social, progreso
- **Productor** (4 × 2): crear-evento, noche-en-vivo, ventas-liquidacion, crm-pro
- **Academia** (4 × 2): cobro-plan, clase-asistencia, alumnos-crm, particulares

Manifiesto: `brag-output-2026-10-16-211525/INDEX.md`. Contrato: `_shared/context.md`. Copy verbatim por flujo: `_shared/copy-map.md`.

## Reglas nuevas del contrato (validadas en piloto)

1. **Flujo completo**: inventario de pantallas ordenado en cada brag-plan; todos los pasos se muestran.
2. **Tap-map de concordancia**: caption/voz ↔ elemento ↔ posición del tap-dot ↔ cambio de estado (±250ms). Los implementadores pusieron el `.tapdot` DENTRO del elemento objetivo — elimina la clase de error "dice Bachata pero toca Timba" por construcción.
3. **Beat de carga**: splash wordmark → skeleton shimmer → contenido (~1.1s). Mata el flash landing→app.
4. **Nunca congelado**: nada >1.4s estático (drift, glow RMS, contadores, shimmer). Holds = 0.7s + 0.28s/palabra.
5. **Viral**: hook en frame 0; arquetipos rotados (payoff-first/open loop/dolor/pattern interrupt/call-out); vA/vB = misma demo distinto hook (A/B real).
6. **Bernays**: prueba social, identidad>función, autoridad por datos agregados, FOMO honesto, dolor→alivio.
7. **Antagonista digital** (corrección del usuario): Sheets/apps genéricas de gym, NUNCA papel ni nombres de competidores.

## Notas técnicas para próximas sesiones

- TTS: `npx hyperframes tts` con venv desechable (`python -m venv .venv-tts && pip install kokoro-onnx soundfile`, `HYPERFRAMES_PYTHON` al python del venv) — el install global falla por numpy. `ef_dora` -l es speed 1.05 ≈ 197-208 wpm.
- `carve.mjs` (voiceover carve) escribe un 2º `data-automation` duplicado → merge manual a un solo atributo.
- `gen_audio_data.py` quedó en `_shared/` del batch para generar audio-data por track/mediaStart.
- Conflicto i18n detectado: `messages/es-CL.json` vs `i18n/parts/producer.json` difieren en strings post-evento — se usó base (copy-map). Si otros videos usan esos strings, parts gana el merge runtime (ojo).
- Lint warnings `file_too_large`/`nested_subcomposition`: patrón monolítico heredado, no gating.
- ffmpeg en `Gyan.FFmpeg` winget está en PATH para extraer frames de QA (fps=1/4, tile=3x3).

## Gaps / pendientes

- Review visual hecha por orquestador con frames (contact sheets + frames puntuales por pieza) — recomendado un vistazo humano final antes de publicar.
- Scan-de-pareja sigue EN VEREMOS → `la-noche` registra por invitación/confirmación (ya es noscan nativo).
- Calendario de publicación sugerido 3-5/semana con vA/vB como test de hook.
- Todos los outputs están UNTRACKED en git (como batches anteriores).

## Update — pitches + features + fixes (misma sesión)

- **Fix overviews**: Kokoro `ef_dora` rechazada → voz edge-tts `es-CL-CatalinaNeural` (instalado global, `python -m edge_tts`, rate +27/+28% ≈ duración igual). Captions re-sincronizados por silencedetect. QR nightlife ahora canvas sólido (od.js `qrBuild` reescrito — módulos edge-to-edge). Academy QR usa aún el renderer viejo (`<i>` grid) — portar el canvas fix si se nota.
- **Nuevo**: `pitches/productor|academia/` vA+vB (60-68s, voz Catalina/Lorenzo, música latina). `features/dancer|academia|productor/` (79.5-90s, SIN voz — usuario prefirió no narración, captions legibles, holds 1.0s+0.35s/palabra, ADDENDUM 2 en `_shared/context.md`).
- **Música latina**: `_shared/music-latin/` — Kevin MacLeod CC-BY (crédito obligatorio en share-copy). Tracks: No Frills Salsa, Comparsa (timba), Verano Sensual (bachata), Notanico Merengue. Comparsa no tenía cues → `features/productor/analyze_cues.py` los genera (numpy).
- **Regla**: usuario quiere ritmo LENTO legible — los videos de 24-27s del batch iban muy rápido para leer. Futuros videos: priorizar legibilidad sobre duración.
- Total: 33 videos en `brag-output-2026-10-16-211525/` (26 reels + 4 pitches + 3 features). INDEX.md actualizado.
