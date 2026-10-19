import { create } from 'zustand';
import type { OlyfilmProject, Usage } from '@/shared/types';
import { emptyUsage } from '@/shared/types';

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

  setProject: (project) => set({ project }),

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
