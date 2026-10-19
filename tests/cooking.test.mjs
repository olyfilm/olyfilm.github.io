import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Cargar el módulo TS sin el cliente de red: respuestas controladas, sin claves.
const source = fs.readFileSync(new URL('../src/core/ai/cooking.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
  .replace("import { requestPlan } from './index';", 'const requestPlan = (...args) => globalThis.cookingRequest(...args);');
const { parseCookingPlan, planCooking } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const project = {
  assets: [{ id: 'a', kind: 'video', name: 'toma.mp4', duration: 10 }],
  guion: { rawMarkdown: 'guion', blocks: [{ tStart: 0, tEnd: 5, locucion: 'Guion' }] },
  timeline: { video: [], subtitles: [], broll: [], overlay: [], music: [] },
};
const transcripts = [{ assetId: 'a', cues: [{ id: 's', start: 4, end: 7, text: 'Voz', style: 'default' }] }];
const raw = JSON.stringify({ clips: [{ assetId: 'a', srcIn: 3, srcOut: 6 }, { assetId: 'a', srcIn: 6, srcOut: 8 }], summary: 'Dos fragmentos' });

test('concatena fragmentos de una fuente y reubica la voz con recorte', () => {
  const { timeline } = parseCookingPlan(raw, project, transcripts);
  assert.deepEqual(timeline.video.map(c => c.tlStart), [0, 3]);
  assert.deepEqual(timeline.subtitles.map(c => [c.start, c.end]), [[1, 3], [3, 4]]);
  assert.deepEqual(project.timeline.video, []);
});
test('rechaza planes vacíos, fuentes ajenas, tiempos inválidos y límites excedidos', () => {
  for (const clips of [[], [{ assetId: 'otro', srcIn: 0, srcOut: 1 }],
    [{ assetId: 'a', srcIn: -1, srcOut: 1 }], [{ assetId: 'a', srcIn: 3, srcOut: 11 }],
    [{ assetId: 'a', srcIn: 3, srcOut: 3 }], [{ assetId: 'a', srcIn: '0', srcOut: 1 }],
    Array.from({length: 13}, () => ({ assetId: 'a', srcIn: 0, srcOut: 10 }))]) {
    assert.throws(() => parseCookingPlan(JSON.stringify({ clips }), project, []));
  }
  assert.throws(() => parseCookingPlan('inválido', project, []));
});
test('sin transcripción usa el guion limitado a la duración final', () => {
  assert.equal(parseCookingPlan(raw, project, []).timeline.subtitles[0].text, 'Guion');
});
test('envía guion y transcripciones y contabiliza incluso una respuesta inválida', async () => {
  let count = 0;
  globalThis.cookingRequest = async (system, user) => {
    assert.equal(JSON.parse(user).transcripts[0].assetId, 'a');
    assert.equal(JSON.parse(user).guion.rawMarkdown, 'guion');
    return { rawText: 'JSON inválido', usage: { in: 120, out: 30 } };
  };
  await assert.rejects(planCooking(project, transcripts, {
    onStatus() {}, onUsage(usage) { count += usage.in + usage.out; },
  }));
  assert.equal(count, 150);
});
