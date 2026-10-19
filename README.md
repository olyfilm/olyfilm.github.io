# olyfilm

Del guion al reel: una SPA **100% estática** (sin backend propio) que, a partir de un
**guion en Markdown** y tu **material de video/audio**, arma un **short vertical 9:16**
listo para subir a Instagram Reels / TikTok. El core es IA y corre **en tu navegador**.

Sitio: **https://olyfilm.github.io/** · Target de ejecución: **iPhone 17+ (iOS 26 / Safari 26)**.

## Qué hace

1. **Wizard** — cargás el guion `.md` y la colección de video/audio.
2. **Cocinado** — analiza el material, **transcribe el audio con Whisper** (local, transformers.js)
   y arma el montaje (EDL). Con una API key de IA configurada, el LLM elige fragmentos y orden
   según el guion, los nombres de archivos y las transcripciones completas; los tokens aparecen
   en el contador. Sin clave o ante un error, conserva el montaje base. El detalle queda en
   «Detalle de la generación» del editor. No analiza imágenes ni descarga B-roll automáticamente.
3. **Editor** — preview en vivo 9:16 (WYSIWYG con el export), timeline con los clips y subtítulos,
   **edición por prompts con IA**, y **B-roll opcional de Pexels o Pixabay**.
4. **Export** — render a **MP4 H.264 + AAC** con WebCodecs (fallback ffmpeg.wasm donde no hay AAC nativo).
5. **Guardar / reabrir** `.olyfilm` (el material persiste en IndexedDB del navegador).

Toda la cadena es local: sin servidor propio, sin subir tu material a ningún lado.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo (Vite)
npm run build    # typecheck + build de producción a dist/
```

## API keys (BYO, opcionales)

Se cargan desde la UI y se guardan **sólo en el `localStorage` de tu navegador** — nunca en el
código ni en el repo:

- **Anthropic** — para la edición por prompts con IA. https://console.anthropic.com/
- **B-roll** — en ⚙ Ajustes elegí **Desactivado**, **Pexels** o **Pixabay**. Sólo necesitás la clave del proveedor elegido. Las claves se conservan al cambiar o desactivar el servicio.
  - Pexels: https://www.pexels.com/api/
  - Pixabay: https://pixabay.com/api/docs/

Sin proveedor configurado se usa sólo material propio. Los videos de Pixabay pueden ser horizontales y se recortan a 9:16. Los proyectos existentes de Pexels siguen siendo compatibles.

## Deploy

El workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) buildea y publica en
GitHub Pages en cada push a `main`. Requiere, una sola vez, poner la fuente de Pages en
**GitHub Actions** (Settings → Pages → Build and deployment → Source).

## Más

El diseño, las decisiones y el roadmap están en [PLAN.md](PLAN.md).

Pruebas del planner de cocinado: `node --test tests/cooking.test.mjs` (respuestas simuladas, sin consumir API).
