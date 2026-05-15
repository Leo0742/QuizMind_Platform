import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ExtensionScenariosController } from '../src/extension/extension-scenarios.controller';
import { ExtensionScenarioPresetsController } from '../src/extension/extension-scenario-presets.controller';

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
