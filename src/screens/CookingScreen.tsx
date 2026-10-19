import { useEffect, useRef } from 'react';
import { useApp } from '@/app/store';
import { Spinner } from '@/components/Spinner';
import { parseGuion } from '@/core/guion/parser';
import { createProject } from '@/core/project';
import { buildTimelineFromAssets, edlToRenderSegments } from '@/core/edl';
import { probeVideo, registerAsset } from '@/core/media/registry';
import { putBlob } from '@/core/storage/idb';
import { transcribeTimeline } from '@/core/transcribe';
import { getProviderKey, getModel } from '@/core/ai';
import { planCooking, type SourceTranscript } from '@/core/ai/cooking';
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
        await putBlob(id, file).catch(() => {}); // persistir para reabrir
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
          blobRef: id,
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

      // Transcribir las fuentes completas: el planner puede elegir cualquier fragmento.
      const transcripts: SourceTranscript[] = [];
      for (const asset of videoAssets) {
        if (!asset.duration) continue;
        try {
          const entryTimeline = { ...timeline, video: [{ id: asset.id, assetId: asset.id,
            srcIn: 0, srcOut: asset.duration, tlStart: 0, transform: { crop9x16: true } }] };
          const { segments } = edlToRenderSegments(entryTimeline);
          pushCookLog('Transcribiendo audio', `${asset.name} · Whisper local (sin tokens de API)`);
          let lastPct = -1;
          const cues = await transcribeTimeline(segments, asset.duration, {
            language: 'spanish',
            onProgress: (p) => {
              if (p.stage === 'transcribe') { pushCookLog('Transcribiendo audio', p.detail); return; }
              if (p.ratio == null || !/\.onnx/.test(p.detail)) return;
              const pct = Math.floor(p.ratio * 100);
              if (pct >= lastPct + 10 || pct === 100) {
                lastPct = pct; pushCookLog('Descargando modelo', `${pct}%`);
              }
            },
          });
          transcripts.push({ assetId: asset.id, cues });
          pushCookLog('Transcripción lista', `${asset.name}: ${cues.length} segmentos`);
        } catch (e) {
          pushCookLog('Transcripción no disponible', `${asset.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const baseCues = timeline.video.flatMap((clip) =>
        (transcripts.find((t) => t.assetId === clip.assetId)?.cues ?? []).flatMap((cue) => {
          const start = Math.max(cue.start, clip.srcIn), end = Math.min(cue.end, clip.srcOut);
          return end > start ? [{ ...cue, id: `${clip.id}_${cue.id}`,
            start: clip.tlStart + start - clip.srcIn, end: clip.tlStart + end - clip.srcIn }] : [];
        }));
      if (baseCues.length) timeline.subtitles = baseCues;
      await sleep(200);

      const name = wizard.guionFileName?.replace(/\.md$/i, '') ?? 'Proyecto sin título';
      const project = createProject({ name, guion });
      project.assets = assets;
      project.timeline = timeline;
      if (getProviderKey()) {
        pushCookLog('Montaje con IA', `Modelo: ${getModel()} · analizando guion y transcripciones`);
        try {
          const plan = await planCooking(project, transcripts, {
            onStatus: (status) => pushCookLog('Montaje con IA', status),
            onUsage: (usage) => {
              useApp.getState().addTokens('cocinado', usage.in, usage.out);
              project.usage = useApp.getState().usage;
              pushCookLog('Consumo de IA', `${usage.in} tokens de entrada · ${usage.out} de salida`);
            },
          });
          project.timeline = plan.timeline;
          project.promptHistory.push({ ts: new Date().toISOString(), prompt: 'Montaje automático desde el guion',
            summaryOfChange: plan.summary, tokens: { in: project.usage.totalIn, out: project.usage.totalOut } });
          pushCookLog('Montaje con IA listo', plan.summary);
        } catch (e) {
          pushCookLog('No se pudo montar con IA', `${e instanceof Error ? e.message : String(e)} · se conserva el montaje base`);
        }
      } else {
        pushCookLog('Montaje sin LLM', 'Falta configurar la API key en Ajustes. Se usa el montaje base; Whisper no consume tokens de API.');
      }
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
