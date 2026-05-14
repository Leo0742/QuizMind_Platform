import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionScenariosService } from '../src/extension/extension-scenarios.service';

const session = { user: { id: 'u1', email: 'a@b.c' } } as any;
const baseScenario = { name: 'N', buttonLabel: 'Go', input: { type: 'selection_text' }, output: { type: 'text', renderer: 'answer_window' }, prompt: { system: 's', user: 'u' } };

function repoMock() {
  const store: any[] = [];
  return {
    listActiveByUserId: async (userId: string) => store.filter((s) => s.userId===userId && !s.deletedAt),
    countActiveByUserId: async (userId: string) => store.filter((s) => s.userId===userId && !s.deletedAt).length,
    findAnyByUserAndScenarioId: async (userId:string, scenarioId:string) => store.find((s)=>s.userId===userId && s.scenarioId===scenarioId) ?? null,
    updateByUserAndScenarioId: async (userId:string, scenarioId:string, data:any) => { const f=store.find((s)=>s.userId===userId&&s.scenarioId===scenarioId); Object.assign(f,data); return f; },
    create: async (input:any) => { const r={...input, userId: input.user.connect.id, scenarioId: input.scenarioId, deletedAt: null}; store.push(r); return r; },
  } as any;
}

test('list empty', async () => { const svc = new ExtensionScenariosService(repoMock()); const out = await svc.list(session); assert.equal(out.items.length,0); });
test('create valid scenario', async () => { const svc = new ExtensionScenariosService(repoMock()); const out = await svc.create(session, baseScenario); assert.equal((out.scenario as any).name,'N'); });
test('invalid output type rejected', () => { const svc = new ExtensionScenariosService(repoMock()); assert.throws(() => svc.normalizeScenarioConfig({ ...baseScenario, output: { type: 'image', renderer:'answer_window' } })); });
test('dangerous field rejected', () => { const svc = new ExtensionScenariosService(repoMock()); assert.throws(() => svc.normalizeScenarioConfig({ ...baseScenario, script: 'x' })); });
test('delete soft delete', async () => { const repo=repoMock(); const svc = new ExtensionScenariosService(repo); const created = await svc.create(session, { ...baseScenario, id: 'scn_1' }); await svc.remove(session, 'scn_1'); const list = await svc.list(session); assert.equal(list.items.length,0); assert.ok(created); });
