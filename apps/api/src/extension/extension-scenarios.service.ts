import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionScenariosRepository } from './extension-scenarios.repository';

const MAX_SCENARIOS = 50;
const DANGEROUS_KEYS = new Set(['code','js','script','eval','functionBody','remoteScriptUrl']);

function asRecord(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BadRequestException('Invalid object'); return v as Record<string, unknown>; }
function str(v: unknown, f: string, max: number, required = true): string { if (typeof v !== 'string') { if (!required) return ''; throw new BadRequestException(`${f} must be string`);} const t=v.trim(); if (required && !t) throw new BadRequestException(`${f} is required`); if (t.length>max) throw new BadRequestException(`${f} too long`); return t; }
function clamp(n:number,min:number,max:number){ return Math.min(max,Math.max(min,n)); }

@Injectable()
export class ExtensionScenariosService {
  constructor(private readonly repo: ExtensionScenariosRepository) {}

  normalizeScenarioConfig(raw: unknown, options?: { scenarioId?: string }) {
    const root = asRecord(raw);
    for (const k of Object.keys(root)) if (DANGEROUS_KEYS.has(k)) throw new BadRequestException(`Dangerous field: ${k}`);
    const id = options?.scenarioId ?? (typeof root.id === 'string' && root.id.trim() ? root.id.trim() : `scn_${Math.random().toString(36).slice(2, 10)}`);
    const input = asRecord(root.input ?? { type: 'selection_text' });
    const output = asRecord(root.output ?? { type: 'text', renderer: 'answer_window' });
    if (input.type !== 'selection_text') throw new BadRequestException('input.type must be selection_text');
    if (output.type !== 'text') throw new BadRequestException('output.type must be text');
    if (output.renderer !== 'answer_window') throw new BadRequestException('output.renderer must be answer_window');
    const ai = asRecord(root.ai ?? {});
    const prompt = asRecord(root.prompt ?? {});
    const windowObj = asRecord(root.window ?? {});
    const resultPosition = typeof windowObj.resultPosition === 'string' ? windowObj.resultPosition : 'inherit';
    if (!['inherit','under_action','floating'].includes(resultPosition)) throw new BadRequestException('window.resultPosition invalid');
    const scenario = {
      id,
      schemaVersion: 1,
      name: str(root.name, 'name', 80),
      description: typeof root.description === 'string' ? str(root.description, 'description', 500, false) : null,
      buttonLabel: str(root.buttonLabel, 'buttonLabel', 28),
      icon: typeof root.icon === 'string' ? str(root.icon, 'icon', 8, false) : null,
      enabled: typeof root.enabled === 'boolean' ? root.enabled : true,
      showInSelectionMenu: typeof root.showInSelectionMenu === 'boolean' ? root.showInSelectionMenu : true,
      menuOrder: clamp(Number.isInteger(root.menuOrder) ? (root.menuOrder as number) : 100, -10000, 10000),
      input: { type: 'selection_text' },
      output: { type: 'text', renderer: 'answer_window' },
      ai: {
        provider: 'auto',
        model: typeof ai.model === 'string' ? str(ai.model, 'ai.model', 150, false) : null,
        temperature: clamp(typeof ai.temperature === 'number' ? ai.temperature : 0.7, 0, 2),
        maxTokens: clamp(Number.isInteger(ai.maxTokens) ? (ai.maxTokens as number) : 1024, 1, 20000),
      },
      prompt: { system: str(prompt.system, 'prompt.system', 12000), user: str(prompt.user, 'prompt.user', 12000) },
      window: { resultPosition, theme: 'inherit', ...(typeof windowObj.draggable === 'boolean' ? { draggable: windowObj.draggable } : {}), ...(typeof windowObj.resizable === 'boolean' ? { resizable: windowObj.resizable } : {}) },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return scenario;
  }

  async list(session: CurrentSessionSnapshot) { const items = (await this.repo.listActiveByUserId(session.user.id)).map((r) => r.configJson); return { schemaVersion: 1, items, serverTime: new Date().toISOString() }; }
  async sync(session: CurrentSessionSnapshot) { const listed = await this.list(session); return { ...listed, deleted: [] as string[] }; }

  async create(session: CurrentSessionSnapshot, raw: unknown) {
    if ((await this.repo.countActiveByUserId(session.user.id)) >= MAX_SCENARIOS) throw new ConflictException('Scenario limit reached');
    const scenario = this.normalizeScenarioConfig(raw);
    const existing = await this.repo.findAnyByUserAndScenarioId(session.user.id, scenario.id);
    if (existing && !existing.deletedAt) throw new ConflictException('Scenario already exists');
    const saved = existing
      ? await this.repo.updateByUserAndScenarioId(session.user.id, scenario.id, { schemaVersion: 1, name: scenario.name, description: scenario.description, buttonLabel: scenario.buttonLabel, icon: scenario.icon, enabled: scenario.enabled, showInSelectionMenu: scenario.showInSelectionMenu, menuOrder: scenario.menuOrder, configJson: scenario, deletedAt: null })
      : await this.repo.create({ user: { connect: { id: session.user.id } }, scenarioId: scenario.id, schemaVersion: 1, name: scenario.name, description: scenario.description, buttonLabel: scenario.buttonLabel, icon: scenario.icon, enabled: scenario.enabled, showInSelectionMenu: scenario.showInSelectionMenu, menuOrder: scenario.menuOrder, configJson: scenario });
    return { scenario: saved.configJson };
  }

  async remove(session: CurrentSessionSnapshot, scenarioId: string) { const existing = await this.repo.findAnyByUserAndScenarioId(session.user.id, scenarioId); if (!existing || existing.deletedAt) throw new NotFoundException(); await this.repo.updateByUserAndScenarioId(session.user.id, scenarioId, { deletedAt: new Date() }); return { ok: true }; }
}
