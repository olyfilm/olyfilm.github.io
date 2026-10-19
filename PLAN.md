# olyfilm — Plan técnico

SPA 100% estática (GitHub Pages, sin backend propio) que, a partir de un **guion en Markdown** y una **colección de video/audio propios**, produce un **short vertical 9:16 listo para subir** a Instagram Reels / TikTok.

El core es IA: lee el guion, transcribe el audio a subtítulos, evalúa el material, corta, y complementa con B-roll de Pexels cuando falta material.

> Estado: planificación. Este documento es la fuente de verdad del diseño; se actualiza a medida que avanza.

---

## 1. Decisiones de arquitectura (cerradas)

| Área | Decisión | Por qué |
| --- | --- | --- |
| Hosting | Estático en GitHub Pages | Sin servidor propio que mantener. |
| Cerebro (LLM) | **BYO API key** multi-proveedor en `localStorage` | Calidad real sin backend. **Claude (Anthropic) directo** (soporta browser access). **OpenAI directo NO se puede** desde una SPA estática (bloquea CORS), así que los modelos de OpenAI (GPT-4o…) van **vía OpenRouter** (compatible con OpenAI, CORS ok). Selector de proveedor en ⚙ Ajustes. |
| Render final | **WebCodecs + muxer MP4** (`mp4-muxer`) | Encode/decode por hardware, rápido; ideal para reels cortos. ffmpeg.wasm queda como fallback evaluable. |
| Transcripción | **Whisper vía transformers.js** (WebGPU), fallback Web Speech API | En el browser, sin servicio externo. |
| B-roll | **Pexels API** directa (CORS ok) con API key del usuario | Simple y gratis. |
| Stack UI | **Vite + React + TypeScript**, estado con **Zustand** | Editor con timeline = estado complejo; conviene framework. |
| Persistencia assets | **IndexedDB** (blobs de video/audio) | Los archivos pueden ser grandes; no caben en localStorage. |
| Proyecto editable | **File System Access API** para guardar/abrir `*.olyfilm` | Retomar edición sin backend. |
| Preview | Composición en vivo (canvas + `<video>` + WebAudio) | No se renderiza a archivo hasta exportar. |

### "Sin backend" ≠ "sin servicios externos"
Quedan dos dependencias de red con clave del usuario: el **proveedor LLM** y **Pexels**. Ambas se llaman directo desde el browser. Riesgo conocido: la API key vive en el browser; aceptable para uso personal, a revisar si algún día se comparte la app.

---

## 2. Distinción clave: "cocinar" vs "exportar"

- **Cocinar** (pantalla de carga tras el wizard) produce el **proyecto editable**: el EDL, los subtítulos, el material evaluado y el B-roll descargado. **No** renderiza el MP4.
- **Preview** en el editor = composición en tiempo real en canvas; cero render a archivo.
- **Exportar** = render final a MP4 9:16 vía WebCodecs. Es el único paso pesado de video y ocurre on-demand.

Esto mantiene el editor fluido y deja el costo caro (encode) para el final.

---

## 3. Modelo de datos — el archivo `.olyfilm`

JSON versionado. Los blobs de video/audio **no** se embeben; se referencian y viven en IndexedDB (y opcionalmente se re-vinculan al abrir vía File System Access).

```jsonc
{
  "version": 1,
  "meta": { "name": "...", "createdAt": "...", "aspect": "9:16", "fps": 30, "resolution": [1080, 1920] },
  "guion": {
    "rawMarkdown": "...",
    "blocks": [ { "id", "tStart", "tEnd", "estructura", "locucion", "textoPantalla", "corte", "imagenEdicion" } ]
  },
  "assets": [
    { "id", "kind": "video|audio", "name", "origin": "local|pexels",
      "duration", "resolution", "blobRef": "<idb-key>", "pexelsId": null }
  ],
  "timeline": {
    "tracks": [
      { "kind": "video",     "clips": [ { "id", "assetId", "srcIn", "srcOut", "tlStart", "transform": { "crop9x16" } } ] },
      { "kind": "broll",     "clips": [ ... ] },
      { "kind": "overlay",   "clips": [ { "id", "text", "tlStart", "duration", "style" } ] },
      { "kind": "subtitles", "cues":  [ { "id", "start", "end", "text", "style" } ] },
      { "kind": "music",     "clips": [ { "id", "assetId", "tlStart", "gain" } ] }
    ]
  },
  "promptHistory": [ { "ts", "prompt", "summaryOfChange", "tokens": { "in", "out" } } ],
  "usage": { "totalIn": 0, "totalOut": 0, "byStage": { "cocinado": 0, "prompts": 0, "transcribe": 0 } },
  "renderSettings": { "codec": "avc", "bitrate": "...", "burnSubtitles": true }
}
```

El **EDL** (edit decision list) es `timeline`: qué trozo de qué asset va en qué momento. Todo lo que hace el editor y la IA es manipular esta estructura.

---

## 4. Flujo de la aplicación

```
[ Proyecto nuevo ]
      │
      ▼
┌─ WIZARD ───────────────────────────────┐
│ Paso 1: cargar guion (.md)  → parse      │
│ Paso 2: cargar colección de video/audio  │
│ Paso 3: botón "Generar"                   │
└───────────────────────────────────────┘
      │
      ▼
┌─ COCINANDO ────────────────────────────┐
│ spinners + log de pasos en vivo          │
│ (ver pipeline §5)                         │
└───────────────────────────────────────┘
      │
      ▼
┌─ EDITOR ──────────────────────────[ 🪙 12.4k tok ]┐
│  izquierda          centro                          │
│  ┌──────────┐   ┌──────────────────┐               │
│  │ sidebar  │   │   PREVIEW 9:16     │               │
│  │ - export │   │   (play en vivo)   │               │
│  │   .olyfilm│  └──────────────────┘               │
│  │ - prompt │   ┌──────────────────┐               │
│  │   textfield│ │  TIMELINE / carrete │              │
│  │ - colección│ │  tracks por chunks  │              │
│  │   +material│ └──────────────────┘               │
│  └──────────┘                                       │
│                      [ Exportar MP4 ]               │
└───────────────────────────────────────────────────┘
```

El **contador de tokens** (🪙) va fijo en una esquina (arriba a la derecha), visible en todas las pantallas que usan la API — así ves el consumo acumularse en vivo durante el cocinado y al mandar prompts. Al **exportar**, el resumen final muestra el **total de tokens de todo el proyecto** (desglosado por etapa) junto al MP4 generado.

---

## 5. Pipeline de "cocinado" (con eventos de progreso para el log)

Cada paso emite eventos (`status`, `detail`) que alimentan los spinners y el log de "lo que está pasando por detrás".

1. **Parsear guion** → estructura por tiempos (determinístico, sin LLM). Saca bloques, cortes, textos en pantalla, referencias.
2. **Inventariar material propio** → leer duración/resolución de cada clip; extraer pista de audio.
3. **Transcribir** audio de los clips con Whisper → segmentos con timestamps → candidatos de subtítulos.
4. **Matchear** bloques del guion ↔ clips propios (por los `[CORTE]` y las descripciones de "Imagen y edición"). El LLM elige qué clip encaja en cada bloque.
5. **Detectar huecos** → bloques sin material propio → query a Pexels (el LLM arma la búsqueda a partir de la descripción) → descargar candidatos a IndexedDB.
6. **Ensamblar EDL** → cortar clips a los tiempos del guion, ubicar textos en pantalla + subtítulos, colocar música si hay.
7. **Listo** → abrir el editor con el proyecto cargado y la preview reproducible.

El render a MP4 **no** está acá; ocurre al exportar.

---

## 6. Arquitectura de código (módulos)

```
src/
  app/              # router de pantallas, estado global (Zustand)
  wizard/           # 3 pasos + validación de inputs
  cooking/          # orquestador del pipeline §5 + UI de progreso
  editor/
    Preview.tsx     # compositor en vivo (canvas + video + WebAudio)
    Timeline.tsx    # carrete multi-track, drag/trim de clips
    Sidebar.tsx     # export/save, prompt, colección
  core/
    guion/          # parser de Markdown → blocks
    ai/             # cliente LLM (BYO key), prompts, planner de edición, medidor de tokens
    transcribe/     # Whisper (transformers.js) + fallback
    pexels/         # cliente API + descarga
    edl/            # modelo EDL, operaciones (split, trim, insert)
    render/         # WebCodecs encode + mp4-muxer
    project/        # serializar/parsear .olyfilm, IndexedDB, FS Access
  shared/           # tipos, utils
```

Regla: toda acción de edición (del usuario o de un prompt de IA) es una **operación sobre el EDL**. El LLM no toca el video; emite operaciones sobre `timeline`, que son las mismas que dispara la UI.

---

## 7. Contador de tokens (uso de API)

Como todo el razonamiento usa la API con clave del usuario, el consumo es visible y se contabiliza:

- **Fuente del dato:** cada respuesta del LLM trae `usage` (tokens de entrada y salida). El cliente en `core/ai` lee ese campo tras cada llamada y lo acumula; no se estima a mano.
- **Estado:** un contador en el store global (Zustand) con `totalIn`, `totalOut` y desglose por etapa (`cocinado`, `prompts`, `transcribe` si el proveedor cobra audio). Se persiste dentro del `.olyfilm` en `usage` (§3), así el acumulado sobrevive entre sesiones de edición.
- **UI en vivo:** badge 🪙 fijo arriba a la derecha, presente en cocinado y editor; se actualiza en cada llamada. Tooltip con el desglose por etapa.
- **Al exportar:** la pantalla de resumen del MP4 muestra el **total de tokens del proyecto** (in/out y por etapa). Opcional: estimación de costo en USD si se configura el precio por 1M tokens del proveedor.
- **Alcance:** cuenta tokens del LLM. Whisper local (transformers.js) no gasta tokens de API; si se usara un proveedor de transcripción pago, se suma en `byStage.transcribe`.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Render en browser lento / sin memoria | WebCodecs por hardware; reels cortos; mostrar progreso; fallback ffmpeg.wasm. |
| WebCodecs/WebGPU no soportado (Safari/Firefox viejos) | Detección de features + mensaje claro; degradar a Web Speech / ffmpeg.wasm. |
| Descarga del modelo Whisper pesada | Modelo base/small; cachear en el browser; permitir saltear transcripción. |
| API key expuesta en browser | Documentar que es uso personal; nunca commitear claves; `localStorage` + aviso. |
| Clips propios enormes | Trabajar con referencias + IndexedDB; no embeber en `.olyfilm`. |
| **Encode AAC no disponible en Linux/Firefox/iOS<26** (confirmado: Chrome 153 Linux reporta AAC sin soporte; `AudioEncoder` recién en Safari 26) | ✅ **Resuelto.** AAC **nativo** donde está (iPhone 17+ es el target y lo tiene); **fallback ffmpeg.wasm lazy** (dynamic import) que codifica AAC + muxea con `-c:v copy` fuera del target. El core de ~32 MB va en un chunk aparte que el target nunca baja. Validado con ffprobe. |

> **Target de ejecución:** iPhone 17 en adelante (iOS 26 / Safari 26). Eso garantiza WebCodecs completo (video + audio AAC nativos). Los fallbacks (ffmpeg.wasm) son sólo para desarrollo en desktop y navegadores fuera del target.
| Re-vincular assets al abrir `.olyfilm` en otra máquina | Guardar hash/nombre; pedir re-seleccionar carpeta si faltan blobs. |

---

## 9. Roadmap por hitos

- **H0 — Scaffold.** ✅ Vite + React + TS, router de pantallas (home/wizard/cooking/editor), estado base (Zustand), parser de guion, badge de tokens, tipos del `.olyfilm`, workflow de deploy a Pages.
- **H1 — Wizard + parser de guion.** ✅ (parcial) 3 pasos, carga de .md y archivos, parse a `blocks`, **cocinado real** (inventario de material con duración/resolución reales, sin tokens falsos). Assets en un **registro en memoria** (object URLs); la persistencia en IndexedDB se difiere a H7.
- **H2 — Spike de render (el eslabón riesgoso).** ✅ Cortar clips + quemar subtítulos + **audio** + exportar MP4 9:16 con WebCodecs + mp4-muxer. **Validado end-to-end**: produce un MP4 h264/avc1 1080×1920 @30fps con pista de audio, bien formado (verificado con ffprobe). Camino técnico confirmado.
  - **Audio ✅**: se extrae el PCM de los clips (`decodeAudioData`), se reubica en la timeline y se codifica a **AAC**. **Nativo** con `AudioEncoder` en el target (iPhone 17+ / iOS 26) y Win/Mac/Android; **fallback ffmpeg.wasm lazy** (dynamic import, chunk aparte de ~32 MB que el target nunca descarga) para Linux/Firefox/iOS<26. **Validado end-to-end**: ffprobe confirma MP4 con `aac (LC) 48kHz stereo`. Opus descartado. Falta: pista de música separada y niveles.
- **H3 — Editor base.** ✅ **Preview en vivo** (canvas compositor compartido con el export → WYSIWYG, con audio, play/pausa y scrub) + **timeline multi-track leyendo el EDL real** (clips posicionados por tiempo, playhead, click-to-seek). Export desde el EDL. Validado end-to-end manejando la app por UI (Playwright): cocinado→EDL, preview no-negro, MP4 h264+AAC con ffprobe. ⚠️ Preview en iOS (drawImage de `<video>` fuera del DOM, autoplay con audio) a confirmar en dispositivo.
- **H4 — Cocinado real.** ✅ (transcripción) Transcripción **real del audio con Whisper local** (transformers.js, `Xenova/whisper-tiny` multilingüe, lazy chunk) → subtítulos con timestamps, con fallback a los del guion. Corre en WebGPU/WASM sin tokens de API. **Validado**: transcribió un sample de voz correctamente en Chromium headless (WASM/CPU). Falta: matching inteligente clip↔bloque (parte de H5) y subtítulos a nivel frase/palabra.
- **H5 — IA de edición.** ✅ Cliente LLM **BYO key** (SDK `@anthropic-ai/sdk` en el browser con `dangerouslyAllowBrowser`, lazy chunk; modelo seleccionable, default `claude-opus-5-5`). Panel "Editar con IA" en el sidebar: el prompt + el EDL actual → el planner pide **operaciones sobre el EDL** (`core/edl/ops`: setSubtitleText, removeClip, reorderClips, trimClip, shiftSubtitles…) → `applyOps` las aplica. **Tokens reales** sumados al badge 🪙 (`usage` de la respuesta) y al `promptHistory`. **Validado**: 9 casos de `applyOps`/`parseOps` (headless) + camino browser→Anthropic (401 limpio, CORS ok). Falta probar una edición real con API key del usuario.
- **H6 — Pexels.** ✅ (manual) Cliente Pexels **BYO key** (CORS directo), búsqueda vertical + descarga de B-roll. Panel "B-roll (Pexels)" en el editor: buscar → grilla de thumbnails → agregar al proyecto (`appendVideoClip`: registra, probea y appendea el clip a la timeline). La colección ahora lista los assets reales. **Validado**: camino browser→Pexels (401 limpio, CORS ok) + build. Falta: detección automática de huecos en el cocinado (que el planner pida B-roll) y prueba con key real.
- **H7 — Proyecto `.olyfilm`.** ✅ Guardar/abrir el `.olyfilm` (JSON) + **blobs persistidos en IndexedDB** (`core/storage/idb`). Reabrir en el mismo navegador **rehidrata el material** desde IndexedDB; los que falten (otra máquina) se marcan ⚠ en la colección y se **re-vinculan** con un file picker. Save/open por descarga + `<input file>` (sin File System Access API, para que ande en Safari/iOS). **Validado end-to-end**: cocinar → exportar → recargar la página → abrir → timeline rehidratada, 0 faltantes, preview dibuja.
- **H8 — Pulido.** 🚧 **Estilos de subtítulos** (4 presets: Clásico/Caja/Amarillo/Centrado, idénticos en preview y export; seleccionables en el editor y vía la op `setSubtitleStyle` de la IA) ✅ · **Presets de export** (1080×1920 alta / 720×1280 liviana) ✅ · **Settings global** ⚙ (gear fijo junto al badge, visible en todas las pantallas; modal para las API keys de Anthropic/Pexels + modelo, en localStorage; los paneles del editor leen esa config del store) ✅ · Validado por UI. Falta: pista de música, subtítulos a nivel frase/palabra, detección automática de huecos para Pexels, QA en iPhone real.

Orden recomendado para arrancar: **H0 → H2** (scaffold y después validar el render, que es lo que puede matar el proyecto), antes de invertir en UI fina.

---

## 10. Decisiones abiertas

- ¿Proveedor LLM por defecto? (Anthropic Claude recomendado; dejar el cliente agnóstico.)
- ¿Modelo Whisper por defecto (base vs small) y si se permite saltear transcripción?
- Estilos de subtítulo: ¿presets fijos o editables por prompt?
- ¿Música: sólo del material propio o también biblioteca (Pexels no da música; evaluar fuente)?
- Nombre/branding y favicon de la app.
