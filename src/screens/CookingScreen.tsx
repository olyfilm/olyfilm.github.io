import { useEffect, useRef } from 'react';
import { useApp } from '@/app/store';
import { Spinner } from '@/components/Spinner';
import { parseGuion } from '@/core/guion/parser';
import { createProject } from '@/core/project';
import { buildTimelineFromAssets, edlToRenderSegments, totalTimelineDuration } from '@/core/edl';
import { probeVideo, registerAsset } from '@/core/media/registry';
import { transcribeTimeline } from '@/core/transcribe';
import type { Asset } from '@/shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
  (crypto.randomUUID?.() ?? `a${Date.now()}${Math.random().toString(36).slice(2)}`);

export function CookingScreen() {
  const { wizard, cookLog, pushCookLog, clearCookLog, setProject, goTo } = useApp((s) => ({
    wizard: s.wizard,
    cookLog: s.cookLog,
    pushCookLog: s.pushCookLog,
    clearCookLog: s.clearCookLog,
    setProject: s.setProject,
    goTo: s.goTo,
  }));
  const logRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode monta dos veces en dev
    started.current = true;

    (async () => {
      clearCookLog();

      // 1. Guion
      const guion = parseGuion(wizard.guionMarkdown ?? '');
      pushCookLog('Analizando el guion', `${guion.blocks.length} bloques detectados`);
      await sleep(350);

      // 2. Inventario del material (duración/resolución reales)
      const assets: Asset[] = [];
      const videoAssets: Asset[] = [];
      for (const file of wizard.assetFiles) {
        const id = uid();
        registerAsset(id, file);
        const kind: Asset['kind'] = file.type.startsWith('audio') ? 'audio' : 'video';
        let duration: number | null = null;
        let resolution: [number, number] | null = null;
        if (kind === 'video') {
          try {
            const p = await probeVideo(id);
            duration = Math.round(p.duration * 100) / 100;
            resolution = [p.width, p.height];
          } catch {
            /* clip ilegible: queda sin metadata */
          }
        }
        const asset: Asset = {
          id,
          kind,
          name: file.name,
          origin: 'local',
          duration,
          resolution,
          blobRef: null,
          pexelsId: null,
        };
        assets.push(asset);
        if (kind === 'video') videoAssets.push(asset);
        pushCookLog(
          'Analizando material',
          `${file.name}${duration ? ` · ${duration}s` : ''}`,
        );
        await sleep(120);
      }

      // 3. Montaje base (EDL determinístico desde el guion)
      pushCookLog('Armando el montaje', 'Cortes y subtítulos desde el guion');
      const timeline = buildTimelineFromAssets(videoAssets, guion.blocks);
      await sleep(200);

      // 4. Transcripción real del audio → subtítulos (Whisper local)
      try {
        const { segments } = edlToRenderSegments(timeline);
        const total = totalTimelineDuration(timeline);
        pushCookLog('Transcribiendo audio', 'Whisper local…');
        let lastPct = -1;
        const cues = await transcribeTimeline(segments, total, {
          language: 'spanish',
          onProgress: (p) => {
            if (p.stage === 'transcribe') {
              pushCookLog('Transcribiendo audio', p.detail);
              return;
            }
            // descarga: sólo el modelo grande (.onnx) y en pasos de ~10%
            if (p.ratio == null || !/\.onnx/.test(p.detail)) return;
            const pct = Math.floor(p.ratio * 100);
            if (pct >= lastPct + 10 || pct === 100) {
              lastPct = pct;
              pushCookLog('Descargando modelo', `${pct}%`);
            }
          },
        });
        if (cues.length > 0) {
          timeline.subtitles = cues;
          pushCookLog('Subtítulos listos', `${cues.length} segmentos desde el audio`);
        } else {
          pushCookLog('Sin voz detectada', 'uso los subtítulos del guion');
        }
      } catch {
        pushCookLog('Transcripción no disponible', 'uso los subtítulos del guion');
      }
      await sleep(200);

      const name = wizard.guionFileName?.replace(/\.md$/i, '') ?? 'Proyecto sin título';
      const project = createProject({ name, guion });
      project.assets = assets;
      project.timeline = timeline;
      setProject(project);

      pushCookLog('Listo', 'Abriendo el editor');
      await sleep(400);
      goTo('editor');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [cookLog]);

  return (
    <div className="screen cooking">
      <div className="cooking__center">
        <Spinner size={56} />
        <h2>Cocinando tu short…</h2>
        <p className="muted">Analizando el guion y el material, y armando el montaje.</p>

        <div className="cooking__log" ref={logRef}>
          {cookLog.map((l, i) => (
            <div key={i} className="cooking__line">
              <span className="cooking__dot" />
              <span className="cooking__stage">{l.stage}</span>
              <span className="cooking__detail">{l.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
