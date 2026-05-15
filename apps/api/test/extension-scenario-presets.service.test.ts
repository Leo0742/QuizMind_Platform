import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExtensionScenarioPresetsService } from '../src/extension/extension-scenario-presets.service';

const sessionA = { user: { id: 'u1' } } as any;
const sessionB = { user: { id: 'u2' } } as any;
const sourceScenario = { id:'scn_source', name:'N', buttonLabel:'B', description:null, icon:null, enabled:false, showInSelectionMenu:false, menuOrder:100, input:{type:'selection_text'}, output:{type:'text',renderer:'answer_window'}, ai:{provider:'auto',model:null,temperature:0.3,maxTokens:700}, prompt:{system:'s',user:'u'}, window:{resultPosition:'inherit',theme:'inherit'}, schemaVersion:1, createdAt:'2020-01-01T00:00:00.000Z', updatedAt:'2020-01-01T00:00:00.000Z' };

function setup() {
  const presets:any[]=[];
  const scenarios:any[]=[{ userId:'u1', scenarioId:'scn_source', deletedAt:null, configJson:sourceScenario }];
  const repoPresets:any = {
    create: async (d:any) => { const p={ id:'p1', ownerUserId:d.owner.connect.id, sourceScenarioId:d.sourceScenarioId, slug:d.slug, name:d.name, description:d.description, buttonLabel:d.buttonLabel, icon:d.icon, schemaVersion:1, presetVersion:1, visibility:d.visibility, configJson:d.configJson, installCount:0, createdAt:new Date(), updatedAt:new Date(), disabledAt:null }; presets.push(p); return p; },
    findBySlug: async (slug:string) => presets.find((p)=>p.slug===slug) ?? null,
    listMine: async (uid:string) => presets.filter((p)=>p.ownerUserId===uid),
    updateBySlug: async (slug:string, data:any) => { const p=presets.find((x)=>x.slug===slug); if(!p) throw new Error('missing'); if (data.installCount?.increment) p.installCount += data.installCount.increment; if (data.visibility) p.visibility=data.visibility; if (data.disabledAt) p.disabledAt=data.disabledAt; return p; },
    transaction: async (fn:any) => fn({}),
  };
  const repoScenarios:any = {
    findAnyByUserAndScenarioId: async (uid:string,sid:string) => scenarios.find((s)=>s.userId===uid&&s.scenarioId===sid) ?? null,
    countActiveByUserId: async (uid:string) => scenarios.filter((s)=>s.userId===uid && !s.deletedAt).length,
    create: async (d:any) => { const rec={ userId:d.user.connect.id, scenarioId:d.scenarioId, enabled:d.enabled, configJson:d.configJson, createdAt:new Date(), updatedAt:new Date() }; scenarios.push(rec); return rec; },
  };
  const normSvc:any = { normalizeScenarioConfig: (raw:any, opts?:any) => ({ ...sourceScenario, ...raw, id: opts?.scenarioId ?? raw.id, createdAt: raw.createdAt ?? sourceScenario.createdAt, updatedAt: raw.updatedAt ?? sourceScenario.updatedAt }) };
  const svc = new ExtensionScenarioPresetsService(repoPresets, repoScenarios, normSvc);
  return { svc, presets, scenarios, repoPresets, repoScenarios };
}

test('install forces enabled=true and config timestamps to now-ish and increments count', async () => {
  const { svc, presets } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source');
  const before = Date.now();
  const installed = await svc.install(sessionB, created.preset.slug);
  const after = Date.now();
  assert.equal((installed.scenario as any).enabled, true);
  const cAt = new Date((installed.scenario as any).createdAt).getTime();
  assert.ok(cAt >= before && cAt <= after);
  assert.equal(presets[0].installCount, 1);
});

test('disabled preset cannot be installed', async () => {
  const { svc, presets } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source');
  presets[0].disabledAt = new Date();
  await assert.rejects(() => svc.install(sessionB, created.preset.slug), NotFoundException);
});

test('private preset preview: owner yes, non-owner no', async () => {
  const { svc } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'private' });
  const ownerView = await svc.preview(created.preset.slug, sessionA);
  assert.equal(ownerView.preset.slug, created.preset.slug);
  await assert.rejects(() => svc.preview(created.preset.slug, sessionB), NotFoundException);
});

test('non-owner cannot disable', async () => {
  const { svc } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source');
  await assert.rejects(() => svc.disable(sessionB, created.preset.slug), ForbiddenException);
});
