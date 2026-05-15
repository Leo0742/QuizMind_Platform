ALTER TABLE "ExtensionScenarioPreset"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "featuredAt" TIMESTAMP(3),
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN "sourceLanguage" TEXT,
  ADD COLUMN "targetLanguage" TEXT;

CREATE INDEX "ExtensionScenarioPreset_visibility_disabledAt_moderationStatus_idx"
  ON "ExtensionScenarioPreset"("visibility", "disabledAt", "moderationStatus");
