import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExtensionScenarioPresetsService } from '../src/extension/extension-scenario-presets.service';

const sessionA = { user: { id: 'u1' } } as any;
const sessionB = { user: { id: 'u2' } } as any;
const sourceScenario = { id:'scn_source', name:'Alpha helper', buttonLabel:'Summarize', description:'desc', icon:'✨', enabled:false, showInSelectionMenu:false, menuOrder:100, input:{type:'selection_text'}, output:{type:'text',renderer:'answer_window'}, ai:{provider:'auto',model:null,temperature:0.3,maxTokens:700}, prompt:{system:'s',user:'u'}, window:{resultPosition:'inherit',theme:'inherit'}, schemaVersion:1, createdAt:'2020-01-01T00:00:00.000Z', updatedAt:'2020-01-01T00:00:00.000Z' };

function setup() {
  const presets:any[]=[];
  const scenarios:any[]=[{ userId:'u1', scenarioId:'scn_source', deletedAt:null, configJson:sourceScenario }];
  const repoPresets:any = {
    create: async (d:any) => { const p={ id:`p${presets.length+1}`, ownerUserId:d.owner.connect.id, sourceScenarioId:d.sourceScenarioId, slug:d.slug, name:d.name, description:d.description, buttonLabel:d.buttonLabel, icon:d.icon, schemaVersion:1, presetVersion:1, visibility:d.visibility, category:d.category??null, tags:d.tags??[], publishedAt:d.publishedAt??null, moderationStatus:'approved', configJson:d.configJson, installCount:0, createdAt:new Date(), updatedAt:new Date(), disabledAt:null }; presets.push(p); return p; },
    findBySlug: async (slug:string) => presets.find((p)=>p.slug===slug) ?? null,
    listMine: async (uid:string) => presets.filter((p)=>p.ownerUserId===uid),
    listCatalog: async (where:any, orderBy:any, skip:number, take:number) => {
      let rows = presets.filter((p)=>p.visibility===where.visibility && p.disabledAt===where.disabledAt && p.moderationStatus===where.moderationStatus);
      if (where.category) rows = rows.filter((p)=>p.category===where.category);
      if (where.OR?.length) rows = rows.filter((p)=> where.OR.some((cl:any)=> Object.entries(cl).some(([k,v]:any)=> (p[k]??'').toLowerCase().includes(v.contains.toLowerCase()))));
      rows = [...rows];
      if (orderBy[0]?.installCount) rows.sort((a,b)=>b.installCount-a.installCount);
      if (orderBy[0]?.publishedAt) rows.sort((a,b)=>new Date(b.publishedAt??0).getTime()-new Date(a.publishedAt??0).getTime());
      if (orderBy[0]?.updatedAt) rows.sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime());
      return rows.slice(skip, skip + take);
    },
    updateBySlug: async (slug:string, data:any) => { const p=presets.find((x)=>x.slug===slug); if(!p) throw new Error('missing'); if (data.installCount?.increment) p.installCount += data.installCount.increment; for (const k of ['visibility','disabledAt','publishedAt','name','description','category','sourceLanguage','targetLanguage']) if (data[k]!==undefined) p[k]=data[k]; if (data.tags!==undefined) p.tags=data.tags; p.updatedAt = new Date(); return p; },
    transaction: async (fn:any) => fn({}),
  };
  const repoScenarios:any = {
    findAnyByUserAndScenarioId: async (uid:string,sid:string) => scenarios.find((s)=>s.userId===uid&&s.scenarioId===sid) ?? null,
    countActiveByUserId: async (uid:string) => scenarios.filter((s)=>s.userId===uid && !s.deletedAt).length,
    create: async (d:any) => { const rec={ userId:d.user.connect.id, scenarioId:d.scenarioId, enabled:d.enabled, configJson:d.configJson, createdAt:new Date(), updatedAt:new Date() }; scenarios.push(rec); return rec; },
  };
  const normSvc:any = { normalizeScenarioConfig: (raw:any, opts?:any) => ({ ...sourceScenario, ...raw, id: opts?.scenarioId ?? raw.id, createdAt: raw.createdAt ?? sourceScenario.createdAt, updatedAt: raw.updatedAt ?? sourceScenario.updatedAt }) };
  const svc = new ExtensionScenarioPresetsService(repoPresets, repoScenarios, normSvc);
  return { svc, presets };
}

test('catalog lists only public approved non-disabled and hides configJson', async () => {
  const { svc, presets } = setup();
  await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'public', category: 'study' });
  await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'unlisted' });
  await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'private' });
  presets[0].disabledAt = new Date();
  const out = await svc.listCatalog({});
  assert.equal(out.items.length, 0);
  const publicOne = await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'public', name: 'Catalog one' });
  presets.find((p)=>p.slug===publicOne.preset.slug)!.moderationStatus = 'approved';
  const out2 = await svc.listCatalog({});
  assert.equal(out2.items.length, 1);
  assert.equal((out2.items[0] as any).configJson, undefined);
});

test('owner patch to public sets publishedAt; non-owner blocked; disabled blocked', async () => {
  const { svc, presets } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'unlisted' });
  const patched = await svc.updateMetadata(sessionA, created.preset.slug, { visibility: 'public', category: 'coding', tags: [' JS ', 'js', 'tooling'] });
  assert.equal(patched.preset.visibility, 'public');
  assert.ok(patched.preset.publishedAt instanceof Date);
  assert.deepEqual(patched.preset.tags, ['js', 'tooling']);
  await assert.rejects(() => svc.updateMetadata(sessionB, created.preset.slug, { visibility: 'private' }), ForbiddenException);
  presets[0].disabledAt = new Date();
  presets[0].visibility = 'disabled';
  await assert.rejects(() => svc.updateMetadata(sessionA, created.preset.slug, { visibility: 'public' }), BadRequestException);
});

test('public preview works and public install works', async () => {
  const { svc, presets } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'public' });
  const preview = await svc.preview(created.preset.slug, null);
  assert.equal(preview.preset.slug, created.preset.slug);
  await svc.install(sessionB, created.preset.slug);
  assert.equal(presets[0].installCount, 1);
});

test('catalog q and category filters work', async () => {
  const { svc } = setup();
  await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'public', name: 'Translator preset', description: 'for essays', category: 'translation' });
  await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'public', name: 'Code helper', description: 'for snippets', category: 'coding' });
  const byQ = await svc.listCatalog({ q: 'essay' });
  assert.equal(byQ.items.length, 1);
  const byCategory = await svc.listCatalog({ category: 'coding' });
  assert.equal(byCategory.items.length, 1);
});

test('private preset preview: owner yes, non-owner no', async () => {
  const { svc } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source', { visibility: 'private' });
  await svc.preview(created.preset.slug, sessionA);
  await assert.rejects(() => svc.preview(created.preset.slug, sessionB), NotFoundException);
});

test('non-owner cannot disable', async () => {
  const { svc } = setup();
  const created = await svc.createFromScenario(sessionA, 'scn_source');
  await assert.rejects(() => svc.disable(sessionB, created.preset.slug), ForbiddenException);
});
