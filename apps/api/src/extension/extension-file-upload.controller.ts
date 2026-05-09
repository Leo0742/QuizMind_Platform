import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  Inject,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseBearerToken } from '@quizmind/auth';
import { type AiProvider, type AiProxyContentBlock, type AiProxyResult, type ApiSuccess } from '@quizmind/contracts';

import { AiProxyService } from '../ai/ai-proxy.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiHistoryService } from '../history/ai-history.service';
import { ExtensionControlService } from './extension-control.service';

/** Minimal multer file type (avoids @types/multer dependency). */
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface AiProxyFileContentBlock {
  type: 'file';
  file: {
    filename: string;
    file_data: string;
  };
}

type UploadContentBlock = AiProxyContentBlock | AiProxyFileContentBlock;
type UploadMessageContent = string | UploadContentBlock[];

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TEXT_LIKE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_FILE_SIZE_LABEL = '50 MB';

const EXTENSION_MIME_MAP: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  jsonl: 'application/json',
  csv: 'text/csv',
  xml: 'application/xml',
  yml: 'text/plain',
  yaml: 'text/plain',
  log: 'text/plain',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const KNOWN_AI_PROVIDERS = new Set<AiProvider>([
  'openai',
  'anthropic',
  'openrouter',
  'routerai',
  'polza',
  'internal',
]);
const ROUTERAI_DEFAULT_UPLOAD_MODEL = 'openai/gpt-5.3-chat';
const ROUTERAI_IMAGE_UPLOAD_FALLBACK_MODELS = [
  ROUTERAI_DEFAULT_UPLOAD_MODEL,
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
];

function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

function resolveMimeFromFilename(filename: string, declaredMime: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const declared = declaredMime.trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  return EXTENSION_MIME_MAP[ext] ?? declared ?? 'application/octet-stream';
}

function isTextLikeMime(mime: string): boolean {
  return TEXT_LIKE_MIME_TYPES.has(mime) || mime.startsWith('text/');
}

function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has(mime);
}

function shouldUseRouterAiFileBlock(input: { provider: AiProvider | undefined; model: string | undefined; mime: string }): boolean {
  if (isImageMime(input.mime)) return false;
  return (input.provider ?? 'routerai') === 'routerai' || Boolean(input.model?.includes('/'));
}

function normalizeRouterAiModelId(model: string | undefined): string | undefined {
  const value = model?.trim();
  if (!value) return undefined;

  const aliases: Record<string, string> = {
    'gpt-5.3-chat': 'openai/gpt-5.3-chat',
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  };

  return aliases[value.toLowerCase()] ?? value;
}

function getHttpStatus(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

function isRetryableRouterAiUploadError(error: unknown): boolean {
  const status = getHttpStatus(error);
  const message = getErrorMessage(error);
  return (
    message.toLowerCase().includes('routerai') &&
    (status === 429 || status === 500 || status === 502 || status === 503 || status === 504)
  );
}

function uniqueModels(models: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    const normalized = normalizeRouterAiModelId(model);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

function buildFileContentBlocks(input: { promptText: string; file: MulterFile; mime: string }): UploadContentBlock[] {
  return [
    { type: 'text' as const, text: `${input.promptText}\n\nAttached file: ${input.file.originalname}` },
    {
      type: 'file',
      file: {
        filename: input.file.originalname,
        file_data: toDataUrl(input.mime, input.file.buffer),
      },
    },
  ];
}

type InstallationSessionSnapshot = Awaited<ReturnType<ExtensionControlService['resolveInstallationSession']>>;

function buildInstallationRuntimeSession(
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

@Controller()
export class ExtensionFileUploadController {
  constructor(
    @Inject(ExtensionControlService)
    private readonly extensionControlService: ExtensionControlService,
    @Inject(AiProxyService)
    private readonly aiProxyService: AiProxyService,
    @Inject(AiHistoryService)
    private readonly aiHistoryService: AiHistoryService,
  ) {}

  /**
   * POST /extension/ai/upload
   *
   * Accepts a multipart/form-data upload with:
   * - file       (required) — the file to analyze
   * - prompt     (optional) — instruction text; defaults to a generic analyze prompt
   * - model      (optional) — override model; defaults to workspace policy default
   * - provider   (optional) — override provider; defaults to workspace policy default
   *
   * Returns the same normalized response shape as /extension/ai/answer plus fileInfo.
   */
  @Post('extension/ai/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadAndAnswer(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: Record<string, string>,
    @Headers('authorization') authorization?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file must be attached as multipart field "file".');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File is too large. Maximum allowed size is ${MAX_FILE_SIZE_LABEL}.`);
    }

    const accessToken = parseBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    const installationSession = await this.extensionControlService.resolveInstallationSession(accessToken, {
      endpoint: '/extension/ai/upload',
    });
    const mime = resolveMimeFromFilename(file.originalname, file.mimetype);

    const session = buildInstallationRuntimeSession(installationSession);
    const promptText =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt.trim()
        : 'Analyze the following content and provide a helpful response.';
    const providerRaw =
      typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : undefined;
    const provider: AiProvider | undefined =
      providerRaw && KNOWN_AI_PROVIDERS.has(providerRaw as AiProvider)
        ? (providerRaw as AiProvider)
        : undefined;
    const bodyModel =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
    const model = provider === 'routerai'
      ? normalizeRouterAiModelId(bodyModel) ?? ROUTERAI_DEFAULT_UPLOAD_MODEL
      : bodyModel;

    let contentType: 'text' | 'image';
    let messageContent: UploadMessageContent;

    try {
      if (isImageMime(mime)) {
        contentType = 'image';
        messageContent = [
          { type: 'text' as const, text: promptText },
          {
            type: 'image_url' as const,
            image_url: { url: toDataUrl(mime, file.buffer), detail: 'auto' as const },
          },
        ];
      } else if (shouldUseRouterAiFileBlock({ provider, model, mime })) {
        contentType = 'text';
        messageContent = buildFileContentBlocks({ promptText, file, mime });
      } else if (isTextLikeMime(mime)) {
        contentType = 'text';
        const textContent = file.buffer.toString('utf8');
        messageContent = `${promptText}\n\n---\n\n${textContent}`;
      } else {
        throw new BadRequestException(
          `File type "${mime}" is not supported by the selected provider. Use RouterAI for arbitrary file uploads.`,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to process file "${file.originalname}". Ensure the file is valid and under ${MAX_FILE_SIZE_LABEL}.`,
      );
    }

    const proxyResult = await this.proxyUploadWithRouterAiFallback({
      session,
      provider,
      model,
      contentType,
      messageContent,
    });

    const upstreamResponse =
      proxyResult.response && typeof proxyResult.response === 'object'
        ? (proxyResult.response as Record<string, unknown>)
        : {};
    const fallbackContent =
      typeof upstreamResponse.answer === 'string'
        ? upstreamResponse.answer
        : typeof upstreamResponse.output_text === 'string'
          ? upstreamResponse.output_text
          : typeof upstreamResponse.text === 'string'
            ? upstreamResponse.text
            : null;
    const choices = Array.isArray(upstreamResponse.choices)
      ? upstreamResponse.choices
      : fallbackContent
        ? [{ index: 0, message: { role: 'assistant', content: fallbackContent }, finish_reason: 'stop' }]
        : [];
    const usage =
      upstreamResponse.usage && typeof upstreamResponse.usage === 'object'
        ? upstreamResponse.usage
        : proxyResult.usage;

    this.logUploadRequest({
      installationId: installationSession.installation.installationId,
      originalName: file.originalname,
      mimeType: mime,
      sizeBytes: file.size,
      contentType,
      model: proxyResult.model,
    });

    // Persist history content including original file bytes (fire-and-forget).
    const proxyUsage = proxyResult.usage;
    this.aiHistoryService
      .persistContent({
        requestId: proxyResult.requestId,
        userId: installationSession.installation.userId,
        provider: proxyResult.provider,
        model: proxyResult.model,
        requestType: 'file',
        promptContent: messageContent,
        responseContent: upstreamResponse,
        fileBuffer: file.buffer,
        fileMetadata: {
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          contentType,
        },
        promptTokens: proxyUsage?.promptTokens,
        completionTokens: proxyUsage?.completionTokens,
      })
      .catch((err) => {
        console.error('[file-upload] Failed to persist history content.', err);
      });

    return ok({
      id:
        typeof upstreamResponse.id === 'string' && upstreamResponse.id.trim()
          ? upstreamResponse.id
          : proxyResult.requestId,
      model: proxyResult.model,
      provider: proxyResult.provider,
      keySource: proxyResult.keySource,
      choices,
      ...(usage ? { usage } : {}),
      quota: proxyResult.quota,
      fileInfo: {
        originalName: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        contentType,
      },
    });
  }

  private async proxyUploadWithRouterAiFallback(input: {
    session: CurrentSessionSnapshot;
    provider: AiProvider | undefined;
    model: string | undefined;
    contentType: 'text' | 'image';
    messageContent: UploadMessageContent;
  }): Promise<AiProxyResult> {
    const baseRequest = {
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      messages: [{ role: 'user' as const, content: input.messageContent as string | AiProxyContentBlock[] }],
      stream: false,
    };

    try {
      return await this.aiProxyService.proxyForCurrentSession(input.session, baseRequest);
    } catch (error) {
      if (input.contentType !== 'image' || !isRetryableRouterAiUploadError(error)) {
        throw error;
      }

      const candidates = uniqueModels([
        input.model,
        ...ROUTERAI_IMAGE_UPLOAD_FALLBACK_MODELS,
      ]);
      let lastError = error;

      for (const candidate of candidates) {
        try {
          console.warn(
            JSON.stringify({
              eventType: 'extension.file_upload_routerai_retry',
              model: candidate,
              previousError: getErrorMessage(lastError),
              occurredAt: new Date().toISOString(),
            }),
          );
          return await this.aiProxyService.proxyForCurrentSession(input.session, {
            provider: 'routerai',
            model: candidate,
            messages: [{ role: 'user', content: input.messageContent as string | AiProxyContentBlock[] }],
            stream: false,
          });
        } catch (retryError) {
          lastError = retryError;
          if (!isRetryableRouterAiUploadError(retryError)) {
            throw retryError;
          }
        }
      }

      throw lastError;
    }
  }

  private logUploadRequest(input: {
    installationId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    contentType: 'text' | 'image';
    model: string;
  }): void {
    console.info(
      JSON.stringify({
        eventType: 'extension.file_upload_answered',
        installationId: input.installationId,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
        model: input.model,
        occurredAt: new Date().toISOString(),
      }),
    );
  }
}
