import { useApp } from '@/app/store';
import { clearRegistry } from '@/core/media/registry';

export function HomeScreen() {
  const goTo = useApp((s) => s.goTo);
  const resetWizard = useApp((s) => s.resetWizard);
  const resetUsage = useApp((s) => s.resetUsage);

  const newProject = () => {
    clearRegistry();
    resetWizard();
    resetUsage();
    goTo('wizard');
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
          <button className="btn" disabled title="Próximamente (H7)">
            Abrir .olyfilm
          </button>
        </div>
        <p className="home__note">
          Short vertical 9:16 · lectura del guion, subtítulos y B-roll con IA · sin servidor propio.
        </p>
      </div>
    </div>
  );
}
