import { useState } from 'react';
import { useApp } from '@/app/store';
import { MODELS, getApiKey, getModel, planEdits, setApiKey, setModel } from '@/core/ai';
import { applyOps } from '@/core/edl/ops';
import type { OlyfilmProject } from '@/shared/types';

export function AiPanel({ project }: { project: OlyfilmProject }) {
  const { setProject, addTokens, setPlaying } = useApp((s) => ({
    setProject: s.setProject,
    addTokens: s.addTokens,
    setPlaying: s.setPlaying,
  }));

  const [hasKey, setHasKey] = useState(!!getApiKey());
  const [keyInput, setKeyInput] = useState('');
  const [model, setModelState] = useState(getModel());
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveKey = () => {
    if (!keyInput.trim()) return;
    setApiKey(keyInput.trim());
    setHasKey(true);
    setKeyInput('');
  };

  const changeModel = (v: string) => {
    setModel(v);
    setModelState(v);
  };

  const apply = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setStatus('…');
    setPlaying(false);
    try {
      const { ops, usage } = await planEdits(project, prompt, { onStatus: setStatus });
      addTokens('prompts', usage.in, usage.out);
      if (ops.length === 0) {
        setStatus('Sin cambios sugeridos.');
      } else {
        const { timeline, applied, warnings } = applyOps(project.timeline, ops);
        setProject({
          ...project,
          timeline,
          promptHistory: [
            ...project.promptHistory,
            {
              ts: new Date().toISOString(),
              prompt,
              summaryOfChange: `${applied} operaciones`,
              tokens: usage,
            },
          ],
        });
        setStatus(`✓ ${applied} cambios${warnings.length ? ` · ${warnings.length} avisos` : ''}`);
        setPrompt('');
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="sidebar__block">
        <h3>Editar con IA</h3>
        <p className="muted">Pegá tu API key de Anthropic (se guarda sólo en este navegador).</p>
        <input
          className="ai-key"
          type="password"
          placeholder="sk-ant-…"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        <button className="btn btn--block" onClick={saveKey} disabled={!keyInput.trim()}>
          Guardar key
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar__block">
      <h3>Editar con IA</h3>
      <select className="ai-model" value={model} onChange={(e) => changeModel(e.target.value)}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <textarea
        className="prompt-field"
        placeholder="Ej: borrá el último subtítulo y acortá el primer clip a 3 segundos…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={busy}
      />
      <button className="btn btn--block" onClick={apply} disabled={!prompt.trim() || busy}>
        {busy ? 'Aplicando…' : 'Aplicar'}
      </button>
      {status && <p className="ai-status muted">{status}</p>}
      <button
        className="btn btn--ghost ai-changekey"
        onClick={() => {
          setApiKey('');
          setHasKey(false);
        }}
      >
        cambiar key
      </button>
    </div>
  );
}
