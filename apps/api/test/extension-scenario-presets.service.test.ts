import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionScenarioPresetsService } from '../src/extension/extension-scenario-presets.service';

const sessionA = { user: { id: 'u1' } } as any;
const sessionB = { user: { id: 'u2' } } as any;
const scenario = { id:'scn_1', name:'N', buttonLabel:'B', description:null, icon:null, enabled:true, showInSelectionMenu:true, menuOrder:100, input:{type:'selection_text'}, output:{type:'text',renderer:'answer_window'}, ai:{provider:'auto',model:null,temperature:0.3,maxTokens:700}, prompt:{system:'s',user:'u'}, window:{resultPosition:'inherit',theme:'inherit'}, schemaVersion:1 };

function mocks(){
  const presets:any[]=[]; const scenarios:any[]=[{userId:'u1',scenarioId:'scn_1',deletedAt:null,configJson:scenario,name:'N',buttonLabel:'B',description:null,icon:null,enabled:true,showInSelectionMenu:true,menuOrder:100}];
  return {
    presets:{ create:async(d:any)=>{const p={...d,slug:d.slug,ownerUserId:d.owner.connect.id,installCount:0,createdAt:new Date(),updatedAt:new Date(),disabledAt:null};presets.push(p);return p;}, findBySlug:async(slug:string)=>presets.find(p=>p.slug===slug)||null, listMine:async(uid:string)=>presets.filter(p=>p.ownerUserId===uid), updateBySlug:async(slug:string,data:any)=>{const p=presets.find(x=>x.slug===slug);Object.assign(p,data);return p;} },
    scenarios:{ findAnyByUserAndScenarioId:async(uid:string,sid:string)=>scenarios.find(s=>s.userId===uid&&s.scenarioId===sid)||null, countActiveByUserId:async(uid:string)=>scenarios.filter(s=>s.userId===uid&&!s.deletedAt).length, create:async(d:any)=>{const n={...d,userId:d.user.connect.id,scenarioId:d.scenarioId,configJson:d.configJson};scenarios.push(n);return n;} },
    svc:new ExtensionScenarioPresetsService({} as any, {} as any, { normalizeScenarioConfig:(x:any,o?:any)=>({ ...scenario, ...x, id:o?.scenarioId??x.id??'scn_x', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }) } as any),
    presetsArr:presets, scenariosArr:scenarios,
  };
}

test('create preset from own scenario and install', async()=>{ const m=mocks(); (m.svc as any).presets=m.presets; (m.svc as any).scenarios=m.scenarios; const created=await m.svc.createFromScenario(sessionA,'scn_1'); assert.ok(created.preset.slug); const installed=await m.svc.install(sessionB,created.preset.slug); assert.ok((installed.scenario as any).id.startsWith('scn_')); });
