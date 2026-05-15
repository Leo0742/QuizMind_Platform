'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PresetInstallClient } from './preset-install-client';

export function PresetPreviewClient({ slug }: { slug: string }) {
  const [preset, setPreset] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => {
    const res = await fetch(`/bff/extension/scenario-presets/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null) as any;
    if (!res.ok || payload?.ok === false) { setError(payload?.error?.message ?? 'Preset не найден'); return; }
    setPreset(payload?.data?.preset ?? payload?.preset ?? null);
  })(); }, [slug]);

  if (error) return <main className='container'><h1>{error}</h1></main>;
  if (!preset) return <main className='container'><p>Загрузка...</p></main>;

  return <main className='container'><h1>{preset.icon ? `${preset.icon} ` : ''}{preset.name}</h1><p>{preset.description}</p><p>Input: Выделенный текст · Output: Текст</p><p>Model: {preset.scenarioPreview?.ai?.model ?? 'по умолчанию'}</p><h3>System prompt</h3><pre>{preset.scenarioPreview?.promptPreview?.system ?? ''}</pre><h3>User prompt</h3><pre>{preset.scenarioPreview?.promptPreview?.user ?? ''}</pre><p>Устанавливайте presets только из источников, которым доверяете. Prompt будет использовать выделенный текст на страницах.</p><PresetInstallClient slug={slug} /><Link href='/app/extension/scenarios'>Открыть мои сценарии</Link></main>;
}
