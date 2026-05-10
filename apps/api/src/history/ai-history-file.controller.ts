import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { parseBearerToken } from '@quizmind/auth';
import { type Prisma } from '@quizmind/database';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { HistoryBlobService } from './history-blob.service';
import { sanitizeAttachmentFilename } from './ai-history.controller';

function parseFileMetadata(value: Prisma.JsonValue | null): { originalName: string; mimeType: string; sizeBytes: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const originalName = typeof obj.originalName === 'string' && obj.originalName.trim()
    ? obj.originalName.trim()
    : 'attachment.bin';
  const mimeType = typeof obj.mimeType === 'string' && obj.mimeType.trim()
    ? obj.mimeType.trim()
    : 'application/octet-stream';
  const sizeBytes = typeof obj.sizeBytes === 'number' && Number.isFinite(obj.sizeBytes)
    ? obj.sizeBytes
    : 0;
  return { originalName, mimeType, sizeBytes };
}

@Controller()
export class AiHistoryFileController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HistoryBlobService) private readonly blobs: HistoryBlobService,
  ) {}

  @Get('history/:id/file/view')
  async viewStoredFile(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    const session = await this.requireSession(authorization);
    const content = await this.prisma.aiRequestContent.findFirst({
      where: {
        aiRequestEventId: id,
        event: { userId: session.user.id },
      },
      select: {
        fileBlobKey: true,
        fileMetadataJson: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (!content?.fileBlobKey || content.deletedAt || content.expiresAt < new Date()) {
      throw new NotFoundException('History file not found.');
    }

    const metadata = parseFileMetadata(content.fileMetadataJson);
    if (!metadata) {
      throw new NotFoundException('History file metadata not found.');
    }

    const bytes = await this.blobs.readBinary(content.fileBlobKey);
    if (!bytes) {
      throw new NotFoundException('History file bytes not found.');
    }

    const safeFilename = sanitizeAttachmentFilename(metadata.originalName, metadata.mimeType);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    response.setHeader('Content-Type', metadata.mimeType);
    response.setHeader('Content-Length', String(bytes.byteLength));
    response.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(bytes);
  }

  @Get('history/:id/file/download')
  async downloadStoredFile(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    return this.viewStoredFile(id, '1', authorization, response);
  }

  private async requireSession(authorization?: string) {
    const accessToken = parseBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing bearer token.');
    return this.authService.getCurrentSession(accessToken);
  }
}
