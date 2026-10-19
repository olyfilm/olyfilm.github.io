import { useEffect, useRef } from 'react';
import { useApp } from '@/app/store';
import { Spinner } from '@/components/Spinner';
import { parseGuion } from '@/core/guion/parser';
import { createProject } from '@/core/project';

interface Stage {
  key: string;
  label: string;
  detail: string;
  // tokens simulados hasta que H4/H5 traigan el consumo real
  tokens?: [number, number];
}

const PIPELINE: Stage[] = [
  { key: 'parse', label: 'Parseando el guion', detail: 'Tabla de tiempos → bloques' },
  { key: 'inventory', label: 'Inventariando material', detail: 'Duración y resolución de cada clip' },
  { key: 'transcribe', label: 'Transcribiendo audio', detail: 'Whisper local → subtítulos' },
  { key: 'match', label: 'Asociando clips al guion', detail: 'IA elige qué clip va en cada bloque', tokens: [1800, 400] },
  { key: 'gaps', label: 'Detectando huecos', detail: 'Bloques sin material → B-roll de Pexels', tokens: [900, 150] },
  { key: 'edl', label: 'Ensamblando el montaje', detail: 'Cortes, textos en pantalla y subtítulos' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CookingScreen() {
  const { wizard, cookLog, pushCookLog, clearCookLog, addTokens, setProject, goTo } = useApp((s) => ({
    wizard: s.wizard,
    cookLog: s.cookLog,
    pushCookLog: s.pushCookLog,
    clearCookLog: s.clearCookLog,
    addTokens: s.addTokens,
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
      const guion = parseGuion(wizard.guionMarkdown ?? '');

      for (const stage of PIPELINE) {
        pushCookLog(stage.label, stage.detail);
        await sleep(650);
        if (stage.tokens) addTokens('cocinado', stage.tokens[0], stage.tokens[1]);
      }

      const name = wizard.guionFileName?.replace(/\.md$/i, '') ?? 'Proyecto sin título';
      setProject(createProject({ name, guion }));
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
        <p className="muted">Leyendo el guion, transcribiendo y armando el montaje.</p>

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
