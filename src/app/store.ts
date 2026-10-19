import { create } from 'zustand';
import type { OlyfilmProject, Usage } from '@/shared/types';
import { emptyUsage } from '@/shared/types';
import {
  getApiKey,
  getOpenRouterKey,
  getProvider,
  setApiKey as persistAnthropicKey,
  setOpenRouterKey as persistOpenRouterKey,
  setProvider as persistProvider,
  type Provider,
} from '@/core/ai';
import { getPexelsKey, setPexelsKey as persistPexelsKey } from '@/core/pexels';

import { getBrollProvider, setBrollProvider as persistBrollProvider, type BrollProvider } from '@/core/broll';
import { getPixabayKey, setPixabayKey as persistPixabayKey } from '@/core/pixabay';

export type Screen = 'home' | 'wizard' | 'cooking' | 'editor';

/** Entrada del log de "cocinado" que alimenta spinners + salida en vivo. */
export interface CookLog {
  ts: number;
  stage: string;
  detail: string;
}

export interface WizardDraft {
  guionMarkdown: string | null;
  guionFileName: string | null;
  assetFiles: File[];
}

interface AppState {
  screen: Screen;
  project: OlyfilmProject | null;
  usage: Usage;
  wizard: WizardDraft;
  cookLog: CookLog[];

  // reproducción del preview
  playhead: number;
  playing: boolean;
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;

  // Proveedor de IA + API keys (mirror de localStorage; '' las borra)
  provider: Provider;
  anthropicKey: string | null;
  openrouterKey: string | null;
  pexelsKey: string | null;
  pixabayKey: string | null;
  brollProvider: BrollProvider;
  setPixabayKey: (k: string) => void;
  setBrollProvider: (p: BrollProvider) => void;
  setProvider: (p: Provider) => void;
  setAnthropicKey: (k: string) => void;
  setOpenRouterKey: (k: string) => void;
  setPexelsKey: (k: string) => void;

  // navegación
  goTo: (screen: Screen) => void;

  // wizard
  setGuion: (markdown: string, fileName: string) => void;
  addAssetFiles: (files: File[]) => void;
  removeAssetFile: (index: number) => void;
  resetWizard: () => void;

  // cocinado
  pushCookLog: (stage: string, detail: string) => void;
  clearCookLog: () => void;

  // proyecto / tokens
  setProject: (project: OlyfilmProject | null) => void;
  addTokens: (stage: keyof Usage['byStage'], inTok: number, outTok: number) => void;
  resetUsage: () => void;
}

const emptyWizard = (): WizardDraft => ({
  guionMarkdown: null,
  guionFileName: null,
  assetFiles: [],
});

export const useApp = create<AppState>((set) => ({
  screen: 'home',
  project: null,
  usage: emptyUsage(),
  wizard: emptyWizard(),
  cookLog: [],
  playhead: 0,
  playing: false,
  provider: getProvider(),
  anthropicKey: getApiKey(),
  openrouterKey: getOpenRouterKey(),
  pexelsKey: getPexelsKey(),
  pixabayKey: getPixabayKey(),
  brollProvider: getBrollProvider(),
  setPixabayKey: (k) => { persistPixabayKey(k); set({ pixabayKey: k || null }); },
  setBrollProvider: (p) => { persistBrollProvider(p); set({ brollProvider: p }); },

  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set({ playing }),

  setProvider: (p) => {
    persistProvider(p);
    set({ provider: p });
  },
  setAnthropicKey: (k) => {
    persistAnthropicKey(k);
    set({ anthropicKey: k || null });
  },
  setOpenRouterKey: (k) => {
    persistOpenRouterKey(k);
    set({ openrouterKey: k || null });
  },
  setPexelsKey: (k) => {
    persistPexelsKey(k);
    set({ pexelsKey: k || null });
  },

  goTo: (screen) => set({ screen }),

  setGuion: (guionMarkdown, guionFileName) =>
    set((s) => ({ wizard: { ...s.wizard, guionMarkdown, guionFileName } })),

  addAssetFiles: (files) =>
    set((s) => ({ wizard: { ...s.wizard, assetFiles: [...s.wizard.assetFiles, ...files] } })),

  removeAssetFile: (index) =>
    set((s) => ({
      wizard: { ...s.wizard, assetFiles: s.wizard.assetFiles.filter((_, i) => i !== index) },
    })),

  resetWizard: () => set({ wizard: emptyWizard() }),

  pushCookLog: (stage, detail) =>
    set((s) => ({ cookLog: [...s.cookLog, { ts: Date.now(), stage, detail }] })),

  clearCookLog: () => set({ cookLog: [] }),

  setProject: (project) => set({ project, playhead: 0, playing: false }),

  addTokens: (stage, inTok, outTok) =>
    set((s) => ({
      usage: {
        totalIn: s.usage.totalIn + inTok,
        totalOut: s.usage.totalOut + outTok,
        byStage: { ...s.usage.byStage, [stage]: s.usage.byStage[stage] + inTok + outTok },
      },
    })),

  resetUsage: () => set({ usage: emptyUsage() }),
}));
