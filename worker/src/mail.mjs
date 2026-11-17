'use strict';
// Transactional email over HTTPS (Workers cannot do SMTP).
// Provider: Resend (https://resend.com), free tier 100 emails/day.
// Disabled unless RESEND_API_KEY is set as a Worker secret and MAIL_FROM is set.
export async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
    });
    if (!r.ok) console.warn('mail: provider rejected, status', r.status);
    return r.ok;
  } catch (e) {
    console.warn('mail: send failed:', e.message);
    return false;
  }
}
