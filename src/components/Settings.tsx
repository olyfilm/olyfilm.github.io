import { useState } from 'react';
import { useApp } from '@/app/store';
import {
  MODELS_BY_PROVIDER,
  PROVIDERS,
  defaultModelFor,
  getModel,
  setModel,
  type Provider,
} from '@/core/ai';

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
  const store = useApp((s) => ({
    provider: s.provider,
    anthropicKey: s.anthropicKey,
    openrouterKey: s.openrouterKey,
    pexelsKey: s.pexelsKey,
    setProvider: s.setProvider,
    setAnthropicKey: s.setAnthropicKey,
    setOpenRouterKey: s.setOpenRouterKey,
    setPexelsKey: s.setPexelsKey,
  }));

  const [provider, setProviderState] = useState<Provider>(store.provider);
  const [model, setModelState] = useState(getModel());
  const [anthropic, setAnthropic] = useState(store.anthropicKey ?? '');
  const [openrouter, setOpenrouter] = useState(store.openrouterKey ?? '');
  const [pexels, setPexels] = useState(store.pexelsKey ?? '');
  const [saved, setSaved] = useState(false);

  const onProvider = (p: Provider) => {
    setProviderState(p);
    // si el modelo no pertenece al nuevo proveedor, usar el default de ese proveedor
    const valid = MODELS_BY_PROVIDER[p].some((m) => m.id === model);
    if (!valid) setModelState(defaultModelFor(p));
  };

  const save = () => {
    store.setProvider(provider);
    setModel(model);
    store.setAnthropicKey(anthropic.trim());
    store.setOpenRouterKey(openrouter.trim());
    store.setPexelsKey(pexels.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card settings" onClick={(e) => e.stopPropagation()}>
        <h3>Ajustes</h3>

        <label className="settings__label">Proveedor de IA (edición)</label>
        <select
          className="ai-model"
          value={provider}
          onChange={(e) => onProvider(e.target.value as Provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <label className="settings__label">Modelo</label>
        <select className="ai-model" value={model} onChange={(e) => setModelState(e.target.value)}>
          {MODELS_BY_PROVIDER[provider].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="settings__label">API key de Anthropic (Claude directo)</label>
        <input
          className="ai-key"
          type="password"
          placeholder="sk-ant-…"
          value={anthropic}
          onChange={(e) => setAnthropic(e.target.value)}
        />

        <label className="settings__label">
          API key de OpenRouter (GPT-4o y otros · openrouter.ai)
        </label>
        <input
          className="ai-key"
          type="password"
          placeholder="sk-or-…"
          value={openrouter}
          onChange={(e) => setOpenrouter(e.target.value)}
        />

        <label className="settings__label">API key de Pexels (B-roll)</label>
        <input
          className="ai-key"
          type="password"
          placeholder="API key de Pexels"
          value={pexels}
          onChange={(e) => setPexels(e.target.value)}
        />

        <p className="muted settings__note">
          Se guardan sólo en este navegador (localStorage). Dejalas vacías para borrarlas.
          OpenAI directo no se puede desde el navegador (CORS); por eso GPT-4o va vía OpenRouter.
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
