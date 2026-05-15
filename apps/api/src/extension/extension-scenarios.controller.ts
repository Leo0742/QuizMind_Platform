import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { AuthService } from '../auth/auth.service';
import { ExtensionControlService } from './extension-control.service';
import { ExtensionScenariosService } from './extension-scenarios.service';
import { buildInstallationRuntimeSession } from './extension-auth-session';

@Controller('extension/scenarios')
export class ExtensionScenariosController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ExtensionControlService) private readonly extensionControlService: ExtensionControlService,
    @Inject(ExtensionScenariosService) private readonly service: ExtensionScenariosService,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) { return this.service.list(await this.requireSession(authorization, '/extension/scenarios')); }

  @Get('sync')
  async sync(@Headers('authorization') authorization?: string) { return this.service.sync(await this.requireSession(authorization, '/extension/scenarios/sync')); }

  @Post()
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: { scenario?: unknown }) {
    return this.service.create(await this.requireSession(authorization, '/extension/scenarios'), body?.scenario);
  }

  @Put(':scenarioId')
  async put(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { scenario?: unknown }) {
    return this.service.put(await this.requireSession(authorization, '/extension/scenarios/:scenarioId'), scenarioId, body?.scenario);
  }

  @Patch(':scenarioId')
  async patch(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string, @Body() body: { patch?: unknown }) {
    return this.service.patch(await this.requireSession(authorization, '/extension/scenarios/:scenarioId'), scenarioId, body?.patch);
  }

  @Delete(':scenarioId')
  async remove(@Headers('authorization') authorization: string | undefined, @Param('scenarioId') scenarioId: string) {
    return this.service.remove(await this.requireSession(authorization, '/extension/scenarios/:scenarioId'), scenarioId);
  }

  @Post('bulk')
  async bulk(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.service.bulk(await this.requireSession(authorization, '/extension/scenarios/bulk'), body);
  }

  private async requireSession(authorization: string | undefined, endpoint: string) {
    const token = parseBearerToken(authorization);
    if (!token) throw new UnauthorizedException('Missing Authorization bearer token.');

    try {
      return await this.authService.getCurrentSession(token);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }

    try {
      const installationSession = await this.extensionControlService.resolveInstallationSession(token, { endpoint });
      return buildInstallationRuntimeSession(installationSession);
    } catch {
      throw new UnauthorizedException('Session expired. Reconnect your account.');
    }
  }
}
