import Link from 'next/link';

async function getPreset(slug:string){ const res=await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/bff/extension/scenario-presets/${slug}`,{cache:'no-store'}).catch(()=>null); if(!res) return null; return res.json().catch(()=>null); }

export default async function PresetPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await getPreset(slug);
  const preset = payload?.data?.preset;
  if (!preset) return <main className='container'><h1>Preset не найден</h1></main>;
  return <main className='container'><h1>{preset.icon ? `${preset.icon} ` : ''}{preset.name}</h1><p>{preset.description}</p><p>Input: Выделенный текст · Output: Текст</p><p>Model: {preset.scenarioPreview?.ai?.model ?? 'по умолчанию'}</p><h3>System prompt</h3><pre>{preset.scenarioPreview?.promptPreview?.system ?? ''}</pre><h3>User prompt</h3><pre>{preset.scenarioPreview?.promptPreview?.user ?? ''}</pre><p>Устанавливайте presets только из источников, которым доверяете. Prompt будет использовать выделенный текст на страницах.</p><form action={`/bff/extension/scenario-presets/${encodeURIComponent(slug)}/install`} method='post'><button className='btn-primary' type='submit'>Установить в мой аккаунт</button></form><p>После установки: откройте расширение → Сценарии → Синхронизировать.</p><Link href='/app/extension/scenarios'>Открыть мои сценарии</Link></main>;
}
