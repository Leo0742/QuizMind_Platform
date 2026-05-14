import { NextResponse } from 'next/server';
import { API_URL } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

function jsonError(message: string, status = 400) { return NextResponse.json({ ok: false, error: { message } }, { status }); }
async function proxy(method: string, path: string, body?: unknown) {
  const token = await getAccessTokenFromCookies();
  if (!token) return jsonError('Sign in required.', 401);
  const res = await fetch(`${API_URL}${path}`, { method, cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const payload = await res.json().catch(() => null);
  return NextResponse.json(payload ?? { ok: false, error: { message: 'Invalid upstream response' } }, { status: res.status || 500 });
}

export async function PUT(request: Request, context: { params: Promise<{ scenarioId: string }> }) { const { scenarioId } = await context.params; return proxy('PUT', `/extension/scenarios/${encodeURIComponent(scenarioId)}`, await request.json().catch(() => ({}))); }
export async function PATCH(request: Request, context: { params: Promise<{ scenarioId: string }> }) { const { scenarioId } = await context.params; return proxy('PATCH', `/extension/scenarios/${encodeURIComponent(scenarioId)}`, await request.json().catch(() => ({}))); }
export async function DELETE(_request: Request, context: { params: Promise<{ scenarioId: string }> }) { const { scenarioId } = await context.params; return proxy('DELETE', `/extension/scenarios/${encodeURIComponent(scenarioId)}`); }
