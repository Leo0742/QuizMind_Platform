'use client';
import { useEffect, useMemo, useState } from 'react';

type Scenario = any;
const defaults = { ai: { provider: 'auto', model: null, temperature: 0.3, maxTokens: 700 }, input: { type: 'selection_text' }, output: { type: 'text', renderer: 'answer_window' }, window: { resultPosition: 'inherit', theme: 'inherit' } };

export function ExtensionScenariosClient() {
  const [items, setItems] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch('/bff/extension/scenarios', { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) { setError(payload?.error?.message ?? 'Не удалось загрузить сценарии'); setLoading(false); return; }
    setItems(payload.data?.items ?? []); setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function startCreate() {
    const now = new Date().toISOString();
    setEditing({ schemaVersion: 1, name: '', description: '', buttonLabel: '', icon: '', enabled: true, showInSelectionMenu: true, menuOrder: 100, prompt: { system: '', user: '' }, ...defaults, createdAt: now, updatedAt: now });
    setOpen(true);
  }

  async function save(s: Scenario) {
    const hasId = typeof s.id === 'string' && s.id.trim();
    const body = { scenario: s };
    const res = await fetch(hasId ? `/bff/extension/scenarios/${encodeURIComponent(s.id)}` : '/bff/extension/scenarios', { method: hasId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) throw new Error(payload?.error?.message ?? 'Ошибка сохранения');
    await load(); setOpen(false);
  }

  async function toggleEnabled(item: Scenario) {
    const res = await fetch(`/bff/extension/scenarios/${encodeURIComponent(item.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patch: { enabled: !item.enabled } }) });
    if (res.ok) await load();
  }
  async function remove(item: Scenario) { if (!confirm(`Удалить сценарий «${item.name}»?`)) return; const res = await fetch(`/bff/extension/scenarios/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); if (res.ok) await load(); }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ type: 'quizmind.customScenarios', schemaVersion: 1, exportedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'quizmind-custom-scenarios.json'; a.click(); URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    const text = await file.text(); const data = JSON.parse(text);
    const imported = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    const res = await fetch('/bff/extension/scenarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: 1, mode: 'merge', items: imported }) });
    if (res.ok) await load();
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    <article className='panel'><h2>Мои сценарии расширения</h2><p>Сценарии приватны для вашего аккаунта и синхронизируются с расширением. Сейчас поддерживаются сценарии «выделенный текст → текстовый ответ». Генерация изображений и маркетплейс появятся позже.</p></article>
    <div className='link-row'>
      <button className='btn-primary' onClick={startCreate}>Создать сценарий</button>
      <button className='btn-ghost' onClick={() => void load()}>Обновить</button>
      <button className='btn-ghost' onClick={exportJson}>Экспортировать JSON</button>
      <label className='btn-ghost' style={{ cursor: 'pointer' }}>Импортировать JSON<input type='file' accept='application/json' style={{ display: 'none' }} onChange={(e) => { const f=e.target.files?.[0]; if (f) void importJson(f); }} /></label>
    </div>
    {loading ? <p>Загрузка…</p> : error ? <p>{error}</p> : items.length===0 ? <section className='empty-state'><p>У вас пока нет пользовательских сценариев. Создайте первый сценарий или синхронизируйте расширение.</p></section> : items.map((item) => <article key={item.id} className='panel'><div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><h3>{item.icon ? `${item.icon} ` : ''}{item.name}</h3><p>{item.description}</p><p>Кнопка: {item.buttonLabel} · Модель: {item.ai?.model || 'по умолчанию'} · Порядок: {item.menuOrder}</p><p>Обновлено: {new Date(item.updatedAt).toLocaleString()}</p><p>{item.enabled ? 'Включён' : 'Выключен'} · {item.showInSelectionMenu ? 'В меню' : 'Скрыт'}</p></div><div className='link-row'><button className='btn-ghost' onClick={() => { setEditing(item); setOpen(true); }}>Редактировать</button><button className='btn-ghost' onClick={() => void toggleEnabled(item)}>{item.enabled ? 'Отключить' : 'Включить'}</button><button className='btn-danger' onClick={() => void remove(item)}>Удалить</button></div></div></article>)}
    {open && editing ? <Editor scenario={editing} onCancel={() => setOpen(false)} onSave={save} /> : null}
  </div>;
}

function Editor({ scenario, onCancel, onSave }: { scenario: Scenario; onCancel: () => void; onSave: (s: Scenario) => Promise<void> }) {
  const [form, setForm] = useState<Scenario>(scenario);
  const [err, setErr] = useState<string | null>(null);
  const valid = useMemo(() => {
    if (!form.name?.trim() || form.name.trim().length > 80) return 'Название: 1..80';
    if (!form.buttonLabel?.trim() || form.buttonLabel.trim().length > 28) return 'Текст кнопки: 1..28';
    if ((form.description ?? '').length > 500) return 'Описание: до 500';
    if ((form.icon ?? '').length > 8) return 'Иконка: до 8';
    if (!form.prompt?.system?.trim() || form.prompt.system.length > 12000) return 'Системный промпт обязателен (до 12000)';
    if (!form.prompt?.user?.trim() || form.prompt.user.length > 12000) return 'Пользовательский промпт обязателен (до 12000)';
    if (!Number.isInteger(Number(form.menuOrder)) || Number(form.menuOrder) < -10000 || Number(form.menuOrder) > 10000) return 'menuOrder: целое -10000..10000';
    return null;
  }, [form]);
  return <article className='panel'><h3>Редактор сценария</h3><p>Input: Выделенный текст · Output: Текст</p>{err ? <p>{err}</p> : null}
    <div style={{display:'grid',gap:8}}>
      <input placeholder='Название' value={form.name ?? ''} onChange={(e)=>setForm({...form,name:e.target.value})} />
      <textarea placeholder='Описание' value={form.description ?? ''} onChange={(e)=>setForm({...form,description:e.target.value})} />
      <input placeholder='Текст кнопки' value={form.buttonLabel ?? ''} onChange={(e)=>setForm({...form,buttonLabel:e.target.value})} />
      <input placeholder='Иконка / emoji' value={form.icon ?? ''} onChange={(e)=>setForm({...form,icon:e.target.value})} />
      <label><input type='checkbox' checked={Boolean(form.enabled)} onChange={(e)=>setForm({...form,enabled:e.target.checked})} /> Включён</label>
      <label><input type='checkbox' checked={Boolean(form.showInSelectionMenu)} onChange={(e)=>setForm({...form,showInSelectionMenu:e.target.checked})} /> Показывать в меню выделения</label>
      <input type='number' placeholder='Порядок в меню' value={form.menuOrder ?? 100} onChange={(e)=>setForm({...form,menuOrder:Number(e.target.value)})} />
      <input placeholder='Модель (по умолчанию = пусто)' value={form.ai?.model ?? ''} onChange={(e)=>setForm({...form,ai:{...form.ai,provider:'auto',model:e.target.value || null}})} />
      <textarea placeholder='Системный промпт' value={form.prompt?.system ?? ''} onChange={(e)=>setForm({...form,prompt:{...form.prompt,system:e.target.value}})} />
      <textarea placeholder='Пользовательский промпт' value={form.prompt?.user ?? ''} onChange={(e)=>setForm({...form,prompt:{...form.prompt,user:e.target.value}})} />
      <select value={form.window?.resultPosition ?? 'inherit'} onChange={(e)=>setForm({...form,window:{...form.window,resultPosition:e.target.value}})}><option value='inherit'>Наследовать настройки расширения</option><option value='under_action'>Сразу под меню</option><option value='floating'>В активной зоне или кастомном месте</option></select>
    </div>
    <p>Подсказки: {'{TEXT}'}, {'{PAGE_TITLE}'}, {'{PAGE_URL}'}, {'{LANGUAGE}'}</p>
    <div className='link-row'><button className='btn-primary' disabled={Boolean(valid)} onClick={async()=>{ if (valid) return setErr(valid); try { await onSave({ ...defaults, ...form, ai: { ...defaults.ai, ...(form.ai ?? {}) }, prompt: { ...(form.prompt ?? {}) }, window: { ...defaults.window, ...(form.window ?? {}) }, input: defaults.input, output: defaults.output, schemaVersion: 1 }); } catch (e) { setErr((e as Error).message); } }}>Сохранить</button><button className='btn-ghost' onClick={onCancel}>Отмена</button></div>
  </article>;
}
