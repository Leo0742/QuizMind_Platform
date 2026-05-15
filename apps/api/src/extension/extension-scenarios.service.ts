import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@quizmind/database';
import type { CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionScenariosRepository, type UserExtensionScenarioRecord } from './extension-scenarios.repository';

const MAX_SCENARIOS = 50;
const DANGEROUS_KEYS = new Set(['code', 'js', 'script', 'eval', 'functionBody', 'remoteScriptUrl']);

type Plain = Record<string, unknown>;
interface ScenarioConfig {
  id: string; schemaVersion: 1; name: string; description: string | null; buttonLabel: string; icon: string | null;
  enabled: boolean; showInSelectionMenu: boolean; menuOrder: number;
  input: { type: 'selection_text' }; output: { type: 'text'; renderer: 'answer_window' };
  ai: { provider: 'auto'; model: string | null; temperature: number; maxTokens: number };
  prompt: { system: string; user: string };
  window: { resultPosition: 'inherit'|'under_action'|'floating'; theme: 'inherit'; draggable?: boolean; resizable?: boolean };
  createdAt: string; updatedAt: string;
}

function isObj(v: unknown): v is Plain { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function asObj(v: unknown, field: string): Plain { if (!isObj(v)) throw new BadRequestException(`${field} must be an object`); return v; }
function parseIso(v: unknown): string | null { if (typeof v !== 'string' || !v.trim()) return null; const d=new Date(v); return Number.isNaN(d.getTime())?null:d.toISOString(); }
function cleanString(v: unknown, field: string, max: number, required: boolean): string | null {
  if (v == null) { if (required) throw new BadRequestException(`${field} is required`); return null; }
  if (typeof v !== 'string') throw new BadRequestException(`${field} must be string`);
  const t = v.trim(); if (required && !t) throw new BadRequestException(`${field} is required`); if (t.length > max) throw new BadRequestException(`${field} too long`);
  return t;
}
function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function assertNoDangerousKeys(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertNoDangerousKeys);
  if (!isObj(value)) return;
  for (const [k, v] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(k)) throw new BadRequestException(`Dangerous field: ${k}`);
    assertNoDangerousKeys(v);
  }
}

@Injectable()
export class ExtensionScenariosService {
  private readonly logger = new Logger(ExtensionScenariosService.name);

  constructor(@Inject(ExtensionScenariosRepository) private readonly repo: ExtensionScenariosRepository) {}

  private async withRepositoryErrorContext<T>(operation: string, userId: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const prismaCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
      if (prismaCode === 'P2021') {
        this.logger.error(`Extension scenarios table missing. Run database migrations. operation=${operation} userId=${userId} prismaCode=${prismaCode}`);
        throw new InternalServerErrorException('Extension scenarios storage is not ready. Please run database migrations.');
      }

      this.logger.error(`Extension scenarios operation failed. operation=${operation} userId=${userId} prismaCode=${prismaCode || 'n/a'}`, (error as Error)?.stack);
      throw error;
    }
  }

  normalizeScenarioConfig(raw: unknown, options?: { scenarioId?: string; existingConfig?: Plain | null; now?: Date }): ScenarioConfig {
    assertNoDangerousKeys(raw);
    const now = (options?.now ?? new Date()).toISOString();
    const root = asObj(raw, 'scenario');
    const existing = options?.existingConfig ?? null;
    const id = options?.scenarioId ?? cleanString(root.id, 'id', 256, false) ?? `scn_${randomUUID()}`;

    const input = asObj(root.input ?? { type: 'selection_text' }, 'input');
    const output = asObj(root.output ?? { type: 'text', renderer: 'answer_window' }, 'output');
    if (input.type !== 'selection_text') throw new BadRequestException('input.type must be selection_text');
    if (output.type !== 'text') throw new BadRequestException('output.type must be text');
    if (output.renderer !== 'answer_window') throw new BadRequestException('output.renderer must be answer_window');

    const ai = asObj(root.ai ?? {}, 'ai');
    const prompt = asObj(root.prompt ?? {}, 'prompt');
    const windowRaw = asObj(root.window ?? {}, 'window');

    const menuOrderRaw = root.menuOrder;
    const menuOrder = menuOrderRaw == null ? 100 : Number.isInteger(menuOrderRaw) ? clamp(menuOrderRaw as number, -10000, 10000) : (() => { throw new BadRequestException('menuOrder must be integer'); })();
    const tempRaw = ai.temperature;
    const maxTokensRaw = ai.maxTokens;

    const createdAt = parseIso(existing?.createdAt) ?? parseIso(root.createdAt) ?? now;
    const resultPosition = typeof windowRaw.resultPosition === 'string' ? windowRaw.resultPosition : 'inherit';
    if (!['inherit', 'under_action', 'floating'].includes(resultPosition)) throw new BadRequestException('window.resultPosition invalid');

    return {
      id,
      schemaVersion: 1,
      name: cleanString(root.name, 'name', 80, true)!,
      description: cleanString(root.description, 'description', 500, false),
      buttonLabel: cleanString(root.buttonLabel, 'buttonLabel', 28, true)!,
      icon: cleanString(root.icon, 'icon', 8, false),
      enabled: typeof root.enabled === 'boolean' ? root.enabled : true,
      showInSelectionMenu: typeof root.showInSelectionMenu === 'boolean' ? root.showInSelectionMenu : true,
      menuOrder,
      input: { type: 'selection_text' },
      output: { type: 'text', renderer: 'answer_window' },
      ai: {
        provider: 'auto',
        model: cleanString(ai.model, 'ai.model', 150, false),
        temperature: typeof tempRaw === 'number' && Number.isFinite(tempRaw) ? clamp(tempRaw, 0, 2) : 0.3,
        maxTokens: Number.isInteger(maxTokensRaw) ? clamp(maxTokensRaw as number, 1, 20000) : 700,
      },
      prompt: {
        system: cleanString(prompt.system, 'prompt.system', 12000, true)!,
        user: cleanString(prompt.user, 'prompt.user', 12000, true)!,
      },
      window: {
        resultPosition: resultPosition as ScenarioConfig['window']['resultPosition'],
        theme: 'inherit',
        ...(typeof windowRaw.draggable === 'boolean' ? { draggable: windowRaw.draggable } : {}),
        ...(typeof windowRaw.resizable === 'boolean' ? { resizable: windowRaw.resizable } : {}),
      },
      createdAt,
      updatedAt: now,
    };
  }

  private toUpdateData(s: ScenarioConfig): Prisma.UserExtensionScenarioUpdateInput { return { schemaVersion: 1, name: s.name, description: s.description, buttonLabel: s.buttonLabel, icon: s.icon, enabled: s.enabled, showInSelectionMenu: s.showInSelectionMenu, menuOrder: s.menuOrder, configJson: s as unknown as Prisma.InputJsonValue, deletedAt: null }; }
  private toCreateData(userId: string, s: ScenarioConfig): Prisma.UserExtensionScenarioCreateInput { return { user: { connect: { id: userId } }, scenarioId: s.id, schemaVersion: 1, name: s.name, description: s.description, buttonLabel: s.buttonLabel, icon: s.icon, enabled: s.enabled, showInSelectionMenu: s.showInSelectionMenu, menuOrder: s.menuOrder, configJson: s as unknown as Prisma.InputJsonValue }; }

  async list(session: CurrentSessionSnapshot) { return this.withRepositoryErrorContext('list', session.user.id, async () => ({ schemaVersion: 1, items: (await this.repo.listActiveByUserId(session.user.id)).map((r) => r.configJson), serverTime: new Date().toISOString() })); }
  async sync(session: CurrentSessionSnapshot) { return this.withRepositoryErrorContext('sync', session.user.id, async () => { const r = await this.list(session); return { ...r, deleted: [] as string[] }; }); }

  async create(session: CurrentSessionSnapshot, rawScenario: unknown) {
    const userId = session.user.id;
    const scenario = this.normalizeScenarioConfig(rawScenario);
    const existing = await this.repo.findAnyByUserAndScenarioId(userId, scenario.id);
    if (existing && !existing.deletedAt) throw new ConflictException('Scenario already exists');
    if (!existing) {
      if ((await this.repo.countActiveByUserId(userId)) >= MAX_SCENARIOS) throw new ConflictException('Scenario limit reached');
      const saved = await this.repo.create(this.toCreateData(userId, scenario));
      return { scenario: saved.configJson };
    }
    const normalized = this.normalizeScenarioConfig(rawScenario, { scenarioId: scenario.id, existingConfig: existing.configJson as Plain });
    const saved = await this.repo.updateByUserAndScenarioId(userId, scenario.id, this.toUpdateData(normalized));
    return { scenario: saved.configJson };
  }

  async put(session: CurrentSessionSnapshot, scenarioId: string, rawScenario: unknown) {
    const userId = session.user.id;
    const existing = await this.repo.findAnyByUserAndScenarioId(userId, scenarioId);
    const normalized = this.normalizeScenarioConfig(rawScenario, { scenarioId, existingConfig: (existing?.configJson as Plain | undefined) ?? null });
    if (existing) return { scenario: (await this.repo.updateByUserAndScenarioId(userId, scenarioId, this.toUpdateData(normalized))).configJson };
    if ((await this.repo.countActiveByUserId(userId)) >= MAX_SCENARIOS) throw new ConflictException('Scenario limit reached');
    return { scenario: (await this.repo.create(this.toCreateData(userId, normalized))).configJson };
  }

  async patch(session: CurrentSessionSnapshot, scenarioId: string, patch: unknown) {
    const existing = await this.repo.findAnyByUserAndScenarioId(session.user.id, scenarioId);
    if (!existing || existing.deletedAt) throw new NotFoundException('Scenario not found');
    const patchObj = asObj(patch, 'patch');
    const current = asObj(existing.configJson, 'existingConfig');
    const merged: Plain = {
      ...current,
      ...patchObj,
      ai: { ...(isObj(current.ai) ? current.ai : {}), ...(isObj(patchObj.ai) ? patchObj.ai : {}) },
      prompt: { ...(isObj(current.prompt) ? current.prompt : {}), ...(isObj(patchObj.prompt) ? patchObj.prompt : {}) },
      window: { ...(isObj(current.window) ? current.window : {}), ...(isObj(patchObj.window) ? patchObj.window : {}) },
      input: { ...(isObj(current.input) ? current.input : {}), ...(isObj(patchObj.input) ? patchObj.input : {}) },
      output: { ...(isObj(current.output) ? current.output : {}), ...(isObj(patchObj.output) ? patchObj.output : {}) },
    };
    const normalized = this.normalizeScenarioConfig(merged, { scenarioId, existingConfig: current });
    return { scenario: (await this.repo.updateByUserAndScenarioId(session.user.id, scenarioId, this.toUpdateData(normalized))).configJson };
  }

  async remove(session: CurrentSessionSnapshot, scenarioId: string) {
    const existing = await this.repo.findAnyByUserAndScenarioId(session.user.id, scenarioId);
    if (!existing || existing.deletedAt) throw new NotFoundException('Scenario not found');
    await this.repo.updateByUserAndScenarioId(session.user.id, scenarioId, { deletedAt: new Date() });
    return { ok: true };
  }

  async bulk(session: CurrentSessionSnapshot, body: unknown) {
    const raw = asObj(body, 'body');
    const mode = raw.mode === 'replace' ? 'replace' : 'merge';
    const items = Array.isArray(raw.items) ? raw.items : [];
    const userId = session.user.id;

    const anyExisting = await this.repo.listAnyByUserId(userId);
    const existingMap = new Map(anyExisting.map((x) => [x.scenarioId, x]));
    const seen = new Set<string>();
    const normalized = items.map((item) => {
      const rawId = isObj(item) && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined;
      const candidateId = rawId ?? `scn_${randomUUID()}`;
      if (seen.has(candidateId)) throw new BadRequestException(`Duplicate scenario id in bulk request: ${candidateId}`);
      seen.add(candidateId);
      const existing = existingMap.get(candidateId);
      return this.normalizeScenarioConfig(item, { scenarioId: candidateId, existingConfig: (existing?.configJson as Plain | undefined) ?? null });
    });

    const existingActiveCount = anyExisting.filter((x) => !x.deletedAt).length;
    const newCount = normalized.filter((n) => !existingMap.has(n.id)).length;
    const replaceActiveAfter = mode === 'replace' ? normalized.length : undefined;
    const activeAfter = mode === 'replace' ? replaceActiveAfter! : existingActiveCount + newCount;
    if (activeAfter > MAX_SCENARIOS) throw new ConflictException('Scenario limit reached');

    await this.repo.transaction(async (tx) => {
      for (const s of normalized) {
        const existing = existingMap.get(s.id);
        if (existing) await this.repo.updateByUserAndScenarioId(userId, s.id, this.toUpdateData(s), tx);
        else await this.repo.create(this.toCreateData(userId, s), tx);
      }
      if (mode === 'replace') {
        for (const active of anyExisting.filter((x) => !x.deletedAt)) {
          if (!seen.has(active.scenarioId)) await this.repo.updateByUserAndScenarioId(userId, active.scenarioId, { deletedAt: new Date() }, tx);
        }
      }
    });

    return { schemaVersion: 1, items: (await this.repo.listActiveByUserId(userId)).map((r) => r.configJson), serverTime: new Date().toISOString() };
  }
}
