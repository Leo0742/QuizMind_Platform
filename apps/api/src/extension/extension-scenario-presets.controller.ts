import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionControlService } from './extension-control.service';
import { ExtensionScenarioPresetsService } from './extension-scenario-presets.service';
import { buildInstallationRuntimeSession } from './extension-auth-session';

@Controller('extension/scenario-presets')
export class ExtensionScenarioPresetsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExtensionControlService) private readonly extensionControl: ExtensionControlService,
    @Inject(ExtensionScenarioPresetsService) private readonly svc: ExtensionScenarioPresetsService,
  ) {}
  @Post('from-scenario/:scenarioId') async fromScenario(@Headers('authorization') a:string|undefined,@Param('scenarioId') scenarioId:string,@Body() body:any){ return this.svc.createFromScenario(await this.requireSession(a, '/extension/scenario-presets/from-scenario/:scenarioId'), scenarioId, body); }
  @Get('mine') async mine(@Headers('authorization') a:string|undefined){ return this.svc.mine(await this.requireSession(a, '/extension/scenario-presets/mine')); }
  @Get(':slug') async preview(@Param('slug') slug:string,@Headers('authorization') a?:string){ const s = await this.trySession(a, '/extension/scenario-presets/:slug'); return this.svc.preview(slug,s); }
  @Post(':slug/install') async install(@Param('slug') slug:string,@Headers('authorization') a:string|undefined){ return this.svc.install(await this.requireSession(a, '/extension/scenario-presets/:slug/install'), slug); }
  @Delete(':slug') async del(@Param('slug') slug:string,@Headers('authorization') a:string|undefined){ return this.svc.disable(await this.requireSession(a, '/extension/scenario-presets/:slug'), slug); }

  private async requireSession(a:string|undefined, endpoint: string){
    const t=parseBearerToken(a);
    if(!t) throw new UnauthorizedException('Missing Authorization bearer token.');
    try {
      return await this.auth.getCurrentSession(t);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }
    try {
      const installationSession = await this.extensionControl.resolveInstallationSession(t, { endpoint });
      return buildInstallationRuntimeSession(installationSession);
    } catch {
      throw new UnauthorizedException('Session expired. Reconnect your account.');
    }
  }

  private async trySession(a:string|undefined, endpoint: string){
    const t=parseBearerToken(a);
    if(!t) return null;
    try {
      return await this.auth.getCurrentSession(t);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        return null;
      }
    }
    try {
      const installationSession = await this.extensionControl.resolveInstallationSession(t, { endpoint });
      return buildInstallationRuntimeSession(installationSession);
    } catch {
      return null;
    }
  }
}
