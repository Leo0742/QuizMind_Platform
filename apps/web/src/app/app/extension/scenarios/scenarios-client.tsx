'use client';
import { useEffect, useMemo, useState } from 'react';

interface ScenarioConfig {
  id?: string;
  schemaVersion: 1;
  name: string;
  description?: string | null;
  buttonLabel: string;
  icon?: string | null;
  enabled: boolean;
  showInSelectionMenu: boolean;
  menuOrder: number;
  input: { type: 'selection_text' };
  output: { type: 'text'; renderer: 'answer_window' };
  ai: { provider: 'auto'; model: string | null; temperature: number; maxTokens: number };
  prompt: { system: string; user: string };
  window: { resultPosition: 'inherit' | 'under_action' | 'floating'; theme: 'inherit' };
  createdAt?: string;
  updatedAt?: string;
}

type BffEnvelope<T> = { ok?: boolean; data?: T; error?: { message?: string }; message?: string };
const defaults: Pick<ScenarioConfig, 'ai' | 'input' | 'output' | 'window'> = {
  ai: { provider: 'auto', model: null, temperature: 0.3, maxTokens: 700 },
  input: { type: 'selection_text' },
  output: { type: 'text', renderer: 'answer_window' },
  window: { resultPosition: 'inherit', theme: 'inherit' },
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

async function readBffResponse<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => null)) as BffEnvelope<T> | null;
  if (!res.ok || payload?.ok === false) throw new Error(payload?.error?.message ?? payload?.message ?? `HTTP ${res.status}`);
  return (payload?.data ?? payload) as T;
}

function readImportItems(raw: unknown): ScenarioConfig[] | null {
  if (Array.isArray(raw)) return raw as ScenarioConfig[];
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.items)) return rec.items as ScenarioConfig[];
  }
  return null;
}

export function ExtensionScenariosClient() {
  const [items, setItems] = useState<ScenarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Array<{slug:string;name:string;previewUrl:string;installCount?:number;visibility?:string}>>([]);
  const [editing, setEditing] = useState<ScenarioConfig | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await readBffResponse<{ schemaVersion: number; items: ScenarioConfig[] }>(await fetch('/bff/extension/scenarios', { cache: 'no-store' }));
      setItems(data.items ?? []);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function startCreate() {
    const now = new Date().toISOString();
    setEditing({ schemaVersion: 1, name: '', description: '', buttonLabel: '', icon: '', enabled: true, showInSelectionMenu: true, menuOrder: 100, prompt: { system: '', user: '' }, ...defaults, createdAt: now, updatedAt: now });
    setOpen(true);
  }

  async function save(s: ScenarioConfig) {
    setStatus(null); setError(null);
    const hasId = Boolean(s.id?.trim());
    await readBffResponse(await fetch(hasId ? `/bff/extension/scenarios/${encodeURIComponent(s.id!)}` : '/bff/extension/scenarios', { method: hasId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: s }) }));
    await load(); setOpen(false); setStatus('Сценарий сохранён.');
  }

  async function toggleEnabled(item: ScenarioConfig) {
    try { await readBffResponse(await fetch(`/bff/extension/scenarios/${encodeURIComponent(item.id!)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patch: { enabled: !item.enabled } }) })); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function createPreset(item: ScenarioConfig) {
    try {
      const data = await readBffResponse<{ preset: { slug: string; name: string; previewUrl: string } }>(await fetch(`/bff/extension/scenario-presets/from-scenario/${encodeURIComponent(item.id!)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'unlisted' }) }));
      setStatus(`Ссылка создана: ${data.preset.previewUrl}`);
      setShareLinks((prev) => [{ slug: data.preset.slug, name: data.preset.name, previewUrl: data.preset.previewUrl }, ...prev]);
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(item: ScenarioConfig) {
    if (!confirm(`Удалить сценарий «${item.name}»?`)) return;
    try { await readBffResponse(await fetch(`/bff/extension/scenarios/${encodeURIComponent(item.id!)}`, { method: 'DELETE' })); await load(); setStatus('Сценарий удалён.'); }
    catch (e) { setError((e as Error).message); }
  }

  function exportJson() {
    const ymd = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify({ type: 'quizmind.customScenarios', schemaVersion: 1, exportedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `quizmind-scenarios-${ymd}.json`; a.click(); URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    setStatus(null); setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = readImportItems(parsed);
      if (!imported) return setError('Невалидный формат файла импорта.');
      if (imported.length === 0) return setError('Файл не содержит сценариев для импорта.');
      if (!confirm(`Импортировать ${imported.length} сценариев? Они будут объединены с текущими сценариями.`)) return;
      await readBffResponse(await fetch('/bff/extension/scenarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, mode: 'merge', items: imported }) }));
      await load(); setStatus(`Импортировано сценариев: ${imported.length}.`);
    } catch { setError('Невалидный JSON-файл.'); }
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    <article className='panel'><h2>Мои сценарии расширения</h2><p>Сценарии приватны для вашего аккаунта и синхронизируются с расширением. Сейчас поддерживаются сценарии «выделенный текст → текстовый ответ». Генерация изображений и маркетплейс появятся позже.</p></article>
    {status ? <article className='panel'><p>{status}</p></article> : null}
    {error ? <article className='panel'><p>{error}</p></article> : null}
    <div className='link-row'>
      <button className='btn-primary' onClick={startCreate}>Создать сценарий</button>
      <button className='btn-ghost' onClick={() => void load()}>Обновить</button>
      <button className='btn-ghost' onClick={exportJson}>Экспортировать JSON</button>
      <label className='btn-ghost' style={{ cursor: 'pointer' }}>Импортировать JSON<input type='file' accept='application/json' style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); }} /></label>
    </div>
    {loading ? <p>Загрузка…</p> : items.length === 0 ? <section className='empty-state'><p>У вас пока нет пользовательских сценариев. Создайте первый сценарий или синхронизируйте расширение.</p></section> : items.map((item) => <article key={item.id} className='panel'><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><h3>{item.icon ? `${item.icon} ` : ''}{item.name}</h3><p>{item.description}</p><p>Кнопка: {item.buttonLabel} · Модель: {item.ai?.model || 'по умолчанию'} · Порядок: {item.menuOrder}</p><p>Обновлено: {formatDate(item.updatedAt)}</p><p>{item.enabled ? 'Включён' : 'Выключен'} · {item.showInSelectionMenu ? 'В меню' : 'Скрыт'}</p></div><div className='link-row'><button className='btn-ghost' onClick={() => { setEditing(item); setOpen(true); }}>Редактировать</button><button className='btn-ghost' onClick={() => void toggleEnabled(item)}>{item.enabled ? 'Отключить' : 'Включить'}</button><button className='btn-ghost' onClick={() => void createPreset(item)}>Поделиться</button><button className='btn-danger' onClick={() => void remove(item)}>Удалить</button></div></div></article>)}
    {shareLinks.length > 0 ? <article className='panel'><h3>Мои preset-ссылки</h3>{shareLinks.map((p) => <p key={p.slug}><a href={p.previewUrl}>{p.name}</a> ({p.slug})</p>)}</article> : null}
    {open && editing ? <Editor scenario={editing} onCancel={() => setOpen(false)} onSave={save} /> : null}
  </div>;
}

function Editor({ scenario, onCancel, onSave }: { scenario: ScenarioConfig; onCancel: () => void; onSave: (s: ScenarioConfig) => Promise<void> }) {
  const [form, setForm] = useState<ScenarioConfig>(scenario);
  const [err, setErr] = useState<string | null>(null);
  const validation = useMemo(() => {
    if (!form.name?.trim() || form.name.trim().length > 80) return 'Название: 1..80';
    if (!form.buttonLabel?.trim() || form.buttonLabel.trim().length > 28) return 'Текст кнопки: 1..28';
    if ((form.description ?? '').length > 500) return 'Описание: до 500';
    if ((form.icon ?? '').length > 8) return 'Иконка: до 8';
    if (!form.prompt?.system?.trim() || form.prompt.system.length > 12000) return 'Системный промпт обязателен (до 12000)';
    if (!form.prompt?.user?.trim() || form.prompt.user.length > 12000) return 'Пользовательский промпт обязателен (до 12000)';
    if (!Number.isInteger(Number(form.menuOrder)) || Number(form.menuOrder) < -10000 || Number(form.menuOrder) > 10000) return 'menuOrder: целое -10000..10000';
    if (!Number.isFinite(Number(form.ai.temperature)) || Number(form.ai.temperature) < 0 || Number(form.ai.temperature) > 2) return 'temperature: 0..2';
    if (!Number.isInteger(Number(form.ai.maxTokens)) || Number(form.ai.maxTokens) < 1 || Number(form.ai.maxTokens) > 20000) return 'maxTokens: 1..20000';
    if (!['inherit', 'under_action', 'floating'].includes(form.window.resultPosition)) return 'Некорректное положение окна';
    return null;
  }, [form]);

  return <article className='panel'><h3>Редактор сценария</h3><p>Input: Выделенный текст · Output: Текст</p>{err ? <p>{err}</p> : null}
    <div style={{ display: 'grid', gap: 8 }}>
      <input placeholder='Название' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <textarea placeholder='Описание' value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input placeholder='Текст кнопки' value={form.buttonLabel} onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })} />
      <input placeholder='Иконка / emoji' value={form.icon ?? ''} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
      <label><input type='checkbox' checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Включён</label>
      <label><input type='checkbox' checked={form.showInSelectionMenu} onChange={(e) => setForm({ ...form, showInSelectionMenu: e.target.checked })} /> Показывать в меню выделения</label>
      <input type='number' placeholder='Порядок в меню' value={form.menuOrder} onChange={(e) => setForm({ ...form, menuOrder: Number(e.target.value) })} />
      <input placeholder='Модель (по умолчанию = пусто)' value={form.ai.model ?? ''} onChange={(e) => setForm({ ...form, ai: { ...form.ai, provider: 'auto', model: e.target.value || null } })} />
      <input type='number' step='0.1' min={0} max={2} placeholder='Temperature' value={form.ai.temperature} onChange={(e) => setForm({ ...form, ai: { ...form.ai, temperature: Number(e.target.value) } })} />
      <input type='number' min={1} max={20000} placeholder='Max tokens' value={form.ai.maxTokens} onChange={(e) => setForm({ ...form, ai: { ...form.ai, maxTokens: Number(e.target.value) } })} />
      <textarea placeholder='Системный промпт' value={form.prompt.system} onChange={(e) => setForm({ ...form, prompt: { ...form.prompt, system: e.target.value } })} />
      <textarea placeholder='Пользовательский промпт' value={form.prompt.user} onChange={(e) => setForm({ ...form, prompt: { ...form.prompt, user: e.target.value } })} />
      <select value={form.window.resultPosition} onChange={(e) => setForm({ ...form, window: { ...form.window, resultPosition: e.target.value as ScenarioConfig['window']['resultPosition'] } })}><option value='inherit'>Наследовать настройки расширения</option><option value='under_action'>Сразу под меню</option><option value='floating'>В активной зоне или кастомном месте</option></select>
    </div>
    <p>Подсказки: {'{TEXT}'}, {'{PAGE_TITLE}'}, {'{PAGE_URL}'}, {'{LANGUAGE}'}</p>
    <div className='link-row'><button className='btn-primary' disabled={Boolean(validation)} onClick={async () => { if (validation) return setErr(validation); try { await onSave({ ...form, schemaVersion: 1, ...defaults, ai: { ...form.ai, provider: 'auto', model: form.ai.model?.trim() ? form.ai.model.trim() : null }, input: defaults.input, output: defaults.output, window: { resultPosition: form.window.resultPosition, theme: 'inherit' } }); } catch (e) { setErr((e as Error).message); } }}>Сохранить</button><button className='btn-ghost' onClick={onCancel}>Отмена</button></div>
  </article>;
}
