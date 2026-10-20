import nodemailer, { type Transporter } from 'nodemailer';
import appOrigin from '../utils/app_origin';

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const defaultFrom = process.env.SMTP_FROM || `"Restora" <${user || 'no-reply@restora.app'}>`;

let transporterInstance: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(host && user && pass);
}

export function getTransporter(): Transporter | null {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_ENABLE_SMTP) {
    return null;
  }
  if (!isSmtpConfigured()) {
    return null;
  }
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: user!,
        pass: pass!,
      },
    });
  }
  return transporterInstance;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/**
 * Sends an email via Brevo/SMTP, or prints to console if SMTP_HOST is empty (in dev/test).
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const from = options.from || defaultFrom;
  const transporter = getTransporter();

  if (!transporter) {
    console.log('\n[Email Service (Dev Console)] =============================');
    console.log(`From:    ${from}`);
    console.log(`To:      ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Content:\n${options.text || options.html}`);
    console.log('===========================================================\n');
    return { success: true, messageId: `dev-console-${Date.now()}` };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]+>/g, ''),
    });

    console.log(`[Email Service] Sent email to ${options.to} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email Service] Failed to send email to ${options.to}:`, error);
    return { success: false };
  }
}

/** Text that came from people (restaurant and staff names) must not be able to add markup to an email. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = '#111827';
const MUTED = '#6B7280';
const PRIMARY = '#4F46E5';

interface EmailLayout {
  /** The line inbox apps show after the subject. */
  preheader: string;
  /** A drawing from the web app's public/email folder. */
  art: 'verify' | 'reset' | 'invite';
  heading: string;
  /** Already-escaped HTML: one or more short paragraphs. */
  body: string;
  /** Already-escaped HTML for an optional panel of facts under the text (e.g. the restaurant and role). */
  details?: string;
  buttonLabel: string;
  url: string;
  /** Small print under the button: how long the link works, and what to do if it was not you. */
  note: string;
}

/**
 * Every Restora email: the logo, a drawing, a heading, a few lines, one big button, the link written out, small print.
 * Built from tables with inline styles, the only layout every inbox (Gmail, Outlook, phones) shows the same way.
 * The pictures are PNGs from the web app (SVG does not show in Gmail); each has alt text for inboxes that block images.
 */
function emailLayout({ preheader, art, heading, body, details, buttonLabel, url, note }: EmailLayout): string {
  const origin = escapeHtml(appOrigin());
  const link = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#F6F7F9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td align="center" style="padding-bottom:20px;">
        <a href="${origin}" style="text-decoration:none;font-family:${FONT};font-size:18px;font-weight:700;color:${INK};">
          <img src="${origin}/pwa-64.png" width="28" height="28" alt="" style="vertical-align:middle;border-radius:8px;border:0;" />
          <span style="vertical-align:middle;padding-left:8px;">Restora</span>
        </a>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;padding:32px 32px 28px;font-family:${FONT};" align="center">
        <img src="${origin}/email/${art}.png" width="200" height="150" alt="" style="display:block;border:0;margin:0 auto 8px;" />
        <h1 style="margin:0 0 12px;font-size:22px;line-height:30px;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
        <div style="font-size:16px;line-height:24px;color:#374151;">${body}</div>
        ${details ? `<div style="margin-top:20px;padding:14px 16px;border-radius:12px;background:#EEF2FF;text-align:left;font-size:14px;line-height:22px;color:#374151;">${details}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
          <tr><td style="border-radius:12px;background:${PRIMARY};">
            <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(buttonLabel)}</a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(note)}</p>
        <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #F1F3F6;font-size:12px;line-height:18px;color:${MUTED};">Button not working? Open this link:<br /><a href="${link}" style="color:${PRIMARY};word-break:break-all;">${link}</a></p>
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#9CA3AF;">
        Restora · Orders, customers, khata and WhatsApp for your restaurant
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A short account email (verify email, reset password) with one button. */
export async function sendAccountEmail(params: {
  to: string;
  subject: string;
  art: 'verify' | 'reset';
  heading: string;
  body: string;
  buttonLabel: string;
  url: string;
  note: string;
}): Promise<boolean> {
  const html = emailLayout({
    preheader: params.body,
    art: params.art,
    heading: params.heading,
    body: `<p style="margin:0;">${escapeHtml(params.body)}</p>`,
    buttonLabel: params.buttonLabel,
    url: params.url,
    note: params.note,
  });
  const text = `${params.heading}\n\n${params.body}\n\n${params.buttonLabel}: ${params.url}\n\n${params.note}`;
  const result = await sendEmail({ to: params.to, subject: params.subject, html, text });
  return result.success;
}

/**
 * Sends an invitation email to a new team member.
 */
export async function sendStaffInvitationEmail(params: {
  to: string;
  recipientName?: string;
  restaurantName: string;
  invitedByName?: string;
  roleNames: string[];
  inviteUrl: string;
}): Promise<boolean> {
  const inviter = params.invitedByName || 'The team';
  const roles = params.roleNames.length > 0 ? params.roleNames.join(', ') : 'Staff';
  const row = (label: string, value: string) =>
    `<div><span style="color:${MUTED};">${label}</span>&nbsp; <strong style="color:${INK};">${escapeHtml(value)}</strong></div>`;

  const html = emailLayout({
    preheader: `${inviter} invited you to work at ${params.restaurantName}.`,
    art: 'invite',
    heading: `Join ${params.restaurantName} on Restora`,
    body: `<p style="margin:0;">Hi ${escapeHtml(params.recipientName || 'there')}, <strong>${escapeHtml(inviter)}</strong> invited you to the team at <strong>${escapeHtml(params.restaurantName)}</strong>.</p>`,
    details: [row('Restaurant', params.restaurantName), row('Your role', roles), row('Invited by', inviter)].join(''),
    buttonLabel: 'Accept invitation',
    url: params.inviteUrl,
    note: 'This invitation works for 7 days. Not expecting it? You can ignore this email.',
  });

  const text = `Hi ${params.recipientName || 'there'},\n\n${inviter} invited you to join ${params.restaurantName} as ${roles} on Restora.\n\nAccept your invitation: ${params.inviteUrl}\n\nThis invitation works for 7 days.`;

  const result = await sendEmail({
    to: params.to,
    subject: `${inviter} invited you to ${params.restaurantName} on Restora`,
    html,
    text,
  });

  return result.success;
}

export default {
  isConfigured: isSmtpConfigured,
  sendEmail,
  sendStaffInvitationEmail,
  sendAccountEmail,
};
