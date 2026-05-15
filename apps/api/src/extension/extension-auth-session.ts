import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { type ExtensionControlService } from './extension-control.service';

export type InstallationSessionSnapshot = Awaited<
  ReturnType<ExtensionControlService['resolveInstallationSession']>
>;

export function buildInstallationRuntimeSession(
  installationSession: InstallationSessionSnapshot,
): CurrentSessionSnapshot {
  return {
    personaKey: 'extension-installation',
    personaLabel: 'Extension Installation',
    notes: ['installation-session'],
    user: {
      id: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
    },
    principal: {
      userId: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
      systemRoles: [],
      entitlements: [],
      featureFlags: [],
    },
    permissions: [],
  };
}
