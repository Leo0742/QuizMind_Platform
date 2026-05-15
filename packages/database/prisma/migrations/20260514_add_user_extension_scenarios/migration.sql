CREATE TABLE "UserExtensionScenario" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "buttonLabel" TEXT NOT NULL,
  "icon" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "showInSelectionMenu" BOOLEAN NOT NULL DEFAULT true,
  "menuOrder" INTEGER NOT NULL DEFAULT 100,
  "configJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "UserExtensionScenario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserExtensionScenario_userId_scenarioId_key" ON "UserExtensionScenario"("userId", "scenarioId");
CREATE INDEX "UserExtensionScenario_userId_deletedAt_idx" ON "UserExtensionScenario"("userId", "deletedAt");
CREATE INDEX "UserExtensionScenario_userId_updatedAt_idx" ON "UserExtensionScenario"("userId", "updatedAt");

ALTER TABLE "UserExtensionScenario"
ADD CONSTRAINT "UserExtensionScenario_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
