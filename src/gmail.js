// Gmail API client (Google service) for reminder emails.
//
// Uses the Gmail REST API directly via fetch - no heavy SDK. Configure with a
// Google OAuth2 refresh token (see README "Email reminders with Gmail API"):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GMAIL_SENDER
// Without credentials the app keeps working: reminders are recorded in-app
// and logged, so the demo never breaks.

let cachedToken = null;
let cachedTokenExpiry = 0;

async function accessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 30_000) return cachedToken;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  cachedTokenExpiry = Date.now() + json.expires_in * 1000;
  return cachedToken;
}

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GMAIL_SENDER
  );
}

// Send a plain-text email through the caller's Gmail account (users/me).
export async function sendEmail({ to, subject, text }) {
  const sender = process.env.GMAIL_SENDER;
  const raw = Buffer.from(
    [`From: CareCircle <${sender}>`, `To: ${to}`, `Subject: ${subject}`, '', text].join('\r\n'),
    'utf8'
  ).toString('base64url');
  const token = await accessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gmail send failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}
