import { useState } from 'react';
import { useApp } from '@/app/store';
import {
  downloadPexels,
  getPexelsKey,
  searchPexels,
  setPexelsKey,
  type PexelsVideo,
} from '@/core/pexels';
import { appendVideoClip } from '@/core/project';
import type { OlyfilmProject } from '@/shared/types';

export function PexelsPanel({ project }: { project: OlyfilmProject }) {
  const setProject = useApp((s) => s.setProject);

  const [hasKey, setHasKey] = useState(!!getPexelsKey());
  const [keyInput, setKeyInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PexelsVideo[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  const saveKey = () => {
    if (!keyInput.trim()) return;
    setPexelsKey(keyInput.trim());
    setHasKey(true);
    setKeyInput('');
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const vids = await searchPexels(query.trim());
      setResults(vids);
      if (vids.length === 0) setStatus('Sin resultados.');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const add = async (v: PexelsVideo) => {
    setAddingId(v.pexelsId);
    try {
      const file = await downloadPexels(v);
      const updated = await appendVideoClip(project, file, 'pexels', v.pexelsId);
      setProject(updated);
      setStatus('✓ Clip agregado al final de la timeline.');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAddingId(null);
    }
  };

  if (!hasKey) {
    return (
      <div className="sidebar__block">
        <h3>B-roll (Pexels)</h3>
        <p className="muted">
          Pegá tu API key gratuita de Pexels (se guarda sólo en este navegador).
        </p>
        <input
          className="ai-key"
          type="password"
          placeholder="API key de Pexels"
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
      <h3>B-roll (Pexels)</h3>
      <div className="pexels-search">
        <input
          className="ai-key"
          placeholder="Ej: persona mayor caminando"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          disabled={busy}
        />
        <button className="btn btn--block" onClick={search} disabled={!query.trim() || busy}>
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="pexels-grid">
          {results.map((v) => (
            <button
              key={v.pexelsId}
              className="pexels-item"
              onClick={() => add(v)}
              disabled={addingId !== null}
              title={`${v.author} · ${v.duration}s`}
            >
              <img src={v.thumb} alt="" loading="lazy" />
              <span className="pexels-item__add">{addingId === v.pexelsId ? '…' : '+'}</span>
            </button>
          ))}
        </div>
      )}
      {status && <p className="ai-status muted">{status}</p>}
    </div>
  );
}
