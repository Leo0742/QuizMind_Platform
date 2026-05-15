import { Body, Controller, Delete, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionScenarioPresetsService } from './extension-scenario-presets.service';

@Controller('extension/scenario-presets')
export class ExtensionScenarioPresetsController {
  constructor(private readonly auth: AuthService, private readonly svc: ExtensionScenarioPresetsService) {}
  @Post('from-scenario/:scenarioId') async fromScenario(@Headers('authorization') a:string|undefined,@Param('scenarioId') scenarioId:string,@Body() body:any){ return this.svc.createFromScenario(await this.requireSession(a), scenarioId, body); }
  @Get('mine') async mine(@Headers('authorization') a:string|undefined){ return this.svc.mine(await this.requireSession(a)); }
  @Get(':slug') async preview(@Param('slug') slug:string,@Headers('authorization') a?:string){ const s = await this.trySession(a); return this.svc.preview(slug,s); }
  @Post(':slug/install') async install(@Param('slug') slug:string,@Headers('authorization') a:string|undefined){ return this.svc.install(await this.requireSession(a), slug); }
  @Delete(':slug') async del(@Param('slug') slug:string,@Headers('authorization') a:string|undefined){ return this.svc.disable(await this.requireSession(a), slug); }
  private async requireSession(a?:string){ const t=parseBearerToken(a); if(!t) throw new UnauthorizedException('Missing Authorization bearer token.'); return this.auth.getCurrentSession(t); }
  private async trySession(a?:string){ const t=parseBearerToken(a); if(!t) return null; try { return await this.auth.getCurrentSession(t); } catch { return null; } }
}
