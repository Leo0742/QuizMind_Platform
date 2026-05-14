import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const userExtensionScenarioSelect = {
  id: true,
  userId: true,
  scenarioId: true,
  schemaVersion: true,
  name: true,
  description: true,
  buttonLabel: true,
  icon: true,
  enabled: true,
  showInSelectionMenu: true,
  menuOrder: true,
  configJson: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserExtensionScenarioSelect;

export type UserExtensionScenarioRecord = Prisma.UserExtensionScenarioGetPayload<{ select: typeof userExtensionScenarioSelect }>;

@Injectable()
export class ExtensionScenariosRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listActiveByUserId(userId: string) {
    return this.prisma.userExtensionScenario.findMany({ where: { userId, deletedAt: null }, orderBy: [{ menuOrder: 'asc' }, { updatedAt: 'asc' }, { createdAt: 'asc' }], select: userExtensionScenarioSelect });
  }

  countActiveByUserId(userId: string) {
    return this.prisma.userExtensionScenario.count({ where: { userId, deletedAt: null } });
  }

  findAnyByUserAndScenarioId(userId: string, scenarioId: string) {
    return this.prisma.userExtensionScenario.findUnique({ where: { userId_scenarioId: { userId, scenarioId } }, select: userExtensionScenarioSelect });
  }

  updateByUserAndScenarioId(userId: string, scenarioId: string, data: Prisma.UserExtensionScenarioUpdateInput) {
    return this.prisma.userExtensionScenario.update({ where: { userId_scenarioId: { userId, scenarioId } }, data, select: userExtensionScenarioSelect });
  }

  create(data: Prisma.UserExtensionScenarioCreateInput) {
    return this.prisma.userExtensionScenario.create({ data, select: userExtensionScenarioSelect });
  }

  tx() { return this.prisma; }
}
