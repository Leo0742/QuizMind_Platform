CREATE TABLE "ExtensionScenarioPreset" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourceScenarioId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "buttonLabel" TEXT NOT NULL,
  "icon" TEXT,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "presetVersion" INTEGER NOT NULL DEFAULT 1,
  "visibility" TEXT NOT NULL DEFAULT 'unlisted',
  "configJson" JSONB NOT NULL,
  "installCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  CONSTRAINT "ExtensionScenarioPreset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionScenarioPreset_slug_key" ON "ExtensionScenarioPreset"("slug");
CREATE INDEX "ExtensionScenarioPreset_ownerUserId_createdAt_idx" ON "ExtensionScenarioPreset"("ownerUserId", "createdAt");
CREATE INDEX "ExtensionScenarioPreset_visibility_disabledAt_idx" ON "ExtensionScenarioPreset"("visibility", "disabledAt");
ALTER TABLE "ExtensionScenarioPreset" ADD CONSTRAINT "ExtensionScenarioPreset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
