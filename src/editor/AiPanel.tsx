import { useState } from 'react';
import { useApp } from '@/app/store';
import { planEdits } from '@/core/ai';
import { applyOps } from '@/core/edl/ops';
import type { OlyfilmProject } from '@/shared/types';

export function AiPanel({ project }: { project: OlyfilmProject }) {
  const { setProject, addTokens, setPlaying, provider, anthropicKey, openrouterKey } = useApp((s) => ({
    setProject: s.setProject,
    addTokens: s.addTokens,
    setPlaying: s.setPlaying,
    provider: s.provider,
    anthropicKey: s.anthropicKey,
    openrouterKey: s.openrouterKey,
  }));
  const ready = provider === 'openrouter' ? !!openrouterKey : !!anthropicKey;

  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!ready) {
    return (
      <div className="sidebar__block">
        <h3>Editar con IA</h3>
        <p className="muted">
          Cargá tu API key de <strong>{provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}</strong>{' '}
          en <strong>⚙ Ajustes</strong> (arriba a la derecha).
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar__block">
      <h3>Editar con IA</h3>
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
    </div>
  );
}
