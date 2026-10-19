import { useState } from 'react';
import { useApp } from '@/app/store';
import { appendVideoClip, serializeProject } from '@/core/project';
import { webCodecsSupported, renderSpike, type RenderProgress } from '@/core/render';
import { edlToRenderSegments, subtitleStyleName, totalTimelineDuration } from '@/core/edl';
import { applyOps } from '@/core/edl/ops';
import { SUBTITLE_STYLES } from '@/core/compositor';
import { getEntry, registerAsset } from '@/core/media/registry';
import { putBlob } from '@/core/storage/idb';
import { Preview } from '@/editor/Preview';
import { Timeline, fmtTime } from '@/editor/Timeline';
import { AiPanel } from '@/editor/AiPanel';
import { BrollPanel } from '@/editor/BrollPanel';

const QUALITY = {
  '1080': { w: 1080, h: 1920, bitrate: 8_000_000, label: '1080×1920 (alta)' },
  '720': { w: 720, h: 1280, bitrate: 4_000_000, label: '720×1280 (liviana)' },
} as const;

type RenderState =
  | { status: 'idle' }
  | { status: 'rendering'; progress: RenderProgress }
  | {
      status: 'done';
      url: string;
      sizeMB: number;
      ms: number;
      codec: string;
      audio: 'aac' | 'none';
      audioEngine: 'native' | 'wasm' | null;
    }
  | { status: 'error'; message: string };

export function EditorScreen() {
  const { project, usage, playing, playhead, setPlaying, setProject, goTo } = useApp((s) => ({
    project: s.project,
    usage: s.usage,
    playing: s.playing,
    playhead: s.playhead,
    setPlaying: s.setPlaying,
    setProject: s.setProject,
    goTo: s.goTo,
  }));
  const cookLog = useApp((s) => s.cookLog);
  const brollProvider = useApp((s) => s.brollProvider);
  const [render, setRender] = useState<RenderState>({ status: 'idle' });
  const [quality, setQuality] = useState<'1080' | '720'>('1080');

  if (!project) {
    return (
      <div className="screen editor">
        <p>No hay proyecto cargado.</p>
        <button className="btn" onClick={() => goTo('home')}>Inicio</button>
      </div>
    );
  }

  const exportOlyfilm = () => {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.meta.name}.olyfilm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalTokens = usage.totalIn + usage.totalOut;
  const total = totalTimelineDuration(project.timeline);
  const hasClips = project.timeline.video.length > 0;

  const exportMp4 = async () => {
    if (!webCodecsSupported()) {
      setRender({ status: 'error', message: 'Este navegador no soporta WebCodecs. Probá Chrome/Edge.' });
      return;
    }
    const { segments, subtitles } = edlToRenderSegments(project.timeline);
    if (segments.length === 0) {
      setRender({ status: 'error', message: 'El montaje no tiene clips de video para renderizar.' });
      return;
    }
    setPlaying(false);
    setRender({ status: 'rendering', progress: { frame: 0, totalFrames: 1, stage: 'Iniciando' } });
    try {
      const q = QUALITY[quality];
      const result = await renderSpike({
        segments,
        subtitles,
        width: q.w,
        height: q.h,
        fps: project.meta.fps,
        bitrate: q.bitrate,
        onProgress: (progress) => setRender({ status: 'rendering', progress }),
      });
      setRender({
        status: 'done',
        url: URL.createObjectURL(result.blob),
        sizeMB: result.blob.size / 1_000_000,
        ms: result.durationMs,
        codec: result.codec,
        audio: result.audio,
        audioEngine: result.audioEngine,
      });
    } catch (e) {
      setRender({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const closeRender = () => {
    if (render.status === 'done') URL.revokeObjectURL(render.url);
    setRender({ status: 'idle' });
  };

  const addLocal = async (files: FileList | null) => {
    if (!files) return;
    let p = project;
    for (const f of Array.from(files)) {
      if (f.type.startsWith('video')) p = await appendVideoClip(p, f, 'local');
    }
    setProject(p);
  };

  const relink = async (assetId: string, file: File | undefined) => {
    if (!file) return;
    registerAsset(assetId, file);
    await putBlob(assetId, file).catch(() => {});
    setProject({ ...project }); // forzar re-render del preview/timeline
  };

  const setSubStyle = (name: string) => {
    const { timeline } = applyOps(project.timeline, [{ op: 'setSubtitleStyle', style: name }]);
    setProject({ ...project, timeline });
  };

  return (
    <div className="screen editor">
      {/* Barra izquierda */}
      <aside className="editor__sidebar">
        <div className="sidebar__block">
          <h3>Proyecto</h3>
          <p className="muted">{project.meta.name}</p>
          <button className="btn btn--block" onClick={exportOlyfilm}>
            💾 Exportar .olyfilm
          </button>
          <button className="btn btn--block" disabled title="Próximamente (H7)">
            Abrir .olyfilm
          </button>
        </div>

        <AiPanel project={project} />

        {project.timeline.subtitles.length > 0 && (
          <div className="sidebar__block">
            <h3>Subtítulos</h3>
            <select
              className="ai-model"
              value={subtitleStyleName(project.timeline)}
              onChange={(e) => setSubStyle(e.target.value)}
            >
              {Object.values(SUBTITLE_STYLES).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {cookLog.length > 0 && (
          <details className="sidebar__block">
            <summary>Detalle de la generación</summary>
            {cookLog.map((entry, i) => <p className="muted" key={i}><strong>{entry.stage}:</strong> {entry.detail}</p>)}
          </details>
        )}

        <BrollPanel key={brollProvider} project={project} />

        <div className="sidebar__block sidebar__block--grow">
          <h3>Colección ({project.assets.length})</h3>
          <ul className="collection">
            {project.assets.map((a) => {
              const missing = !getEntry(a.id);
              return (
                <li key={a.id} className={`collection__item${missing ? ' is-missing' : ''}`}>
                  <span className="collection__icon">
                    {a.kind === 'audio' ? '🎵' : a.origin === 'pixabay' ? '🌄' : a.origin === 'pexels' ? '🅿️' : '🎬'}
                  </span>
                  <span className="collection__name">{a.name}</span>
                  {missing && (
                    <label className="collection__relink" title="Media faltante: re-vincular">
                      ⚠
                      <input
                        type="file"
                        accept="video/*"
                        hidden
                        onChange={(e) => relink(a.id, e.target.files?.[0])}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          <label className="btn btn--block">
            + Agregar material
            <input
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={(e) => addLocal(e.target.files)}
            />
          </label>
        </div>
      </aside>

      {/* Centro: preview */}
      <main className="editor__main">
        <Preview project={project} />

        <div className="editor__transport">
          <button
            className="btn"
            onClick={() => setPlaying(!playing)}
            disabled={!hasClips}
          >
            {playing ? '⏸ Pausar' : '▶ Reproducir'}
          </button>
          <span className="editor__time">
            {fmtTime(playhead)} / {fmtTime(total)}
          </span>
          <select
            className="editor__quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as '1080' | '720')}
            title="Calidad de export"
          >
            {Object.entries(QUALITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn--primary"
            onClick={exportMp4}
            disabled={render.status === 'rendering' || !hasClips}
          >
            ⬇ Exportar MP4 · {totalTokens} tok
          </button>
        </div>

        <Timeline project={project} />
      </main>

      {render.status !== 'idle' && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__card">
            {render.status === 'rendering' && (
              <>
                <h3>Exportando MP4…</h3>
                <p className="muted">{render.progress.stage}</p>
                <div className="progress">
                  <div
                    className="progress__bar"
                    style={{ width: `${Math.round((render.progress.frame / render.progress.totalFrames) * 100)}%` }}
                  />
                </div>
                <p className="muted">
                  {render.progress.frame} / {render.progress.totalFrames} frames
                </p>
              </>
            )}

            {render.status === 'done' && (
              <>
                <h3>✓ Short listo</h3>
                <video className="modal__preview" src={render.url} controls autoPlay loop />
                <ul className="summary">
                  <li>Tamaño: <strong>{render.sizeMB.toFixed(1)} MB</strong></li>
                  <li>Tiempo de render: <strong>{(render.ms / 1000).toFixed(1)} s</strong></li>
                  <li>Códec: <strong>{render.codec}</strong></li>
                  <li>
                    Audio: <strong>{render.audio === 'none' ? 'sin audio' : 'AAC'}</strong>
                    {render.audioEngine === 'wasm' && (
                      <span className="muted"> · vía WASM (sin AAC nativo)</span>
                    )}
                    {render.audioEngine === 'native' && <span className="muted"> · nativo</span>}
                  </li>
                  <li>Tokens del proyecto: <strong>{totalTokens}</strong></li>
                </ul>
                <div className="modal__actions">
                  <a className="btn btn--primary" href={render.url} download={`${project.meta.name}.mp4`}>
                    Descargar MP4
                  </a>
                  <button className="btn" onClick={closeRender}>Cerrar</button>
                </div>
              </>
            )}

            {render.status === 'error' && (
              <>
                <h3>No se pudo exportar</h3>
                <p className="muted">{render.message}</p>
                <div className="modal__actions">
                  <button className="btn" onClick={closeRender}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
