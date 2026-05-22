import { type ProviderModelCatalogEntry } from '@quizmind/contracts';

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase());
}

export function isImageOutputModel(entry: ProviderModelCatalogEntry | undefined): boolean {
  if (!entry) return false;
  const tags = (entry.capabilityTags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes('image_output') || tags.includes('image-generation')) return true;

  const outputCandidates = [
    ...readStringArray(entry.outputModalities),
    ...readStringArray(entry.output_modalities),
    ...readStringArray(entry.supported_output_modalities),
    ...readStringArray(entry.architecture?.output_modalities),
  ];

  if (outputCandidates.includes('image') || outputCandidates.includes('images')) return true;

  return /(^|\/)(gpt-[\w.-]*image[\w.-]*|gpt-image-[\w.-]+|dall-e|flux|stable-diffusion|imagen)/i.test(entry.modelId);
}

export function supportsVisionInput(entry: ProviderModelCatalogEntry | undefined): boolean {
  if (!entry) return false;
  const tags = (entry.capabilityTags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes('vision') || tags.includes('image')) return true;

  const inputModalities = readStringArray(entry.architecture?.input_modalities);
  const modality = (entry.architecture?.modality ?? '').toLowerCase();
  return inputModalities.includes('image') || modality.includes('image+text->') || modality.startsWith('image->');
}
