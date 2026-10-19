import { useState } from 'react';
import { useApp } from '@/app/store';
import { serializeProject } from '@/core/project';
import {
  webCodecsSupported,
  renderSpike,
  buildSpikeTimeline,
  type RenderProgress,
} from '@/core/render';

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
  const { project, wizard, usage, goTo } = useApp((s) => ({
    project: s.project,
    wizard: s.wizard,
    usage: s.usage,
    goTo: s.goTo,
  }));
  const [prompt, setPrompt] = useState('');
  const [render, setRender] = useState<RenderState>({ status: 'idle' });

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

  const videoFiles = wizard.assetFiles.filter((f) => f.type.startsWith('video'));

  const exportMp4 = async () => {
    if (!webCodecsSupported()) {
      setRender({ status: 'error', message: 'Este navegador no soporta WebCodecs. Probá Chrome/Edge.' });
      return;
    }
    if (videoFiles.length === 0) {
      setRender({ status: 'error', message: 'No hay clips de video en la colección para renderizar.' });
      return;
    }
    const { segments, subtitles } = buildSpikeTimeline(videoFiles, project.guion.blocks);
    setRender({ status: 'rendering', progress: { frame: 0, totalFrames: 1, stage: 'Iniciando' } });
    try {
      const [w, h] = project.meta.resolution;
      const result = await renderSpike({
        segments,
        subtitles,
        width: w,
        height: h,
        fps: project.meta.fps,
        bitrate: 8_000_000,
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

        <div className="sidebar__block">
          <h3>Editar con IA</h3>
          <textarea
            className="prompt-field"
            placeholder="Ej: acortá el gancho y subí el volumen de la música…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <button className="btn btn--block" disabled={!prompt.trim()} title="Próximamente (H5)">
            Aplicar
          </button>
        </div>

        <div className="sidebar__block sidebar__block--grow">
          <h3>Colección ({wizard.assetFiles.length})</h3>
          <ul className="collection">
            {wizard.assetFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="collection__item">
                <span className="collection__icon">{f.type.startsWith('audio') ? '🎵' : '🎬'}</span>
                <span className="collection__name">{f.name}</span>
              </li>
            ))}
          </ul>
          <label className="btn btn--block">
            + Agregar material
            <input type="file" accept="video/*,audio/*" multiple hidden
              onChange={(e) => e.target.files && useApp.getState().addAssetFiles(Array.from(e.target.files))}
            />
          </label>
        </div>
      </aside>

      {/* Centro: preview */}
      <main className="editor__main">
        <div className="preview">
          <div className="preview__frame">
            <span className="preview__placeholder">Vista previa 9:16</span>
          </div>
        </div>

        <div className="editor__transport">
          <button className="btn" disabled title="Próximamente (H3)">▶ Reproducir</button>
          <button
            className="btn btn--primary"
            onClick={exportMp4}
            disabled={render.status === 'rendering'}
          >
            ⬇ Exportar MP4 · {totalTokens} tok
          </button>
        </div>

        {/* Timeline / carrete */}
        <div className="timeline">
          {(['video', 'broll', 'overlay', 'subtitles', 'music'] as const).map((track) => (
            <div key={track} className="timeline__track">
              <span className="timeline__label">{track}</span>
              <div className="timeline__lane">
                {project.guion.blocks.map((b) => (
                  <div
                    key={b.id}
                    className={`chunk chunk--${track}`}
                    style={{ flexGrow: Math.max(1, b.tEnd - b.tStart) }}
                    title={`${b.tStart}–${b.tEnd}s · ${b.estructura}`}
                  >
                    {track === 'subtitles' ? b.locucion.slice(0, 18) : b.estructura}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
