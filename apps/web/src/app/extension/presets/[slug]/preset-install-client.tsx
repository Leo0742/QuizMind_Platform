'use client';
import Link from 'next/link';
import { useState } from 'react';

export function PresetInstallClient({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function install() {
    setLoading(true); setError(null); setStatus(null);
    const res = await fetch(`/bff/extension/scenario-presets/${encodeURIComponent(slug)}/install`, { method: 'POST' });
    const payload = await res.json().catch(() => null) as any;
    setLoading(false);
    if (!res.ok || payload?.ok === false) {
      const msg = payload?.error?.message ?? payload?.message ?? `HTTP ${res.status}`;
      if (res.status === 401) {
        setError('Войдите, чтобы установить preset.');
      } else {
        setError(msg);
      }
      return;
    }
    setStatus('Preset установлен. Откройте расширение → Сценарии → Синхронизировать.');
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button className='btn-primary' type='button' onClick={() => void install()} disabled={loading}>
        {loading ? 'Установка...' : 'Установить в мой аккаунт'}
      </button>
      {error ? <p>{error}</p> : null}
      {status ? <p>{status}</p> : null}
      {error?.includes('Войдите') ? <Link href={`/auth/login?next=${encodeURIComponent(`/extension/presets/${slug}`)}`}>Войти</Link> : null}
    </div>
  );
}
