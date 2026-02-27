import db from '../database/db';

let twilioClient: any = null;

function getClient(): any {
  if (twilioClient) return twilioClient;
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    twilioClient = twilio(sid, auth);
    return twilioClient;
  } catch {
    console.warn('[SMS] Twilio package not installed. Run: npm install twilio');
    return null;
  }
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (process.env.SMS_ENABLED !== 'true') return false;
  const client = getClient();
  if (!client) {
    console.warn('[SMS] Twilio not configured — skipping SMS.');
    return false;
  }
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.warn('[SMS] TWILIO_PHONE_NUMBER not set — skipping SMS.');
    return false;
  }
  try {
    await client.messages.create({ to, from, body });
    console.log(`[SMS] Sent to ${to}`);
    return true;
  } catch (err: any) {
    console.error('[SMS] Send failed:', err.message);
    return false;
  }
}

export async function sendSmsToUser(userId: string, message: string): Promise<void> {
  const user = db.prepare('SELECT phone, sms_opt_in FROM users WHERE id = ?').get(userId) as any;
  if (!user?.phone || !user?.sms_opt_in) return;
  await sendSms(user.phone, message).catch(console.error);
}
