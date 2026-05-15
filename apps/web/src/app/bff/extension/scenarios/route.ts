import { NextResponse } from 'next/server';
import { API_URL } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

function jsonError(message: string, status = 400) { return NextResponse.json({ ok: false, error: { message } }, { status }); }

async function proxy(method: string, path: string, body?: unknown) {
  const token = await getAccessTokenFromCookies();
  if (!token) return jsonError('Sign in required.', 401);
  const res = await fetch(`${API_URL}${path}`, { method, cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const payload = await res.json().catch(() => null);
  return NextResponse.json(payload ?? { ok: false, error: { message: 'Invalid upstream response' } }, { status: res.status || 500 });
}

export async function GET() { return proxy('GET', '/extension/scenarios'); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body && Object.prototype.hasOwnProperty.call(body, 'scenario')) return proxy('POST', '/extension/scenarios', body);
  return proxy('POST', '/extension/scenarios/bulk', body ?? {});
}
