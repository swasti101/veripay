// Email adapter. Uses SMTP when SMTP_URL is set; otherwise logs the message to the console
// and stores it in-memory so the dev UI can display tokens/invite links without a mail server.
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface Mail { to: string; subject: string; text: string; html?: string }
export interface SentMail extends Mail { at: string; mode: 'SMTP' | 'DEV_CONSOLE' }

const RECENT: SentMail[] = [];
export const recentMail = () => RECENT.slice(-50).reverse();

let transporter: Transporter | null = null;
export const emailConfigured = () => !!process.env.SMTP_URL;
function tx() {
  if (!process.env.SMTP_URL) return null;
  if (!transporter) transporter = nodemailer.createTransport(process.env.SMTP_URL);
  return transporter;
}

export async function sendMail(m: Mail): Promise<SentMail> {
  const at = new Date().toISOString();
  const from = process.env.SMTP_FROM || 'VeriPay <no-reply@veripay.example>';
  const sent: SentMail = { ...m, at, mode: emailConfigured() ? 'SMTP' : 'DEV_CONSOLE' };
  const t = tx();
  if (t) {
    try { await t.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html }); }
    catch (e: any) { sent.mode = 'DEV_CONSOLE'; console.error('[email] SMTP failed:', e.message); }
  }
  if (sent.mode === 'DEV_CONSOLE') console.log(`[email DEV] → ${m.to}\n  ${m.subject}\n  ${m.text.replace(/\n/g, '\n  ')}`);
  RECENT.push(sent);
  while (RECENT.length > 200) RECENT.shift();
  return sent;
}
