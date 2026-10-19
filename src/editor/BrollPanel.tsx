import { useState } from 'react';
import { useApp } from '@/app/store';
import { downloadBroll, searchBroll, type StockVideo } from '@/core/broll';
import { appendVideoClip } from '@/core/project';
import type { OlyfilmProject } from '@/shared/types';

export function BrollPanel({ project }: { project: OlyfilmProject }) {
  const { setProject, pexelsKey, pixabayKey, brollProvider } = useApp((s) => ({
    setProject: s.setProject,
    pexelsKey: s.pexelsKey,
    pixabayKey: s.pixabayKey,
    brollProvider: s.brollProvider,
  }));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockVideo[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const vids = await searchBroll(brollProvider, query.trim());
      setResults(vids);
      if (vids.length === 0) setStatus('Sin resultados.');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const add = async (v: StockVideo) => {
    setAddingId(v.id);
    try {
      const file = await downloadBroll(v);
      const updated = await appendVideoClip(project, file, v.provider, v.id);
      setProject(updated);
      setStatus('✓ Clip agregado al final de la timeline.');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAddingId(null);
    }
  };

  const label = brollProvider === 'pixabay' ? 'Pixabay' : 'Pexels';
  if (brollProvider === 'none') return null;
  if (!(brollProvider === 'pexels' ? pexelsKey : pixabayKey)) {
    return (
      <div className="sidebar__block">
        <h3>B-roll ({label})</h3>
        <p className="muted">
          Cargá tu API key gratuita de {label} en <strong>⚙ Ajustes</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar__block">
      <h3>B-roll ({label})</h3>
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

      <p className="muted">Videos de <a href={brollProvider === 'pixabay' ? 'https://pixabay.com/' : 'https://www.pexels.com/'} target="_blank" rel="noreferrer">{label}</a>.</p>
      {results.length > 0 && (
        <div className="pexels-grid">
          {results.map((v) => (
            <button
              key={v.id}
              className="pexels-item"
              onClick={() => add(v)}
              disabled={addingId !== null}
              title={`${v.author} · ${v.duration}s`}
            >
              <img src={v.thumb} alt="" loading="lazy" />
              <span className="pexels-item__add">{addingId === v.id ? '…' : '+'}</span>
            </button>
          ))}
        </div>
      )}
      {status && <p className="ai-status muted">{status}</p>}
    </div>
  );
}
