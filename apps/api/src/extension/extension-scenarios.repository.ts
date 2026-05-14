import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@quizmind/database';

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

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ExtensionScenariosRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private model(db?: DbClient) {
    return (db ?? this.prisma).userExtensionScenario;
  }

  listAnyByUserId(userId: string, db?: DbClient) {
    return this.model(db).findMany({ where: { userId }, orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }], select: userExtensionScenarioSelect });
  }

  listActiveByUserId(userId: string, db?: DbClient) {
    return this.model(db).findMany({ where: { userId, deletedAt: null }, orderBy: [{ menuOrder: 'asc' }, { updatedAt: 'asc' }, { createdAt: 'asc' }], select: userExtensionScenarioSelect });
  }

  countActiveByUserId(userId: string, db?: DbClient) {
    return this.model(db).count({ where: { userId, deletedAt: null } });
  }

  findAnyByUserAndScenarioId(userId: string, scenarioId: string, db?: DbClient) {
    return this.model(db).findUnique({ where: { userId_scenarioId: { userId, scenarioId } }, select: userExtensionScenarioSelect });
  }

  create(data: Prisma.UserExtensionScenarioCreateInput, db?: DbClient) {
    return this.model(db).create({ data, select: userExtensionScenarioSelect });
  }

  updateByUserAndScenarioId(userId: string, scenarioId: string, data: Prisma.UserExtensionScenarioUpdateInput, db?: DbClient) {
    return this.model(db).update({ where: { userId_scenarioId: { userId, scenarioId } }, data, select: userExtensionScenarioSelect });
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
