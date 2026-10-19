import { useRef, useState } from 'react';
import { useApp } from '@/app/store';
import { clearRegistry } from '@/core/media/registry';
import { parseProject, rehydrateProject } from '@/core/project';

export function HomeScreen() {
  const { goTo, resetWizard, resetUsage, setProject } = useApp((s) => ({
    goTo: s.goTo,
    resetWizard: s.resetWizard,
    resetUsage: s.resetUsage,
    setProject: s.setProject,
  }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const newProject = () => {
    clearRegistry();
    resetWizard();
    resetUsage();
    goTo('wizard');
  };

  const openProject = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const project = parseProject(await file.text());
      clearRegistry();
      resetUsage();
      const missing = await rehydrateProject(project);
      setProject(project);
      goTo('editor');
      if (missing.length > 0) {
        setError(null);
        // los faltantes se re-vinculan desde la colección del editor
      }
    } catch (e) {
      setError(`No se pudo abrir: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="screen home">
      <div className="home__hero">
        <h1 className="home__logo">olyfilm</h1>
        <p className="home__tagline">Del guion al reel, todo en tu navegador.</p>
        <div className="home__actions">
          <button className="btn btn--primary" onClick={newProject}>
            Nuevo proyecto
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Abrir .olyfilm
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".olyfilm,application/json"
            hidden
            onChange={(e) => openProject(e.target.files?.[0])}
          />
        </div>
        {error && <p className="home__error">{error}</p>}
        <p className="home__note">
          Short vertical 9:16 · lectura del guion, subtítulos y B-roll con IA · sin servidor propio.
        </p>
      </div>
    </div>
  );
}
