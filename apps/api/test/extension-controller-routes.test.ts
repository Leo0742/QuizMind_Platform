import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { ExtensionScenariosController } from '../src/extension/extension-scenarios.controller';
import { ExtensionScenarioPresetsController } from '../src/extension/extension-scenario-presets.controller';
import { AuthService } from '../src/auth/auth.service';
import { ExtensionControlService } from '../src/extension/extension-control.service';
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
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'catalog'), 'catalog');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'preview'), ':slug');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'install'), ':slug/install');
  assert.equal(routePath(ExtensionScenarioPresetsController.prototype, 'del'), ':slug');
});

test('GET /extension/scenarios/sync without auth throws 401', async () => {
  const controller = new ExtensionScenariosController({ getCurrentSession: async () => ({ user: { id: 'u1' } }) } as any, { resolveInstallationSession: async () => ({}) } as any, { sync: async () => ({}) } as any);
  await assert.rejects(() => controller.sync(undefined), UnauthorizedException);
});

test('GET /extension/scenarios/sync with web token returns sync payload from service', async () => {
  const session = { user: { id: 'u1', email: 'u@q.test' } };
  const payload = { schemaVersion: 1, items: [], deleted: [], serverTime: '2026-05-15T00:00:00.000Z' };
  const controller = new ExtensionScenariosController({ getCurrentSession: async () => session } as any, { resolveInstallationSession: async () => ({}) } as any, { sync: async (s: unknown) => { assert.equal(s, session); return payload; } } as any);

  const res = await controller.sync('Bearer valid-token');
  assert.deepEqual(res, payload);
});

test('GET /extension/scenarios/sync with installation token falls back to installation session', async () => {
  const payload = { schemaVersion: 1, items: [], deleted: [], serverTime: '2026-05-15T00:00:00.000Z' };
  let capturedSession: any;
  const controller = new ExtensionScenariosController(
    { getCurrentSession: async () => { throw new UnauthorizedException('bad'); } } as any,
    { resolveInstallationSession: async (_token: string, options: { endpoint: string }) => ({ installation: { userId: 'ext-user-1' }, endpoint: options.endpoint }) } as any,
    { sync: async (s: unknown) => { capturedSession = s; return payload; } } as any,
  );

  const res = await controller.sync('Bearer installation-token');
  assert.deepEqual(res, payload);
  assert.equal(capturedSession.user.id, 'ext-user-1');
  assert.equal(capturedSession.principal.userId, 'ext-user-1');
});

test('GET /extension/scenarios/sync returns reconnect unauthorized when both auth modes fail', async () => {
  const controller = new ExtensionScenariosController(
    { getCurrentSession: async () => { throw new UnauthorizedException('jwt invalid'); } } as any,
    { resolveInstallationSession: async () => { throw new UnauthorizedException('installation invalid'); } } as any,
    { sync: async () => ({}) } as any,
  );

  await assert.rejects(
    () => controller.sync('Bearer bad-token'),
    (error: unknown) => error instanceof UnauthorizedException && error.message === 'Session expired. Reconnect your account.',
  );
});

test('DI metadata: ExtensionScenariosController explicitly injects AuthService, ExtensionControlService and ExtensionScenariosService', () => {
  const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ExtensionScenariosController) as Array<{ index: number; param: unknown }>;
  assert.ok(Array.isArray(deps));
  assert.equal(deps.length, 3);
  assert.equal(deps.find((d) => d.index === 0)?.param, AuthService);
  assert.equal(deps.find((d) => d.index === 1)?.param, ExtensionControlService);
  assert.equal(deps.find((d) => d.index === 2)?.param, ExtensionScenariosService);
});

test('DI metadata: ExtensionScenarioPresetsController explicitly injects AuthService, ExtensionControlService and ExtensionScenarioPresetsService', () => {
  const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, ExtensionScenarioPresetsController) as Array<{ index: number; param: unknown }>;
  assert.ok(Array.isArray(deps));
  assert.equal(deps.length, 3);
  assert.equal(deps.find((d) => d.index === 0)?.param, AuthService);
  assert.equal(deps.find((d) => d.index === 1)?.param, ExtensionControlService);
  assert.equal(deps.find((d) => d.index === 2)?.param, ExtensionScenarioPresetsService);
});

test('presets mine and install support installation token fallback and preview stays optional', async () => {
  let mineSession: any;
  let installSession: any;
  let previewSession: any;
  const presetsController = new ExtensionScenarioPresetsController(
    { getCurrentSession: async () => { throw new UnauthorizedException('jwt invalid'); } } as any,
    { resolveInstallationSession: async () => ({ installation: { userId: 'ext-user-2' } }) } as any,
    {
      mine: async (s: unknown) => { mineSession = s; return { items: [] }; },
      install: async (s: unknown) => { installSession = s; return { ok: true }; },
      preview: async (_slug: string, s: unknown) => { previewSession = s; return { preset: { slug: 's1' } }; },
    } as any,
  );

  await presetsController.mine('Bearer installation-token');
  await presetsController.install('s1', 'Bearer installation-token');
  await presetsController.preview('s1', undefined);

  assert.equal(mineSession.user.id, 'ext-user-2');
  assert.equal(installSession.principal.userId, 'ext-user-2');
  assert.equal(previewSession, null);
});
