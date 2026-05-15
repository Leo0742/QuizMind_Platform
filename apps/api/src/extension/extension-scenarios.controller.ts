import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionScenariosService } from './extension-scenarios.service';

@Controller('extension/scenarios')
export class ExtensionScenariosController {
  constructor(private readonly authService: AuthService, private readonly service: ExtensionScenariosService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) { return this.service.list(await this.requireSession(authorization)); }

  @Get('sync')
  async sync(@Headers('authorization') authorization?: string) { return this.service.sync(await this.requireSession(authorization)); }

  @Post()
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: { scenario?: unknown }) {
    return this.service.create(await this.requireSession(authorization), body?.scenario);
  }

  @Put(':scenarioId')
  async put(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { scenario?: unknown }) {
    return this.service.put(await this.requireSession(authorization), scenarioId, body?.scenario);
  }

  @Patch(':scenarioId')
  async patch(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { patch?: unknown }) {
    return this.service.patch(await this.requireSession(authorization), scenarioId, body?.patch);
  }

  @Delete(':scenarioId')
  async remove(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string) {
    return this.service.remove(await this.requireSession(authorization), scenarioId);
  }

  @Post('bulk')
  async bulk(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.service.bulk(await this.requireSession(authorization), body);
  }

  private async requireSession(authorization?: string) {
    const token = parseBearerToken(authorization);
    if (!token) throw new UnauthorizedException('Missing Authorization bearer token.');
    return this.authService.getCurrentSession(token);
  }
}
