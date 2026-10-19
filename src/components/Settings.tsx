import { useState } from 'react';
import { useApp } from '@/app/store';
import { MODELS, getModel, setModel } from '@/core/ai';

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="gear"
        onClick={() => setOpen(true)}
        title="Ajustes · API keys"
        aria-label="Ajustes"
      >
        ⚙
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { anthropicKey, pexelsKey, setAnthropicKey, setPexelsKey } = useApp((s) => ({
    anthropicKey: s.anthropicKey,
    pexelsKey: s.pexelsKey,
    setAnthropicKey: s.setAnthropicKey,
    setPexelsKey: s.setPexelsKey,
  }));
  const [a, setA] = useState(anthropicKey ?? '');
  const [p, setP] = useState(pexelsKey ?? '');
  const [model, setModelState] = useState(getModel());
  const [saved, setSaved] = useState(false);

  const save = () => {
    setAnthropicKey(a.trim());
    setPexelsKey(p.trim());
    setModel(model);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card settings" onClick={(e) => e.stopPropagation()}>
        <h3>Ajustes</h3>

        <label className="settings__label">API key de Anthropic · edición con IA</label>
        <input
          className="ai-key"
          type="password"
          placeholder="sk-ant-…"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />

        <label className="settings__label">Modelo</label>
        <select className="ai-model" value={model} onChange={(e) => setModelState(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="settings__label">API key de Pexels · B-roll</label>
        <input
          className="ai-key"
          type="password"
          placeholder="API key de Pexels"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />

        <p className="muted settings__note">
          Se guardan sólo en este navegador (localStorage). Dejalas vacías para borrarlas.
        </p>

        <div className="modal__actions">
          <button className="btn btn--primary" onClick={save}>
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
