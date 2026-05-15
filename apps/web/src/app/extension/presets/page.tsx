'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Sort = 'popular' | 'newest' | 'updated';
interface CatalogItem {
  slug: string;
  name: string;
  description?: string | null;
  buttonLabel?: string;
  icon?: string | null;
  category?: string | null;
  tags: string[];
  installCount: number;
  previewUrl: string;
  capability?: { capabilityKey: string; inputLabel: string; outputLabel: string };
}

interface CatalogResponse { items: CatalogItem[]; nextCursor: string | null }

async function readResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || payload?.ok === false) throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
  return (payload?.data ?? payload) as T;
}

export default function PresetsCatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(t); }, [qInput]);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (category) sp.set('category', category);
    sp.set('sort', sort);
    return sp.toString();
  }, [q, category, sort]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(null);
      try {
        const payload = await readResponse<CatalogResponse>(await fetch(`/bff/extension/scenario-presets/catalog?${query}`, { cache: 'no-store', signal: controller.signal }));
        if (!controller.signal.aborted) setItems(payload.items ?? []);
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [query]);

  return <main className='container'>
    <h1>Каталог сценариев QuizMind</h1>
    <p>Готовые пользовательские действия для расширения. Откройте preset, проверьте prompt и установите в свой аккаунт.</p>
    <div className='link-row'>
      <input placeholder='Поиск' value={qInput} onChange={(e) => setQInput(e.target.value)} />
      <select value={category} onChange={(e) => setCategory(e.target.value)}><option value=''>Все категории</option><option value='study'>study</option><option value='translation'>translation</option><option value='writing'>writing</option><option value='coding'>coding</option><option value='productivity'>productivity</option><option value='other'>other</option></select>
      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value='popular'>popular</option><option value='newest'>newest</option><option value='updated'>updated</option></select>
    </div>
    {loading ? <p>Загрузка...</p> : null}
    {error ? <p>{error}</p> : null}
    {!loading && !error && items.length === 0 ? <p>Пока нет публичных сценариев.</p> : null}
    {items.map((p) => <article key={p.slug} className='panel'><h3>{p.icon ? `${p.icon} ` : ''}{p.name}</h3><p>{p.description ?? '—'}</p><p><strong>{p.capability?.inputLabel ?? 'Выделенный текст'} → {p.capability?.outputLabel ?? 'Текст'}</strong></p><p>Категория: {p.category ?? '—'} · Теги: {p.tags.join(', ') || '—'} · Установок: {p.installCount ?? 0}</p><Link href={p.previewUrl}>Открыть preset</Link></article>)}
  </main>;
}
