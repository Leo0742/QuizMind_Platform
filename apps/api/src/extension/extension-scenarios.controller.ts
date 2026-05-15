import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionScenariosService } from './extension-scenarios.service';

@Controller('api')
export class ExtensionScenariosController {
  constructor(private readonly authService: AuthService, private readonly service: ExtensionScenariosService) {}

  @Get('extension/scenarios')
  async list(@Headers('authorization') authorization?: string) { return this.service.list(await this.requireSession(authorization)); }

  @Get('extension/scenarios/sync')
  async sync(@Headers('authorization') authorization?: string) { return this.service.sync(await this.requireSession(authorization)); }

  @Post('extension/scenarios')
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: { scenario?: unknown }) {
    return this.service.create(await this.requireSession(authorization), body?.scenario);
  }

  @Put('extension/scenarios/:scenarioId')
  async put(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { scenario?: unknown }) {
    return this.service.put(await this.requireSession(authorization), scenarioId, body?.scenario);
  }

  @Patch('extension/scenarios/:scenarioId')
  async patch(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { patch?: unknown }) {
    return this.service.patch(await this.requireSession(authorization), scenarioId, body?.patch);
  }

  @Delete('extension/scenarios/:scenarioId')
  async remove(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string) {
    return this.service.remove(await this.requireSession(authorization), scenarioId);
  }

  @Post('extension/scenarios/bulk')
  async bulk(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.service.bulk(await this.requireSession(authorization), body);
  }

  private async requireSession(authorization?: string) {
    const token = parseBearerToken(authorization);
    if (!token) throw new UnauthorizedException('Missing Authorization bearer token.');
    return this.authService.getCurrentSession(token);
  }
}
