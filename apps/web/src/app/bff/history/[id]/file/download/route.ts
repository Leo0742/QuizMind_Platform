import { NextResponse } from 'next/server';

import { API_URL } from '../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../lib/auth-session';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: { message: 'Sign in to download history files.' } }, { status: 401 });
  }

  const { id } = await params;
  const upstream = await fetch(`${API_URL}/history/${encodeURIComponent(id)}/file/download`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: { message: 'Unable to download history file.' } },
      { status: upstream.status || 500 },
    );
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment',
      'Content-Length': upstream.headers.get('content-length') ?? String(bytes.byteLength),
      'Cache-Control': 'private, max-age=60',
    },
  });
}
