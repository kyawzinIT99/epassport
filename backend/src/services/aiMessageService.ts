import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db';
import { emitToUser, notifyUser } from './sseService';

const BOT_ID   = 'ai-assistant';
const BOT_NAME = '🤖 AI Assistant';
const BOT_ROLE = 'system';

function fallback(name: string, appNumber: string): string {
  return (
    `Hello ${name}, your express passport application (${appNumber}) has been received — great choice for the fast track! ` +
    `To activate express processing, please settle the $50 fee at any authorised passport office counter. ` +
    `Simply quote your application number ${appNumber} and our staff will assist you immediately. ` +
    `You can also contact a registered passport agent nearby — they can facilitate the payment and submission on your behalf without you needing to visit in person. ` +
    `Once your payment is confirmed, your application will be prioritised for processing within 24–72 hours. Feel free to send a message here if you have any questions!`
  );
}

/**
 * Generates a personalised express-payment guidance message via OpenAI (or a
 * fallback template), inserts it as a bot message, and pushes it to the
 * applicant's live SSE stream so it appears instantly without a page reload.
 *
 * Called fire-and-forget after a non-agent express application is submitted.
 */
export async function sendExpressPaymentGuidance(
  applicationId: string,
  applicantUserId: string,
  applicantName: string,
  applicationNumber: string,
): Promise<void> {
  let content: string;

  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 220,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content:
            `You are a friendly AI assistant for a government e-passport office. ` +
            `A customer named "${applicantName}" just submitted an express passport application (number: ${applicationNumber}). ` +
            `Write a warm, helpful, professional message (4-6 sentences) that:\n` +
            `1. Acknowledges their express application was received\n` +
            `2. Reminds them the $50 express fee must be paid to begin processing\n` +
            `3. Tells them they can visit the nearest passport office counter and quote their application number ${applicationNumber}\n` +
            `4. Mentions they may also contact a registered passport agent who can handle payment on their behalf\n` +
            `5. States that processing begins within 24-72 hours after payment is confirmed\n` +
            `Address the customer by first name only. Do NOT use markdown, bullet points, or headers — plain paragraphs only.`,
        }],
      });
      content = completion.choices[0].message.content?.trim() || fallback(applicantName, applicationNumber);
    } catch (err: any) {
      console.warn('[AI Message] OpenAI call failed, using template:', err.message);
      content = fallback(applicantName, applicationNumber);
    }
  } else {
    content = fallback(applicantName, applicationNumber);
  }

  // Persist the bot message
  const msgId = uuidv4();
  db.prepare(
    'INSERT INTO messages (id, application_id, sender_id, sender_name, sender_role, content) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(msgId, applicationId, BOT_ID, BOT_NAME, BOT_ROLE, content);

  // Bell notification so the user sees an alert even if they are not on the messages page
  notifyUser(
    applicantUserId,
    `💬 You have a new message about your express application ${applicationNumber} — check the Messages tab for payment instructions.`,
    'info',
    applicationId,
  );

  // Push to applicant's open tab via SSE — no reload needed
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  emitToUser(applicantUserId, 'new_message', { application_id: applicationId, message: msg });
}

// ── Standard-tier: welcome + express upgrade info ─────────────────────────────

function standardFallback(name: string, appNumber: string): string {
  return (
    `Hello ${name}, your passport application (${appNumber}) has been received and is now in the review queue — thank you for applying! ` +
    `Standard processing typically takes 5–10 business days. ` +
    `If you need your passport sooner, you may upgrade to our Express tier for a $50 fee, which prioritises your application for completion within 24–72 hours. ` +
    `To request an express upgrade, simply visit the nearest passport office counter and quote your application number ${appNumber}, or contact a registered passport agent who can handle this on your behalf. ` +
    `Feel free to send a message here if you have any questions — we are happy to help!`
  );
}

/**
 * Sends a welcome + optional express-upgrade info message to a standard-tier
 * applicant immediately after submission.  Called fire-and-forget.
 */
export async function sendStandardWelcomeMessage(
  applicationId: string,
  applicantUserId: string,
  applicantName: string,
  applicationNumber: string,
): Promise<void> {
  let content: string;

  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 220,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content:
            `You are a friendly AI assistant for a government e-passport office. ` +
            `A customer named "${applicantName}" just submitted a standard passport application (number: ${applicationNumber}). ` +
            `Write a warm, helpful, professional message (4-6 sentences) that:\n` +
            `1. Confirms their standard application was received successfully\n` +
            `2. States that standard processing typically takes 5-10 business days\n` +
            `3. Mentions they can upgrade to Express processing for $50 if they need it sooner (24-72 hours)\n` +
            `4. Tells them to visit the nearest passport office counter quoting application number ${applicationNumber} if they want to upgrade\n` +
            `5. Invites them to send a message here if they have any questions\n` +
            `Address the customer by first name only. Do NOT use markdown, bullet points, or headers — plain paragraphs only.`,
        }],
      });
      content = completion.choices[0].message.content?.trim() || standardFallback(applicantName, applicationNumber);
    } catch (err: any) {
      console.warn('[AI Message] OpenAI call failed, using template:', err.message);
      content = standardFallback(applicantName, applicationNumber);
    }
  } else {
    content = standardFallback(applicantName, applicationNumber);
  }

  const msgId = uuidv4();
  db.prepare(
    'INSERT INTO messages (id, application_id, sender_id, sender_name, sender_role, content) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(msgId, applicationId, BOT_ID, BOT_NAME, BOT_ROLE, content);

  notifyUser(
    applicantUserId,
    `💬 You have a new message about your application ${applicationNumber} — open it to learn about your processing options.`,
    'info',
    applicationId,
  );

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  emitToUser(applicantUserId, 'new_message', { application_id: applicationId, message: msg });
}
