import Link from 'next/link';
import { SiteShell } from '../../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';
import { getSession, getUserProfile, resolvePersona } from '../../../../lib/api';
import { isAdminSession } from '../../../../lib/admin-guard';
import { ExtensionScenariosClient } from './scenarios-client';

export default async function ExtensionScenariosPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = await searchParams;
  const persona = resolvePersona(resolved);
  const accessToken = await getAccessTokenFromCookies();
  const [session, profile] = await Promise.all([getSession(persona, accessToken), getUserProfile(accessToken)]);
  const sessionLabel = session?.user.displayName || session?.user.email;

  return (
    <SiteShell apiState={session ? `Connected — ${sessionLabel}` : 'Not signed in'} currentPersona={persona} description="" eyebrow="Расширение" isAdmin={session ? isAdminSession(session) : false} isSignedIn={Boolean(session)} pathname="/app/extension/scenarios" showPersonaSwitcher={false} title="Мои сценарии расширения" userDisplayName={session?.user.displayName ?? undefined} userAvatarUrl={profile?.avatarUrl ?? undefined}>
      {session ? <ExtensionScenariosClient /> : <section className="empty-state"><h2>Войдите в аккаунт</h2><p>Сценарии доступны только авторизованным пользователям.</p><Link className="btn-primary" href="/auth/login?next=/app/extension/scenarios">Войти</Link></section>}
    </SiteShell>
  );
}
