import crypto from 'node:crypto';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function generatePasscode() {
  // 6-digit numeric passcode: easy for elders to read out to family.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function generateInviteCode() {
  // Short, unambiguous invite code (no 0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifySecret(secret, salt, expectedHash) {
  const { hash } = hashSecret(secret, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function todayLocal(tzOffsetMinutes = 0) {
  const now = new Date(Date.now() + tzOffsetMinutes * 60_000);
  return now.toISOString().slice(0, 10);
}

export function nowHHMM(tzOffsetMinutes = 0) {
  const now = new Date(Date.now() + tzOffsetMinutes * 60_000);
  return now.toISOString().slice(11, 16);
}

// Minutes since local midnight for "HH:MM".
export function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function isValidTime(hhmm) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
}

export function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email ?? '').trim());
}
