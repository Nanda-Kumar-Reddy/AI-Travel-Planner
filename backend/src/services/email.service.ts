/**
 * email.service.ts — transactional email sending with mock mode.
 *
 * EMAIL_MODE controls delivery:
 *   'mock' (default in development): logs the email content + link to the
 *          server console. No external dependency, no deliverability risk
 *          during demos. Same pattern as WEATHER_MOCK from Phase 6.
 *   'live': sends via Resend (https://resend.com). Requires RESEND_API_KEY.
 *           Free tier: 3,000 emails/month, 100/day — generous for a launch.
 *
 * Why Resend over SMTP / SendGrid / Mailgun?
 *   - Simplest setup: one env var, one REST call, no SMTP config
 *   - Generous free tier with no credit card
 *   - Official Node SDK not needed — the REST API is a single fetch call
 *
 * The mock/live guard means the signup flow NEVER silently breaks because of
 * an email provider issue during a live demo.
 */
import { logger } from '../utils/logger';

const RESEND_API_URL = 'https://api.resend.com/emails';

function getEmailMode(): 'mock' | 'live' {
  const mode = process.env.EMAIL_MODE;
  if (mode === 'live') return 'live';
  return 'mock'; // safe default
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'AI Travel Planner <noreply@ai-travel-planner.dev>';
}

function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
}

// ─── Internal send helper ─────────────────────────────────────────────────────

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  logLabel: string;
  logData?: Record<string, string>;
}): Promise<void> {
  if (getEmailMode() === 'mock') {
    // In mock mode: log everything that would have been emailed.
    // This keeps the dev/demo flow fully functional without a real email account.
    logger.info(`[EMAIL MOCK] ═══════════════════════════════════════`);
    logger.info(`[EMAIL MOCK] To:      ${params.to}`);
    logger.info(`[EMAIL MOCK] Subject: ${params.subject}`);
    logger.info(`[EMAIL MOCK] Label:   ${params.logLabel}`);
    if (params.logData) {
      for (const [key, value] of Object.entries(params.logData)) {
        logger.info(`[EMAIL MOCK] ${key}: ${value}`);
      }
    }
    logger.info(`[EMAIL MOCK] ═══════════════════════════════════════`);
    return;
  }

  // Live mode: send via Resend REST API
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set but EMAIL_MODE=live');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }

  logger.info(`[EMAIL] Sent "${params.subject}" to ${params.to}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * sendVerificationEmail — sends the email verification link.
 *
 * In mock mode: logs the full verification URL to the server console.
 * In live mode: sends via Resend.
 */
export async function sendVerificationEmail(
  email: string,
  rawToken: string
): Promise<void> {
  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${rawToken}`;

  await sendEmail({
    to: email,
    subject: 'Verify your AI Travel Planner email address',
    logLabel: 'EMAIL VERIFICATION',
    logData: {
      'Verify URL (copy into browser)': verifyUrl,
    },
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #0a0a0f; color: #e2e8f0;">
        <div style="background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 40px;">
          <h1 style="color: #818cf8; font-size: 24px; margin: 0 0 8px;">AI Travel Planner</h1>
          <h2 style="color: #e2e8f0; font-size: 20px; margin: 0 0 24px; font-weight: 500;">Verify your email address</h2>
          <p style="color: #94a3b8; margin: 0 0 24px; line-height: 1.6;">
            Thanks for signing up. Click the button below to verify your email address. 
            This link expires in 24 hours.
          </p>
          <a href="${verifyUrl}" 
             style="display: inline-block; background: #818cf8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Verify email address
          </a>
          <p style="color: #64748b; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            If the button doesn't work, copy this link into your browser:<br>
            <span style="color: #818cf8; word-break: break-all;">${verifyUrl}</span>
          </p>
          <p style="color: #475569; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #1e1e2e; padding-top: 16px;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      </body>
      </html>
    `,
  });
}

/**
 * sendWelcomeEmail — optional post-verification welcome (fire-and-forget).
 * Not awaited by callers — failure is logged but doesn't surface to the user.
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Welcome to AI Travel Planner 🌍',
    logLabel: 'WELCOME EMAIL',
    logData: { 'Recipient name': name },
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #0a0a0f; color: #e2e8f0;">
        <div style="background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 40px;">
          <h1 style="color: #818cf8; font-size: 24px; margin: 0 0 8px;">AI Travel Planner</h1>
          <h2 style="color: #e2e8f0; font-size: 20px; margin: 0 0 16px; font-weight: 500;">Welcome, ${name}! 🎉</h2>
          <p style="color: #94a3b8; margin: 0 0 24px; line-height: 1.6;">
            Your email is verified and your account is ready. 
            Start planning your next adventure with AI-powered day-by-day itineraries and real-time confidence scoring.
          </p>
          <a href="${getFrontendUrl()}/dashboard"
             style="display: inline-block; background: #818cf8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Go to my dashboard
          </a>
        </div>
      </body>
      </html>
    `,
  });
}
