import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionScenarioPresetsRepository } from './extension-scenario-presets.repository';
import { ExtensionScenariosRepository } from './extension-scenarios.repository';
import { ExtensionScenariosService } from './extension-scenarios.service';

@Injectable()
export class ExtensionScenarioPresetsService {
  constructor(private readonly presets: ExtensionScenarioPresetsRepository, private readonly scenarios: ExtensionScenariosRepository, private readonly scenarioService: ExtensionScenariosService) {}

  async createFromScenario(session: CurrentSessionSnapshot, scenarioId: string, raw?: { visibility?: string; name?: string; description?: string }) {
    const scenario = await this.scenarios.findAnyByUserAndScenarioId(session.user.id, scenarioId);
    if (!scenario || scenario.deletedAt) throw new NotFoundException('Scenario not found');
    const normalized = this.scenarioService.normalizeScenarioConfig(scenario.configJson, { existingConfig: scenario.configJson as any });
    const preset = await this.presets.create({ owner: { connect: { id: session.user.id } }, sourceScenarioId: scenarioId, slug: `p_${randomUUID()}`, name: raw?.name?.trim() || normalized.name, description: raw?.description?.trim() || normalized.description, buttonLabel: normalized.buttonLabel, icon: normalized.icon, schemaVersion: 1, presetVersion: 1, visibility: raw?.visibility === 'private' ? 'private' : 'unlisted', configJson: normalized as any });
    return { preset: { slug: preset.slug, name: preset.name, description: preset.description, buttonLabel: preset.buttonLabel, icon: preset.icon, visibility: preset.visibility, previewUrl: `/extension/presets/${preset.slug}` } };
  }

  async mine(session: CurrentSessionSnapshot) { return { items: (await this.presets.listMine(session.user.id)).map((p) => ({ slug:p.slug,name:p.name,description:p.description,buttonLabel:p.buttonLabel,icon:p.icon,visibility:p.visibility,installCount:p.installCount,createdAt:p.createdAt,updatedAt:p.updatedAt,previewUrl:`/extension/presets/${p.slug}` })) }; }

  async preview(slug: string, session?: CurrentSessionSnapshot | null) {
    const p = await this.presets.findBySlug(slug); if (!p || p.disabledAt || p.visibility === 'disabled') throw new NotFoundException('Preset not found');
    if (p.visibility === 'private' && session?.user.id !== p.ownerUserId) throw new NotFoundException('Preset not found');
    const cfg = p.configJson as any;
    return { preset: { slug:p.slug,name:p.name,description:p.description,buttonLabel:p.buttonLabel,icon:p.icon,schemaVersion:p.schemaVersion,presetVersion:p.presetVersion,visibility:p.visibility,installCount:p.installCount,createdAt:p.createdAt,updatedAt:p.updatedAt,scenarioPreview:{input:cfg.input,output:cfg.output,ai:cfg.ai,promptPreview:{system:cfg.prompt?.system ?? '', user:cfg.prompt?.user ?? ''},window:{resultPosition:cfg.window?.resultPosition ?? 'inherit'}} } };
  }

  async install(session: CurrentSessionSnapshot, slug: string) {
    const p = await this.presets.findBySlug(slug); if (!p || p.disabledAt || p.visibility !== 'unlisted') throw new NotFoundException('Preset not found');
    if ((await this.scenarios.countActiveByUserId(session.user.id)) >= 50) throw new ConflictException('Scenario limit reached');
    const newScenarioId = `scn_${randomUUID()}`;
    const now = new Date();
    const nowIso = now.toISOString();
    const normalized = this.scenarioService.normalizeScenarioConfig(p.configJson, { scenarioId: newScenarioId, now });
    const installedConfig = { ...normalized, id: newScenarioId, enabled: true, showInSelectionMenu: normalized.showInSelectionMenu ?? true, createdAt: nowIso, updatedAt: nowIso };

    const created = await this.presets.transaction(async (tx) => {
      const scenarioCreated = await this.scenarios.create({ user: { connect: { id: session.user.id } }, scenarioId: installedConfig.id, schemaVersion: 1, name: installedConfig.name, description: installedConfig.description, buttonLabel: installedConfig.buttonLabel, icon: installedConfig.icon, enabled: installedConfig.enabled, showInSelectionMenu: installedConfig.showInSelectionMenu, menuOrder: installedConfig.menuOrder, configJson: installedConfig as any }, tx);
      await this.presets.updateBySlug(slug, { installCount: { increment: 1 } }, tx);
      return scenarioCreated;
    });
    return { scenario: created.configJson };
  }

  async disable(session: CurrentSessionSnapshot, slug: string) {
    const p = await this.presets.findBySlug(slug); if (!p) throw new NotFoundException('Preset not found');
    if (p.ownerUserId !== session.user.id) throw new ForbiddenException('Not allowed');
    await this.presets.updateBySlug(slug, { visibility: 'disabled', disabledAt: new Date() });
    return { ok: true };
  }
}
