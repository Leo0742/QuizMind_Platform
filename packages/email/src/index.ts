export const emailTemplateKeys = ['auth.verify-email', 'auth.password-reset', 'workspace.invitation'] as const;
export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export interface EmailTemplateDefinition {
  key: EmailTemplateKey;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplate<TVariables extends object = Record<string, unknown>> {
  key: EmailTemplateKey;
  render(vars: TVariables): EmailTemplateDefinition;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmailDeliveryReceipt {
  provider: string;
  messageId: string;
  acceptedAt: string;
}

export interface EmailAdapter {
  send(template: EmailTemplateDefinition, to: string, vars?: Record<string, unknown>): Promise<EmailDeliveryReceipt>;
}

export interface ResendEmailAdapterOptions {
  apiKey: string;
  from: string;
  apiUrl?: string;
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}

function interpolateText(template: string, vars: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = vars[key];
    return typeof value === 'undefined' ? '' : String(value);
  });
}

function interpolateHtml(template: string, vars: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = vars[key];
    return typeof value === 'undefined' ? '' : escapeHtml(value);
  });
}

interface EmailLayoutOptions {
  preheader: string;
  title: string;
  lead: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerHtml?: string;
}

function buildEmailLayout(options: EmailLayoutOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${options.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">
      ${options.preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;margin:0;padding:32px 16px;width:100%;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
            <tr>
              <td style="padding:0;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 52%,#06b6d4 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:30px 32px 42px 32px;">
                      <div style="display:inline-block;padding:8px 13px;border-radius:999px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                        QuizMind
                      </div>
                      <h1 style="margin:22px 0 0 0;color:#ffffff;font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;">
                        ${options.title}
                      </h1>
                      <p style="margin:14px 0 0 0;color:rgba(255,255,255,0.88);font-size:17px;line-height:1.6;">
                        ${options.lead}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 12px 32px;">
                <div style="font-size:16px;line-height:1.7;color:#374151;">
                  ${options.bodyHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 32px 28px 32px;">
                <a href="${options.ctaUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;line-height:1;border-radius:14px;padding:17px 26px;box-shadow:0 12px 24px rgba(79,70,229,0.28);">
                  ${options.ctaLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 34px 32px;">
                <div style="border-top:1px solid #eef2f7;padding-top:22px;font-size:13px;line-height:1.6;color:#6b7280;">
                  ${options.footerHtml ?? 'This message was sent by QuizMind. If you were not expecting it, you can safely ignore it.'}
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
            © QuizMind · AI quiz assistant platform
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function defineTemplate<TVariables extends object>(
  key: EmailTemplateKey,
  content: {
    subject: string;
    html: string;
    text: string;
  },
): EmailTemplate<TVariables> {
  return {
    key,
    render(vars) {
      return {
        key,
        subject: interpolateText(content.subject, vars as Record<string, unknown>),
        html: interpolateHtml(content.html, vars as Record<string, unknown>),
        text: interpolateText(content.text, vars as Record<string, unknown>),
      };
    },
  };
}

export interface VerifyEmailVars {
  productName: string;
  displayName?: string;
  verifyUrl: string;
  supportEmail: string;
}

export interface PasswordResetVars {
  productName: string;
  displayName?: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface WorkspaceInvitationVars {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
}

const mutedLinkStyle = 'color:#4f46e5;text-decoration:none;word-break:break-all;font-weight:600;';

export const verifyEmailTemplate = defineTemplate<VerifyEmailVars>('auth.verify-email', {
  subject: 'Verify your {{productName}} email',
  html: buildEmailLayout({
    preheader: 'Confirm your email address to activate your QuizMind account.',
    title: 'Verify your email',
    lead: 'You are one step away from using QuizMind securely.',
    bodyHtml:
      `<p style="margin:0 0 16px 0;">Hello,</p>` +
      `<p style="margin:0 0 16px 0;">Confirm the email address for your <strong>{{productName}}</strong> account by pressing the button below.</p>` +
      `<p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">If the button does not work, copy this secure link into your browser:</p>` +
      `<p style="margin:0;"><a href="{{verifyUrl}}" style="${mutedLinkStyle}">{{verifyUrl}}</a></p>`,
    ctaLabel: 'Verify email',
    ctaUrl: '{{verifyUrl}}',
    footerHtml:
      `If you did not request this email, contact <a href="mailto:{{supportEmail}}" style="${mutedLinkStyle}">{{supportEmail}}</a> or ignore this message.`,
  }),
  text:
    'Hello,\n\nVerify your email for {{productName}}:\n{{verifyUrl}}\n\nIf you did not request this, contact {{supportEmail}}.',
});

export const passwordResetTemplate = defineTemplate<PasswordResetVars>('auth.password-reset', {
  subject: 'Reset your {{productName}} password',
  html: buildEmailLayout({
    preheader: 'Use this secure link to reset your QuizMind password.',
    title: 'Reset your password',
    lead: 'A password reset was requested for your QuizMind account.',
    bodyHtml:
      `<p style="margin:0 0 16px 0;">Hello,</p>` +
      `<p style="margin:0 0 16px 0;">Use the button below to choose a new password for <strong>{{productName}}</strong>.</p>` +
      `<div style="margin:18px 0;padding:14px 16px;border-radius:16px;background:#f8fafc;border:1px solid #e5e7eb;color:#475569;font-size:14px;">This link expires in <strong>{{expiresInMinutes}} minutes</strong>. For security, do not share it with anyone.</div>` +
      `<p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">If the button does not work, copy this secure link into your browser:</p>` +
      `<p style="margin:0;"><a href="{{resetUrl}}" style="${mutedLinkStyle}">{{resetUrl}}</a></p>`,
    ctaLabel: 'Reset password',
    ctaUrl: '{{resetUrl}}',
    footerHtml: 'If you did not request a password reset, you can safely ignore this email. Your password will not change.',
  }),
  text:
    'Hello,\n\nReset your {{productName}} password:\n{{resetUrl}}\n\nThis link expires in {{expiresInMinutes}} minutes. If you did not request this, ignore this email.',
});

export const workspaceInvitationTemplate = defineTemplate<WorkspaceInvitationVars>('workspace.invitation', {
  subject: 'You were invited to {{workspaceName}}',
  html: buildEmailLayout({
    preheader: '{{inviterName}} invited you to collaborate in {{workspaceName}} on QuizMind.',
    title: 'You have a workspace invite',
    lead: 'Join your team and start working with shared QuizMind tools.',
    bodyHtml:
      `<p style="margin:0 0 16px 0;"><strong>{{inviterName}}</strong> invited you to join <strong>{{workspaceName}}</strong>.</p>` +
      `<p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">Accept the invitation with the button below, or copy this link into your browser:</p>` +
      `<p style="margin:0;"><a href="{{acceptUrl}}" style="${mutedLinkStyle}">{{acceptUrl}}</a></p>`,
    ctaLabel: 'Accept invitation',
    ctaUrl: '{{acceptUrl}}',
    footerHtml: 'This invitation was sent through QuizMind. If you were not expecting it, you can safely ignore it.',
  }),
  text: '{{inviterName}} invited you to join {{workspaceName}}.\n\nAccept the invitation: {{acceptUrl}}',
});

export const builtInEmailTemplates = {
  verifyEmail: verifyEmailTemplate,
  passwordReset: passwordResetTemplate,
  workspaceInvitation: workspaceInvitationTemplate,
} as const;

export function createNoopEmailAdapter(provider = 'noop'): EmailAdapter {
  return {
    async send(template, to) {
      return {
        provider,
        messageId: `${provider}:${template.key}:${to}`,
        acceptedAt: new Date().toISOString(),
      };
    },
  };
}

export function createResendEmailAdapter(options: ResendEmailAdapterOptions): EmailAdapter {
  return {
    async send(template, to) {
      const response = await fetch(options.apiUrl ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from,
          to: [to],
          subject: template.subject,
          html: template.html,
          text: template.text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Resend email send failed with ${response.status}: ${errorBody}`);
      }

      const payload = (await response.json()) as {
        id?: string;
      };

      if (!payload.id) {
        throw new Error('Resend email send failed: missing message id.');
      }

      return {
        provider: 'resend',
        messageId: payload.id,
        acceptedAt: new Date().toISOString(),
      };
    },
  };
}

export async function sendTemplatedEmail<TVariables extends object>(
  adapter: EmailAdapter,
  template: EmailTemplate<TVariables>,
  to: string,
  vars: TVariables,
): Promise<EmailDeliveryReceipt> {
  return adapter.send(template.render(vars), to, vars as Record<string, unknown>);
}
