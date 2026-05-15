import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionScenarioPresetsRepository } from './extension-scenario-presets.repository';
import { ExtensionScenariosRepository } from './extension-scenarios.repository';
import { ExtensionScenariosService } from './extension-scenarios.service';

const ALLOWED_CATEGORIES = ['study', 'translation', 'writing', 'coding', 'productivity', 'other'] as const;
const ALLOWED_VISIBILITY = ['private', 'unlisted', 'public'] as const;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;
const MAX_LANGUAGE_LENGTH = 60;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

@Injectable()
export class ExtensionScenarioPresetsService {
  constructor(
    @Inject(ExtensionScenarioPresetsRepository) private readonly presets: ExtensionScenarioPresetsRepository,
    @Inject(ExtensionScenariosRepository) private readonly scenarios: ExtensionScenariosRepository,
    @Inject(ExtensionScenariosService) private readonly scenarioService: ExtensionScenariosService,
  ) {}

  private normalizeVisibility(raw: unknown): 'private' | 'unlisted' | 'public' {
    return ALLOWED_VISIBILITY.includes(raw as any) ? (raw as any) : 'unlisted';
  }

  private normalizeCategory(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().toLowerCase();
    return ALLOWED_CATEGORIES.includes(value as any) ? value : null;
  }

  private normalizeTags(raw: unknown): string[] {
    const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
    const dedup = new Set<string>();
    for (const item of values) {
      if (item === null || item === undefined) continue;
      const normalized = String(item).trim().toLowerCase();
      if (!normalized || normalized.length > MAX_TAG_LENGTH) continue;
      dedup.add(normalized);
      if (dedup.size >= MAX_TAGS) break;
    }
    return [...dedup];
  }

  private normalizeText(raw: unknown, max: number): string | null {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim();
    if (!normalized) return null;
    return normalized.slice(0, max);
  }

  private normalizeLanguage(raw: unknown): string | null {
    return this.normalizeText(raw, MAX_LANGUAGE_LENGTH);
  }

  private mapPresetSummary(p: any) {
    const capability = this.getScenarioCapabilitySummary(p.configJson);
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      buttonLabel: p.buttonLabel,
      icon: p.icon,
      visibility: p.visibility,
      category: p.category,
      tags: this.normalizeTags(p.tags),
      publishedAt: p.publishedAt,
      moderationStatus: p.moderationStatus,
      installCount: p.installCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      previewUrl: `/extension/presets/${p.slug}`,
      capability,
    };
  }


  private mapCatalogPresetCard(p: any) {
    const capability = this.getScenarioCapabilitySummary(p.configJson);
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      buttonLabel: p.buttonLabel,
      icon: p.icon,
      category: p.category,
      tags: this.normalizeTags(p.tags),
      installCount: p.installCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      publishedAt: p.publishedAt,
      previewUrl: `/extension/presets/${p.slug}`,
      capability,
    };
  }

  private getScenarioCapabilitySummary(config: any) {
    if (config?.input?.type === 'selection_text' && config?.output?.type === 'text') {
      return { capabilityKey: 'selection_text_to_text', inputLabel: 'Выделенный текст', outputLabel: 'Текст' };
    }
    return { capabilityKey: 'unknown', inputLabel: '—', outputLabel: '—' };
  }

  async createFromScenario(session: CurrentSessionSnapshot, scenarioId: string, raw?: any) {
    const scenario = await this.scenarios.findAnyByUserAndScenarioId(session.user.id, scenarioId);
    if (!scenario || scenario.deletedAt) throw new NotFoundException('Scenario not found');

    const normalized = this.scenarioService.normalizeScenarioConfig(scenario.configJson, { existingConfig: scenario.configJson as any });
    const visibility = this.normalizeVisibility(raw?.visibility);

    const preset = await this.presets.create({
      owner: { connect: { id: session.user.id } },
      sourceScenarioId: scenarioId,
      slug: `p_${randomUUID()}`,
      name: this.normalizeText(raw?.name, MAX_NAME_LENGTH) ?? normalized.name,
      description: this.normalizeText(raw?.description, MAX_DESCRIPTION_LENGTH) ?? normalized.description,
      buttonLabel: normalized.buttonLabel,
      icon: normalized.icon,
      schemaVersion: 1,
      presetVersion: 1,
      visibility,
      category: this.normalizeCategory(raw?.category),
      tags: this.normalizeTags(raw?.tags),
      sourceLanguage: this.normalizeLanguage(raw?.sourceLanguage),
      targetLanguage: this.normalizeLanguage(raw?.targetLanguage),
      publishedAt: visibility === 'public' ? new Date() : null,
      configJson: normalized as any,
    });

    return { preset: { slug: preset.slug, name: preset.name, description: preset.description, buttonLabel: preset.buttonLabel, icon: preset.icon, visibility: preset.visibility, previewUrl: `/extension/presets/${preset.slug}` } };
  }

  async mine(session: CurrentSessionSnapshot) {
    return { items: (await this.presets.listMine(session.user.id)).map((p) => this.mapPresetSummary(p)) };
  }

  async listCatalog(raw: any) {
    const limit = Math.min(Math.max(Number(raw?.limit) || 24, 1), 50);
    const offset = Number(raw?.cursor) || 0;
    const q = this.normalizeText(raw?.q, 120) ?? '';
    const category = this.normalizeCategory(raw?.category);
    const tag = this.normalizeTags([raw?.tag])[0] ?? null;
    if (tag) throw new BadRequestException('Tag filtering is not supported yet.');

    const where: any = { visibility: 'public', disabledAt: null, moderationStatus: 'approved' };
    if (category) where.category = category;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { buttonLabel: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy = raw?.sort === 'newest' ? [{ publishedAt: 'desc' }] : raw?.sort === 'updated' ? [{ updatedAt: 'desc' }] : [{ installCount: 'desc' }, { publishedAt: 'desc' }];

    const rows = await this.presets.listCatalog(where, orderBy as any, offset, limit + 1);

    return {
      items: rows.slice(0, limit).map((p) => this.mapCatalogPresetCard(p)),
      nextCursor: rows.length > limit ? String(offset + limit) : null,
    };
  }

  async updateMetadata(session: CurrentSessionSnapshot, slug: string, raw: any) {
    const preset = await this.presets.findBySlug(slug);
    if (!preset) throw new NotFoundException('Preset not found');
    if (preset.ownerUserId !== session.user.id) throw new ForbiddenException('Not allowed');
    if (preset.visibility === 'disabled' || preset.disabledAt) throw new BadRequestException('Disabled preset cannot be updated');

    const visibility = raw?.visibility ? this.normalizeVisibility(raw.visibility) : preset.visibility;

    return {
      preset: await this.presets.updateBySlug(slug, {
        name: raw?.name === undefined ? undefined : (this.normalizeText(raw.name, MAX_NAME_LENGTH) ?? preset.name),
        description: raw?.description === undefined ? undefined : this.normalizeText(raw.description, MAX_DESCRIPTION_LENGTH),
        visibility,
        category: raw?.category === undefined ? undefined : this.normalizeCategory(raw.category),
        tags: raw?.tags === undefined ? undefined : this.normalizeTags(raw.tags),
        sourceLanguage: raw?.sourceLanguage === undefined ? undefined : this.normalizeLanguage(raw.sourceLanguage),
        targetLanguage: raw?.targetLanguage === undefined ? undefined : this.normalizeLanguage(raw.targetLanguage),
        publishedAt: visibility === 'public' && !preset.publishedAt ? new Date() : undefined,
      }),
    };
  }

  async preview(slug: string, session?: CurrentSessionSnapshot | null) {
    const p = await this.presets.findBySlug(slug);
    if (!p || p.disabledAt || p.visibility === 'disabled') throw new NotFoundException('Preset not found');
    if (p.visibility === 'private' && session?.user.id !== p.ownerUserId) throw new NotFoundException('Preset not found');
    const cfg = p.configJson as any;

    return {
      preset: {
        slug: p.slug, name: p.name, description: p.description, buttonLabel: p.buttonLabel, icon: p.icon,
        schemaVersion: p.schemaVersion, presetVersion: p.presetVersion, visibility: p.visibility,
        category: p.category, tags: this.normalizeTags(p.tags), publishedAt: p.publishedAt,
        installCount: p.installCount, createdAt: p.createdAt, updatedAt: p.updatedAt,
        capability: this.getScenarioCapabilitySummary(cfg),
        scenarioPreview: {
          input: cfg.input, output: cfg.output, ai: cfg.ai,
          promptPreview: { system: cfg.prompt?.system ?? '', user: cfg.prompt?.user ?? '' },
          window: { resultPosition: cfg.window?.resultPosition ?? 'inherit' },
        },
      },
    };
  }

  async install(session: CurrentSessionSnapshot, slug: string) {
    const p = await this.presets.findBySlug(slug);
    if (!p || p.disabledAt || (p.visibility !== 'unlisted' && p.visibility !== 'public')) throw new NotFoundException('Preset not found');
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
    const p = await this.presets.findBySlug(slug);
    if (!p) throw new NotFoundException('Preset not found');
    if (p.ownerUserId !== session.user.id) throw new ForbiddenException('Not allowed');
    await this.presets.updateBySlug(slug, { visibility: 'disabled', disabledAt: new Date() });
    return { ok: true };
  }
}
