import crypto from 'node:crypto';
import { hashSecret, verifySecret, generateInviteCode, generatePasscode } from './util.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const LOGIN_WINDOW_MS = 1000 * 60 * 10;
const LOGIN_MAX_ATTEMPTS = 10;

// Naive in-memory rate limiter keyed by IP for join/login attempts.
const attempts = new Map();
export function rateLimitOk(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) ?? { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + LOGIN_WINDOW_MS;
  }
  rec.count += 1;
  attempts.set(ip, rec);
  return rec.count <= LOGIN_MAX_ATTEMPTS;
}

export function createProfile(store, { elderName, yourName, role, notifyEmail, passcode }) {
  const code = passcode && /^\d{4,8}$/.test(passcode) ? passcode : generatePasscode();
  const { salt, hash } = hashSecret(code);
  const profile = {
    id: store.id('prf'),
    inviteCode: generateInviteCode(),
    elderName: String(elderName).trim(),
    notifyEmails: notifyEmail ? [String(notifyEmail).trim()] : [],
    passcodeSalt: salt,
    passcodeHash: hash,
    members: [{ name: String(yourName).trim(), role, joinedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  };
  store.data.profiles.push(profile);
  store.save();
  return { profile, passcode: code };
}

export function joinProfile(store, { inviteCode, passcode, yourName, role }) {
  const profile = store.data.profiles.find(
    (p) => p.inviteCode === String(inviteCode).trim().toUpperCase()
  );
  if (!profile) return { error: 'No care circle found for that invite code.' };
  if (!verifySecret(passcode, profile.passcodeSalt, profile.passcodeHash)) {
    return { error: 'Incorrect passcode. Ask the person who created the circle.' };
  }
  const name = String(yourName).trim();
  if (!profile.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    profile.members.push({ name, role, joinedAt: new Date().toISOString() });
    store.save();
  }
  return { profile };
}

export function createSession(store, profileId, memberName, role) {
  const token = crypto.randomBytes(24).toString('base64url');
  store.data.sessions.push({
    token,
    profileId,
    memberName,
    role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  // Prune expired sessions opportunistically.
  store.data.sessions = store.data.sessions.filter((s) => s.expiresAt > Date.now());
  store.save();
  return token;
}

export function sessionFromCookie(store, cookieHeader) {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)cc_session=([^;]+)/.exec(cookieHeader);
  if (!match) return null;
  const session = store.data.sessions.find((s) => s.token === match[1]);
  if (!session || session.expiresAt < Date.now()) return null;
  const profile = store.data.profiles.find((p) => p.id === session.profileId);
  if (!profile) return null;
  return { session, profile };
}

export function destroySession(store, token) {
  store.data.sessions = store.data.sessions.filter((s) => s.token !== token);
  store.save();
}

export function logActivity(store, profileId, actor, role, text) {
  store.data.activity.unshift({
    id: store.id('act'),
    profileId,
    ts: new Date().toISOString(),
    actor,
    role,
    text,
  });
  if (store.data.activity.length > 500) store.data.activity.length = 500;
  store.save();
}
