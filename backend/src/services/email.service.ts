/**
 * email.service.ts — centralized email sending via Resend HTTP API.
 *
 * ALL outgoing emails from this platform must flow through this service.
 * Do NOT create separate email logic outside this file.
 *
 * Why Resend instead of SMTP/Nodemailer:
 *   Render's free tier blocks outbound SMTP ports (25, 465, 587).
 *   Resend sends over HTTPS (port 443) — not subject to that restriction.
 *   Same EMAIL_MODE=mock / live guard as before; calling code unchanged.
 *
 * Required env vars (when EMAIL_MODE=live):
 *   RESEND_KEY         — API key from resend.com dashboard
 *   EMAIL_FROM_ADDRESS — Sender address (must be verified in Resend dashboard,
 *                        or use onboarding@resend.dev for testing any inbox)
 *
 * EMAIL_MODE guard:
 *   mock — logs verification link to server console; safe for local dev/demo
 *   live — sends via Resend API
 *   Default when unset: mock (safe fallback)
 */
import { Resend } from 'resend';
import { logger } from '../utils/logger';

// ── Config helpers ─────────────────────────────────────────────────────────────

function getEmailMode(): 'mock' | 'live' {
  return process.env.EMAIL_MODE === 'live' ? 'live' : 'mock';
}

function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
}

const APP_NAME = 'AI Travel Planner';

// ── Resend singleton ──────────────────────────────────────────────────────────
//
// Lazily created so the server starts fine in mock mode without a RESEND_KEY.
// In live mode, server.ts validateEnv() guarantees RESEND_KEY is present before
// this code is ever called.

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_KEY;
    if (!apiKey) {
      throw new Error('RESEND_KEY must be set when EMAIL_MODE=live.');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// ── From address ──────────────────────────────────────────────────────────────
//
// EMAIL_FROM_ADDRESS defaults to onboarding@resend.dev (Resend's shared testing
// domain — delivers to any inbox immediately, no DNS setup needed).
// Set EMAIL_FROM_ADDRESS to your own verified domain address for branded sends.

function getFromAddress(): string {
  const addr = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  return `"${APP_NAME}" <${addr}>`;
}

// ── Shared email layout (dark theme) ──────────────────────────────────────────

function emailWrapper(body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0"
               style="background:#13131a;border-radius:12px;overflow:hidden;border:1px solid #1e1e2e;">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:28px 40px;text-align:center;border-bottom:1px solid #1e1e2e;">
              <span style="color:#818cf8;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                ✈ ${APP_NAME}
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;color:#e2e8f0;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f0f1a;padding:20px 40px;text-align:center;border-top:1px solid #1e1e2e;">
              <p style="margin:0;font-size:12px;color:#475569;">
                This email was sent by ${APP_NAME}. If you didn't request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Primary send helper ────────────────────────────────────────────────────────

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

// ── Email Service ──────────────────────────────────────────────────────────────

class EmailService {
  /**
   * sendVerificationEmail — sends the email verification link.
   *
   * In mock mode: logs the full verification URL to the server console.
   * In live mode: sends via Resend HTTP API.
   */
  async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
    const verifyUrl = `${getFrontendUrl()}/verify-email?token=${rawToken}`;

    if (getEmailMode() === 'mock') {
      logger.info('[EMAIL MOCK] ════════════════════════════════════════');
      logger.info(`[EMAIL MOCK] To:      ${to}`);
      logger.info(`[EMAIL MOCK] Subject: Verify your email — ${APP_NAME}`);
      logger.info(`[EMAIL MOCK] Verify URL (copy into browser):`);
      logger.info(`[EMAIL MOCK]   ${verifyUrl}`);
      logger.info('[EMAIL MOCK] ════════════════════════════════════════');
      return;
    }

    const body = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#e2e8f0;font-weight:700;">Verify your email</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
        Welcome to ${APP_NAME}! Click the button below to verify your email address.
        This link expires in <strong style="color:#e2e8f0;">24 hours</strong>.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${verifyUrl}"
           style="display:inline-block;background:#818cf8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
          Verify Email Address
        </a>
      </div>
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Or copy and paste this link into your browser:</p>
      <p style="margin:0;background:#1e1e2e;border-radius:6px;padding:10px 14px;font-size:12px;color:#818cf8;word-break:break-all;">
        ${verifyUrl}
      </p>
      <p style="margin:24px 0 0;color:#475569;font-size:12px;">
        If you did not create an account, please ignore this email.
      </p>`;

    await sendMail(to, `Verify your email — ${APP_NAME}`, emailWrapper(body));
    logger.info(`[EMAIL] Verification email sent to ${to}`);
  }

  /**
   * sendWelcomeEmail — post-verification welcome email.
   * Fire-and-forget — callers should not await this.
   */
  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    if (getEmailMode() === 'mock') {
      logger.info(`[EMAIL MOCK] Welcome email → ${to} (${name})`);
      return;
    }

    const body = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#e2e8f0;font-weight:700;">Welcome, ${name}! 🎉</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
        Your email is verified and your ${APP_NAME} account is ready.
        Start planning your next adventure with AI-powered itineraries and real-time risk scoring.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${getFrontendUrl()}/dashboard"
           style="display:inline-block;background:#818cf8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
          Go to my dashboard
        </a>
      </div>`;

    await sendMail(to, `Welcome to ${APP_NAME} 🌍`, emailWrapper(body));
    logger.info(`[EMAIL] Welcome email sent to ${to}`);
  }
}

export const emailService = new EmailService();
