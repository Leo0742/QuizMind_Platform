import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { ExtensionScenariosController } from '../src/extension/extension-scenarios.controller';
import { ExtensionScenarioPresetsController } from '../src/extension/extension-scenario-presets.controller';
import { AuthService } from '../src/auth/auth.service';
import { ExtensionScenariosService } from '../src/extension/extension-scenarios.service';
import { ExtensionScenarioPresetsService } from '../src/extension/extension-scenario-presets.service';

function routePath(target: object, methodName: string) {
  return Reflect.getMetadata(PATH_METADATA, (target as any)[methodName]);
}

test('extension scenarios controller is mounted without api prefix', () => {
  const basePath = Reflect.getMetadata(PATH_METADATA, ExtensionScenariosController);
  assert.equal(basePath, 'extension/scenarios');

  assert.equal(routePath(ExtensionScenariosController.prototype, 'list'), '/');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'sync'), 'sync');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'create'), '/');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'put'), ':scenarioId');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'patch'), ':scenarioId');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'remove'), ':scenarioId');
  assert.equal(routePath(ExtensionScenariosController.prototype, 'bulk'), 'bulk');
});

test('extension scenario presets controller is mounted without api prefix', () => {
  const basePath = Reflect.getMetadata(PATH_METADATA, ExtensionScenarioPresetsController);
  assert.equal(basePath, 'extension/scenario-presets');

  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'fromScenario'), 'from-scenario/:scenarioId');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'mine'), 'mine');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'preview'), ':slug');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'install'), ':slug/install');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'del'), ':slug');
});

test('GET /extension/scenarios/sync without auth throws 401', async () => {
  const controller = new ExtensionScenariosController({ getCurrentSession: async () => ({ user: { id: 'u1' } }) } as any, { sync: async () => ({}) } as any);
  await assert.rejects(() => controller.sync(undefined), UnauthorizedException);
});

test('GET /extension/scenarios/sync with auth returns sync payload from service', async () => {
  const session = { user: { id: 'u1', email: 'u@q.test' } };
  const payload = { schemaVersion: 1, items: [], deleted: [], serverTime: '2026-05-15T00:00:00.000Z' };
  const controller = new ExtensionScenariosController({ getCurrentSession: async () => session } as any, { sync: async (s: unknown) => { assert.equal(s, session); return payload; } } as any);

  const res = await controller.sync('Bearer valid-token');
  assert.deepEqual(res, payload);
});

test('DI metadata: ExtensionScenariosController explicitly injects AuthService and ExtensionScenariosService', () => {
  const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ExtensionScenariosController) as Array<{ index: number; param: unknown }>;
  assert.ok(Array.isArray(deps));
  assert.equal(deps.length, 2);
  assert.equal(deps.find((d) => d.index === 0)?.param, AuthService);
  assert.equal(deps.find((d) => d.index === 1)?.param, ExtensionScenariosService);
});

test('DI metadata: ExtensionScenarioPresetsController explicitly injects AuthService and ExtensionScenarioPresetsService', () => {
  const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ExtensionScenarioPresetsController) as Array<{ index: number; param: unknown }>;
  assert.ok(Array.isArray(deps));
  assert.equal(deps.length, 2);
  assert.equal(deps.find((d) => d.index === 0)?.param, AuthService);
  assert.equal(deps.find((d) => d.index === 1)?.param, ExtensionScenarioPresetsService);
});

test('controller methods with wired service throw UnauthorizedException for missing auth and preview remains callable', async () => {
  const scenarioController = new ExtensionScenariosController(
    { getCurrentSession: async () => ({ user: { id: 'u1' } }) } as any,
    { list: async () => ({ items: [] }), sync: async () => ({ items: [], deleted: [] }) } as any,
  );
  await assert.rejects(() => scenarioController.list(undefined), UnauthorizedException);
  await assert.rejects(() => scenarioController.sync(undefined), UnauthorizedException);

  const presetsController = new ExtensionScenarioPresetsController(
    { getCurrentSession: async () => ({ user: { id: 'u1' } }) } as any,
    { mine: async () => ({ items: [] }), install: async () => ({ ok: true }), preview: async () => ({ preset: { slug: 's1' } }) } as any,
  );
  await assert.rejects(() => presetsController.mine(undefined), UnauthorizedException);
  await assert.rejects(() => presetsController.install('s1', undefined), UnauthorizedException);
  assert.deepEqual(await presetsController.preview('s1', undefined), { preset: { slug: 's1' } });
});
