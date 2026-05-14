import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionScenariosService } from './extension-scenarios.service';

@Controller('api')
export class ExtensionScenariosController {
  constructor(private readonly authService: AuthService, private readonly service: ExtensionScenariosService) {}

  @Get('extension/scenarios') async list(@Headers('authorization') authorization?: string) { return this.service.list(await this.requireSession(authorization)); }
  @Get('extension/scenarios/sync') async sync(@Headers('authorization') authorization?: string) { return this.service.sync(await this.requireSession(authorization)); }
  @Post('extension/scenarios') async create(@Headers('authorization') authorization: string|undefined, @Body() body: { scenario?: unknown }) { return this.service.create(await this.requireSession(authorization), body?.scenario); }
  @Put('extension/scenarios/:scenarioId') async put(@Headers('authorization') authorization: string|undefined, @Param('scenarioId') scenarioId: string, @Body() body:{scenario?:unknown}) { return this.service.create(await this.requireSession(authorization), { ...(body?.scenario as object ?? {}), id: scenarioId }); }
  @Patch('extension/scenarios/:scenarioId') async patch(@Headers('authorization') authorization: string|undefined, @Param('scenarioId') scenarioId: string, @Body() body:{patch?:unknown}) { return this.put(authorization, scenarioId, { scenario: { ...(body?.patch as object ?? {}), id: scenarioId } }); }
  @Delete('extension/scenarios/:scenarioId') async del(@Headers('authorization') authorization: string|undefined, @Param('scenarioId') scenarioId: string) { return this.service.remove(await this.requireSession(authorization), scenarioId); }
  @Post('extension/scenarios/bulk') async bulk(@Headers('authorization') authorization: string|undefined, @Body() body:{mode?:string; items?:unknown[]}) { const session=await this.requireSession(authorization); if (!Array.isArray(body?.items)) return this.service.list(session); for (const item of body.items) await this.service.create(session, item); return this.service.list(session); }

  private async requireSession(authorization?: string) { const token = parseBearerToken(authorization); if (!token) throw new UnauthorizedException('Missing Authorization bearer token.'); return this.authService.getCurrentSession(token); }
}
