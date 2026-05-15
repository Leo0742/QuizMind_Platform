import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExtensionScenariosService } from '../src/extension/extension-scenarios.service';

const sessionA = { user: { id: 'u1', email: 'a@b.c' } } as any;
const sessionB = { user: { id: 'u2', email: 'b@b.c' } } as any;
const baseScenario = { name: 'N', buttonLabel: 'Go', input: { type: 'selection_text' }, output: { type: 'text', renderer: 'answer_window' }, prompt: { system: 's', user: 'u' } };

function repoMock() {
  const store: any[] = [];
  const api: any = {
    listAnyByUserId: async (userId: string) => store.filter((s) => s.userId === userId),
    listActiveByUserId: async (userId: string) => store.filter((s) => s.userId === userId && !s.deletedAt),
    countActiveByUserId: async (userId: string) => store.filter((s) => s.userId === userId && !s.deletedAt).length,
    findAnyByUserAndScenarioId: async (userId: string, scenarioId: string) => store.find((s) => s.userId === userId && s.scenarioId === scenarioId) ?? null,
    updateByUserAndScenarioId: async (userId: string, scenarioId: string, data: any) => {
      const f = store.find((s) => s.userId === userId && s.scenarioId === scenarioId);
      Object.assign(f, data);
      f.updatedAt = new Date();
      return f;
    },
    create: async (input: any) => {
      const r = { ...input, userId: input.user.connect.id, scenarioId: input.scenarioId, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
      store.push(r);
      return r;
    },
    transaction: async (fn: any) => fn({}),
    _store: store,
  };
  return api;
}

test('A+B create valid and duplicate active POST returns 409', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  const one = await svc.create(sessionA, { ...baseScenario, id: 'scn_1' });
  assert.equal((one.scenario as any).id, 'scn_1');
  await assert.rejects(() => svc.create(sessionA, { ...baseScenario, id: 'scn_1' }), ConflictException);
});

test('C+D PUT creates missing and preserves createdAt when updating', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  const created = await svc.put(sessionA, 'scn_x', baseScenario);
  const cAt = (created.scenario as any).createdAt;
  const updated = await svc.put(sessionA, 'scn_x', { ...baseScenario, name: 'Updated' });
  assert.equal((updated.scenario as any).name, 'Updated');
  assert.equal((updated.scenario as any).createdAt, cAt);
});

test('E+F PATCH deep merge and missing/deleted 404', async () => {
  const repo = repoMock();
  const svc = new ExtensionScenariosService(repo);
  await svc.create(sessionA, { ...baseScenario, id: 'scn_p', ai: { model: 'm1', temperature: 0.3, maxTokens: 700 } });
  const patched = await svc.patch(sessionA, 'scn_p', { ai: { temperature: 1.1 }, window: { draggable: true } });
  assert.equal((patched.scenario as any).ai.temperature, 1.1);
  assert.equal((patched.scenario as any).ai.model, 'm1');
  assert.equal((patched.scenario as any).window.draggable, true);
  await assert.rejects(() => svc.patch(sessionA, 'scn_missing', { name: 'x' }), NotFoundException);
  await svc.remove(sessionA, 'scn_p');
  await assert.rejects(() => svc.patch(sessionA, 'scn_p', { name: 'x' }), NotFoundException);
});

test('G DELETE soft-deletes and list hides', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  await svc.create(sessionA, { ...baseScenario, id: 'scn_d' });
  await svc.remove(sessionA, 'scn_d');
  const listed = await svc.list(sessionA);
  assert.equal(listed.items.length, 0);
});

test('H+I bulk merge and replace behavior', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  await svc.create(sessionA, { ...baseScenario, id: 'scn_keep' });
  await svc.bulk(sessionA, { mode: 'merge', items: [{ ...baseScenario, id: 'scn_new' }] });
  assert.equal((await svc.list(sessionA)).items.length, 2);
  await svc.bulk(sessionA, { mode: 'replace', items: [{ ...baseScenario, id: 'scn_new' }] });
  const after = await svc.list(sessionA);
  assert.equal(after.items.length, 1);
  assert.equal((after.items[0] as any).id, 'scn_new');
});

test('J+K bulk duplicate ids rejected and invalid causes no writes', async () => {
  const repo = repoMock();
  const svc = new ExtensionScenariosService(repo);
  await assert.rejects(() => svc.bulk(sessionA, { mode: 'merge', items: [{ ...baseScenario, id: 'scn_dup' }, { ...baseScenario, id: 'scn_dup' }] }));
  await assert.rejects(() => svc.bulk(sessionA, { mode: 'merge', items: [{ ...baseScenario, id: 'scn_ok' }, { ...baseScenario, id: 'scn_bad', output: { type: 'image', renderer: 'answer_window' } }] }));
  assert.equal((await svc.list(sessionA)).items.length, 0);
});

test('L+M over 50 create rejected but updating existing at 50 allowed', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  for (let i = 0; i < 50; i++) await svc.create(sessionA, { ...baseScenario, id: `scn_${i}` });
  await assert.rejects(() => svc.create(sessionA, { ...baseScenario, id: 'scn_51' }), ConflictException);
  const updated = await svc.put(sessionA, 'scn_0', { ...baseScenario, name: 'X' });
  assert.equal((updated.scenario as any).name, 'X');
});

test('N dangerous nested key rejected', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  await assert.rejects(() => svc.create(sessionA, { ...baseScenario, prompt: { system: 's', user: 'u', script: 'bad' } }));
});

test('O cross-user isolation', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  await svc.create(sessionA, { ...baseScenario, id: 'scn_a' });
  await assert.rejects(() => svc.patch(sessionB, 'scn_a', { name: 'hack' }), NotFoundException);
  await assert.rejects(() => svc.remove(sessionB, 'scn_a'), NotFoundException);
  assert.equal((await svc.list(sessionB)).items.length, 0);
  assert.equal((await svc.list(sessionA)).items.length, 1);
});

test('P rejects coming-soon scenario capabilities with clear message', async () => {
  const svc = new ExtensionScenariosService(repoMock());
  await assert.rejects(
    () => svc.create(sessionA, { ...baseScenario, output: { type: 'image', renderer: 'answer_window' } }),
    (error: any) => error?.message?.includes('Only selected text → text scenarios are currently supported. Image, screenshot, file and multi-output scenarios are coming soon.'),
  );
  await assert.rejects(
    () => svc.create(sessionA, { ...baseScenario, input: { type: 'screenshot' } }),
    (error: any) => error?.message?.includes('Only selected text → text scenarios are currently supported. Image, screenshot, file and multi-output scenarios are coming soon.'),
  );
});
