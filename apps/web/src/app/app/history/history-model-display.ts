function titleToken(token: string): string {
  if (/^\d+[a-z]?$/i.test(token)) return token.toUpperCase();
  if (/^[a-z]\d+[a-z]?$/i.test(token)) return token.toUpperCase();
  if (/^gpt$/i.test(token)) return 'GPT';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function stripTechnicalModelSuffixes(value: string): string {
  return value
    // RouterAI can return versioned ids such as openai/gpt-5.3-chat-20260303.
    // The date is useful internally but noisy in UI history cards.
    .replace(/[-_ ]+(?:19|20)\d{6}$/i, '')
    .replace(/[-_ ]+latest$/i, '')
    .trim();
}

export function getReadableModelName(modelId: string): string {
  const normalized = (modelId || '').trim();
  if (!normalized) return 'Unknown model';

  const withoutSuffix = stripTechnicalModelSuffixes(normalized.replace(/:free$/i, ''));
  const segments = withoutSuffix.split('/').filter(Boolean);
  const leaf = stripTechnicalModelSuffixes((segments[segments.length - 1] || withoutSuffix)
    .replace(/[-_]+/g, ' ')
    .trim());

  if (!leaf) return withoutSuffix;

  return leaf
    .split(/\s+/)
    .filter(Boolean)
    .map(titleToken)
    .join(' ');
}
