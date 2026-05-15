import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, createPrismaClientOptions } from '@quizmind/database';

test('prisma client exposes extension scenario models', () => {
  const prisma = new PrismaClient(createPrismaClientOptions('postgresql://postgres:postgres@localhost:5432/quizmind'));
  assert.ok('userExtensionScenario' in prisma);
  assert.ok('extensionScenarioPreset' in prisma);
});
