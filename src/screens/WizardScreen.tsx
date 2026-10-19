import { useMemo, useState } from 'react';
import { useApp } from '@/app/store';
import { parseGuion } from '@/core/guion/parser';

type Step = 1 | 2 | 3;

export function WizardScreen() {
  const [step, setStep] = useState<Step>(1);
  const { wizard, setGuion, addAssetFiles, removeAssetFile, goTo } = useApp((s) => ({
    wizard: s.wizard,
    setGuion: s.setGuion,
    addAssetFiles: s.addAssetFiles,
    removeAssetFile: s.removeAssetFile,
    goTo: s.goTo,
  }));

  const blocks = useMemo(
    () => (wizard.guionMarkdown ? parseGuion(wizard.guionMarkdown).blocks : []),
    [wizard.guionMarkdown],
  );

  const onGuionFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setGuion(text, file.name);
  };

  const onAssetFiles = (files: FileList | null) => {
    if (!files) return;
    addAssetFiles(Array.from(files));
  };

  const canGenerate = !!wizard.guionMarkdown && wizard.assetFiles.length > 0;

  return (
    <div className="screen wizard">
      <header className="wizard__head">
        <button className="btn btn--ghost" onClick={() => goTo('home')}>
          ← Inicio
        </button>
        <ol className="wizard__steps">
          <li className={step === 1 ? 'is-active' : step > 1 ? 'is-done' : ''}>1 · Guion</li>
          <li className={step === 2 ? 'is-active' : step > 2 ? 'is-done' : ''}>2 · Material</li>
          <li className={step === 3 ? 'is-active' : ''}>3 · Generar</li>
        </ol>
      </header>

      <div className="wizard__body">
        {step === 1 && (
          <section className="wizard__panel">
            <h2>Cargá el guion</h2>
            <p className="muted">Archivo Markdown (.md) generado por tu skill de guiones.</p>
            <label className="dropzone">
              <input
                type="file"
                accept=".md,text/markdown"
                onChange={(e) => onGuionFile(e.target.files?.[0])}
              />
              <span>{wizard.guionFileName ?? 'Elegir archivo .md'}</span>
            </label>
            {wizard.guionMarkdown && (
              <p className="wizard__ok">
                ✓ Guion leído · <strong>{blocks.length}</strong> bloques detectados en la tabla de tiempos.
              </p>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="wizard__panel">
            <h2>Cargá tu material</h2>
            <p className="muted">Videos y audios propios. Vivirán en tu navegador (IndexedDB).</p>
            <label className="dropzone">
              <input
                type="file"
                accept="video/*,audio/*"
                multiple
                onChange={(e) => onAssetFiles(e.target.files)}
              />
              <span>Agregar video/audio</span>
            </label>
            {wizard.assetFiles.length > 0 && (
              <ul className="filelist">
                {wizard.assetFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <span className="filelist__name">{f.name}</span>
                    <span className="filelist__size">{(f.size / 1_000_000).toFixed(1)} MB</span>
                    <button className="btn btn--ghost" onClick={() => removeAssetFile(i)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="wizard__panel">
            <h2>Todo listo</h2>
            <ul className="summary">
              <li>Guion: <strong>{wizard.guionFileName}</strong> ({blocks.length} bloques)</li>
              <li>Material: <strong>{wizard.assetFiles.length}</strong> archivos</li>
            </ul>
            <button
              className="btn btn--primary btn--big"
              disabled={!canGenerate}
              onClick={() => goTo('cooking')}
            >
              Generar ▸
            </button>
            {!canGenerate && <p className="muted">Faltan el guion o el material.</p>}
          </section>
        )}
      </div>

      <footer className="wizard__nav">
        <button className="btn" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
          Atrás
        </button>
        <button
          className="btn"
          disabled={step === 3 || (step === 1 && !wizard.guionMarkdown)}
          onClick={() => setStep((s) => (s + 1) as Step)}
        >
          Siguiente
        </button>
      </footer>
    </div>
  );
}
