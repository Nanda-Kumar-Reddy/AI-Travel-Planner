/**
 * email.service.ts — centralized email sending via Gmail SMTP (nodemailer).
 *
 * ALL outgoing emails from this platform must flow through this service.
 * Do NOT create separate transporters or email logic outside this file.
 *
 * Adapted from the LifeLine Australia emailService.ts pattern:
 *   - Singleton transporter (create once, reuse)
 *   - Shared emailWrapper() layout (dark theme to match this app's brand)
 *   - Class-based public API, exported as a single instance
 *
 * What changed from LifeLine:
 *   - Gmail SMTP credentials read from process.env (SMTP_USER / SMTP_PASS)
 *     instead of a config object — simpler for this project's structure
 *   - Added mock/live guard (EMAIL_MODE) so dev/demo never breaks due to
 *     missing Gmail credentials — same pattern as WEATHER_MOCK from Phase 6
 *   - Dark theme email template to match the app's visual identity
 *   - No RESEND — Nodemailer only
 *
 * Gmail App Password setup (required for SMTP_PASS):
 *   Google Account → Security → 2-Step Verification → App Passwords
 *   Generate one for "Mail / Other (AI Travel Planner)"
 *   Use that 16-char password as SMTP_PASS (NOT your Google account password)
 */
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// ── Config helpers ─────────────────────────────────────────────────────────────

function getEmailMode(): 'mock' | 'live' {
  return process.env.EMAIL_MODE === 'live' ? 'live' : 'mock';
}

function getFrontendUrl(): string {
  // FRONTEND_URL can be comma-separated (multiple origins) — take the first
  return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
}

const APP_NAME = 'AI Travel Planner';

// ── Singleton transporter ──────────────────────────────────────────────────────
//
// Lazily created so the server starts fine even when SMTP credentials are
// missing (e.g. EMAIL_MODE=mock in development).

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      throw new Error(
        'SMTP_USER and SMTP_PASS must be set when EMAIL_MODE=live.\n' +
        'Generate a Gmail App Password at: ' +
        'Google Account → Security → 2-Step Verification → App Passwords'
      );
    }

    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return _transporter;
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
  const transporter = getTransporter();
  const from = `"${APP_NAME}" <${process.env.SMTP_USER}>`;

  await transporter.sendMail({ from, to, subject, html });
}

// ── Email Service ──────────────────────────────────────────────────────────────

class EmailService {
  /**
   * sendVerificationEmail — sends the email verification link.
   *
   * In mock mode: logs the full verification URL to the server console.
   * In live mode: sends via Gmail SMTP (nodemailer).
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
