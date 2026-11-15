import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.js';
import {
  createProfile,
  joinProfile,
  createSession,
  sessionFromCookie,
  destroySession,
  rateLimitOk,
  logActivity,
} from './auth.js';
import {
  dosesForDate,
  markDose,
  adherenceSummary,
  medicationsFor,
  upcomingAppointments,
} from './care.js';
import * as views from './views.js';
import { CSS } from './styles.js';
import { todayLocal, isValidTime, isValidEmail } from './util.js';
import { gmailConfigured } from './gmail.js';
import { runReminderSweep } from './reminders.js';

const appDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta?.url === 'string'
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();
const ROLES = new Set(['elder', 'family', 'caretaker']);
const DOSE_STATUSES = new Set(['taken', 'missed', 'skipped']);

export function createApp({ store, tzOffsetMinutes = Number(process.env.TZ_OFFSET_MINUTES ?? 330) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  // Security headers (Cloud Run terminates TLS; cookies are Secure behind it).
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  // Serve styles directly from memory so it can never 404 on serverless
  app.get('/styles.css', (req, res) => {
    res.type('text/css').set('Cache-Control', 'public, max-age=3600').send(CSS);
  });

  app.use(express.static(path.join(appDir, '..', 'public'), { maxAge: '1h', index: false }));

  // Lazy reminder sweep: keeps reminders flowing on serverless deploys where
  // no long-lived interval can run. On the standalone server the interval
  // loop in server.js does the same job; sweeps are deduped either way.
  app.use((req, res, next) => {
    const last = Date.parse(store.data.meta?.lastReminderSweep ?? '') || 0;
    if (Date.now() - last > 55_000) {
      store.data.meta.lastReminderSweep = new Date().toISOString();
      store.save();
      runReminderSweep(store, tzOffsetMinutes).catch((err) =>
        console.error('[reminder:lazy sweep failed]', err)
      );
    }
    next();
  });

  function sessionCookie(token) {
    const parts = [
      `cc_session=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${60 * 60 * 24 * 14}`,
    ];
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts.join('; ');
  }

  function auth(req, res, next) {
    const ctx = sessionFromCookie(store, req.headers.cookie);
    if (!ctx) return res.redirect('/join');
    req.session = ctx.session;
    req.profile = ctx.profile;
    next();
  }

  // Elder mode: extra-large text, toggled per session (stored in a cookie).
  app.use((req, res, next) => {
    req.elderMode = /(?:^|;\s*)cc_elder=1/.test(req.headers.cookie ?? '');
    res.page = (opts) => res.type('html').send(views.page({ elderMode: req.elderMode, ...opts }));
    next();
  });

  app.get('/toggle-elder-mode', (req, res) => {
    res.set('Set-Cookie', req.elderMode ? 'cc_elder=; Path=/; Max-Age=0' : 'cc_elder=1; Path=/; SameSite=Lax; Max-Age=31536000');
    res.redirect(req.get('Referer')?.startsWith('/') ? req.get('Referer') : '/dashboard');
  });

  const localDate = () => todayLocal(tzOffsetMinutes);

  // ---------- Public ----------

  app.get('/', (req, res) => {
    const ctx = sessionFromCookie(store, req.headers.cookie);
    if (ctx) return res.redirect('/dashboard');
    res.page({ title: 'Welcome', body: views.landingPage() });
  });

  app.get('/create', (req, res) => {
    res.page({ title: 'Start a care circle', body: views.createForm() });
  });

  app.post('/create', (req, res) => {
    if (!rateLimitOk(req.ip)) {
      return res.status(429).page({ title: 'Slow down', body: views.createForm({ error: 'Too many attempts. Wait a few minutes and try again.' }) });
    }
    const { elderName, yourName, role, passcode, notifyEmail } = req.body ?? {};
    const bad =
      !elderName?.trim() || !yourName?.trim() || !ROLES.has(role) ||
      (passcode && !/^\d{4,8}$/.test(passcode)) ||
      (notifyEmail && !isValidEmail(notifyEmail));
    if (bad) {
      return res.status(400).page({ title: 'Start a care circle', body: views.createForm({ error: 'Check the form: names are required, role must be chosen, passcode must be 4-8 digits, email must be valid.' }) });
    }
    const { profile, passcode: code } = createProfile(store, { elderName, yourName, role, notifyEmail, passcode });
    logActivity(store, profile.id, yourName.trim(), role, 'started this care circle');
    const token = createSession(store, profile.id, yourName.trim(), role);
    res.set('Set-Cookie', sessionCookie(token));
    res.page({
        title: 'Circle created',
        body: views.passcodeReveal({ profile, passcode: code, inviteCode: profile.inviteCode }),
        session: { memberName: yourName.trim(), role },
        profile,
      });
  });

  app.get('/join', (req, res) => {
    res.page({ title: 'Join a care circle', body: views.joinForm() });
  });

  app.post('/join', (req, res) => {
    if (!rateLimitOk(req.ip)) {
      return res.status(429).page({ title: 'Slow down', body: views.joinForm({ error: 'Too many attempts. Wait a few minutes and try again.' }) });
    }
    const { inviteCode, passcode, yourName, role } = req.body ?? {};
    if (!inviteCode?.trim() || !passcode?.trim() || !yourName?.trim() || !ROLES.has(role)) {
      return res.status(400).page({ title: 'Join a care circle', body: views.joinForm({ error: 'All fields are required.' }) });
    }
    const { profile, error } = joinProfile(store, { inviteCode, passcode, yourName, role });
    if (error) {
      return res.status(403).page({ title: 'Join a care circle', body: views.joinForm({ error }) });
    }
    logActivity(store, profile.id, yourName.trim(), role, 'joined the circle');
    const token = createSession(store, profile.id, yourName.trim(), role);
    res.set('Set-Cookie', sessionCookie(token));
    res.redirect('/dashboard');
  });

  app.post('/logout', (req, res) => {
    const match = /(?:^|;\s*)cc_session=([^;]+)/.exec(req.headers.cookie ?? '');
    if (match) destroySession(store, match[1]);
    res.set('Set-Cookie', 'cc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.redirect('/');
  });

  // ---------- Dashboard & doses ----------

  app.get('/dashboard', auth, (req, res) => {
    const date = localDate();
    res.page({
        title: 'Today',
        body: views.dashboardPage({
          profile: req.profile,
          session: req.session,
          doses: dosesForDate(store, req.profile.id, date),
          appointments: upcomingAppointments(store, req.profile.id),
          adherence: adherenceSummary(store, req.profile.id, date),
          date,
          flash: req.query.flash,
        }),
        session: req.session,
        profile: req.profile,
      });
  });

  app.post('/doses/mark', auth, (req, res) => {
    const { key, status } = req.body ?? {};
    if (!DOSE_STATUSES.has(status) || typeof key !== 'string') return res.redirect('/dashboard');
    // Key format: `${medicationId}|${date}|${time}` (pipe separator: times contain colons).
    const [medicationId, date, time] = key.split('|');
    if (!medicationId || !date || !time) return res.redirect('/dashboard');
    const marked = markDose(store, req.profile.id, medicationId, date, time, status, req.session.memberName);
    if (marked) {
      const med = store.data.medications.find((m) => m.id === medicationId);
      logActivity(store, req.profile.id, req.session.memberName, req.session.role, `marked ${med?.name ?? 'a dose'} (${time}) as ${status}`);
    }
    res.redirect('/dashboard');
  });

  // ---------- Medications ----------

  app.get('/medications', auth, (req, res) => {
    res.page({
        title: 'Medications',
        body: views.medicationsPage({ medications: medicationsFor(store, req.profile.id) }),
        session: req.session,
        profile: req.profile,
      });
  });

  function parseTimes(raw) {
    const times = String(raw ?? '')
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    return times.every(isValidTime) && times.length > 0 && times.length <= 8 ? [...new Set(times)] : null;
  }

  app.get('/medications/new', auth, (req, res) => {
    res.page({ title: 'Add medication', body: views.medicationForm({}), session: req.session, profile: req.profile });
  });

  app.post('/medications/new', auth, (req, res) => {
    const { name, dosage, instructions } = req.body ?? {};
    const times = parseTimes(req.body?.times);
    if (!name?.trim() || !dosage?.trim() || !times) {
      return res.status(400).page({ title: 'Add medication', body: views.medicationForm({ error: 'Name, dosage and at least one valid time (HH:MM, one per line) are required.' }), session: req.session, profile: req.profile });
    }
    store.data.medications.push({
      id: store.id('med'),
      profileId: req.profile.id,
      name: name.trim(),
      dosage: dosage.trim(),
      instructions: (instructions ?? '').trim(),
      times,
      active: true,
      createdBy: req.session.memberName,
      createdAt: new Date().toISOString(),
    });
    store.save();
    logActivity(store, req.profile.id, req.session.memberName, req.session.role, `added medication ${name.trim()}`);
    res.redirect('/medications');
  });

  app.get('/medications/:id/edit', auth, (req, res) => {
    const med = store.data.medications.find((m) => m.id === req.params.id && m.profileId === req.profile.id && m.active);
    if (!med) return res.redirect('/medications');
    res.page({ title: 'Edit medication', body: views.medicationForm({ med }), session: req.session, profile: req.profile });
  });

  app.post('/medications/:id/edit', auth, (req, res) => {
    const med = store.data.medications.find((m) => m.id === req.params.id && m.profileId === req.profile.id && m.active);
    if (!med) return res.redirect('/medications');
    const { name, dosage, instructions } = req.body ?? {};
    const times = parseTimes(req.body?.times);
    if (!name?.trim() || !dosage?.trim() || !times) {
      return res.status(400).page({ title: 'Edit medication', body: views.medicationForm({ med, error: 'Name, dosage and valid times are required.' }), session: req.session, profile: req.profile });
    }
    Object.assign(med, { name: name.trim(), dosage: dosage.trim(), instructions: (instructions ?? '').trim(), times, updatedAt: new Date().toISOString() });
    store.save();
    logActivity(store, req.profile.id, req.session.memberName, req.session.role, `edited medication ${med.name}`);
    res.redirect('/medications');
  });

  app.post('/medications/:id/delete', auth, (req, res) => {
    const med = store.data.medications.find((m) => m.id === req.params.id && m.profileId === req.profile.id && m.active);
    if (med) {
      med.active = false;
      store.save();
      logActivity(store, req.profile.id, req.session.memberName, req.session.role, `removed medication ${med.name}`);
    }
    res.redirect('/medications');
  });

  // ---------- Appointments ----------

  app.get('/appointments', auth, (req, res) => {
    const appts = store.data.appointments
      .filter((a) => a.profileId === req.profile.id)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
    res.page({ title: 'Appointments', body: views.appointmentsPage({ appointments: appts }), session: req.session, profile: req.profile });
  });

  app.get('/appointments/new', auth, (req, res) => {
    res.page({ title: 'Add appointment', body: views.appointmentForm({}), session: req.session, profile: req.profile });
  });

  app.post('/appointments/new', auth, (req, res) => {
    const { doctor, specialty, datetime, location, notes } = req.body ?? {};
    if (!doctor?.trim() || !datetime || Number.isNaN(Date.parse(datetime))) {
      return res.status(400).page({ title: 'Add appointment', body: views.appointmentForm({ error: 'A doctor/clinic name and a valid date & time are required.' }), session: req.session, profile: req.profile });
    }
    store.data.appointments.push({
      id: store.id('apt'),
      profileId: req.profile.id,
      doctor: doctor.trim(),
      specialty: (specialty ?? '').trim(),
      datetime: new Date(datetime).toISOString(),
      location: (location ?? '').trim(),
      notes: (notes ?? '').trim(),
      createdBy: req.session.memberName,
      createdAt: new Date().toISOString(),
    });
    store.save();
    logActivity(store, req.profile.id, req.session.memberName, req.session.role, `added an appointment with ${doctor.trim()}`);
    res.redirect('/appointments');
  });

  app.post('/appointments/:id/delete', auth, (req, res) => {
    const idx = store.data.appointments.findIndex((a) => a.id === req.params.id && a.profileId === req.profile.id);
    if (idx >= 0) {
      const [appt] = store.data.appointments.splice(idx, 1);
      store.save();
      logActivity(store, req.profile.id, req.session.memberName, req.session.role, `removed the appointment with ${appt.doctor}`);
    }
    res.redirect('/appointments');
  });

  // ---------- Activity & settings ----------

  app.get('/activity', auth, (req, res) => {
    const items = store.data.activity.filter((a) => a.profileId === req.profile.id).slice(0, 100);
    res.page({ title: 'Activity', body: views.activityPage({ items }), session: req.session, profile: req.profile });
  });

  app.get('/settings', auth, (req, res) => {
    const reminders = store.data.reminders.filter((r) => r.profileId === req.profile.id);
    res.page({
        title: 'Settings',
        body: views.settingsPage({
          profile: req.profile,
          reminders,
          flash: req.query.flash,
          emailConfigured: gmailConfigured(),
        }),
        session: req.session,
        profile: req.profile,
      });
  });

  app.post('/settings/emails', auth, (req, res) => {
    const emails = String(req.body?.notifyEmails ?? '')
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!emails.every(isValidEmail)) {
      return res.redirect('/settings?flash=' + encodeURIComponent('One of those emails looks wrong - nothing saved.'));
    }
    req.profile.notifyEmails = emails.slice(0, 10);
    store.save();
    logActivity(store, req.profile.id, req.session.memberName, req.session.role, 'updated the notification emails');
    res.redirect('/settings?flash=' + encodeURIComponent('Notification emails saved.'));
  });

  // Health check for Cloud Run.
  app.get('/healthz', (req, res) => res.json({ ok: true, service: 'carecircle' }));

  app.use((req, res) => {
    res.status(404).page({ title: 'Not found', body: '<h1>Page not found</h1><p><a href="/">Back to CareCircle</a></p>' });
  });

  return app;
}

export async function createAppWithStore(options = {}) {
  const store = options.store ?? createStore(options.dataFile ?? path.join(appDir, '..', 'data', 'carecircle.json'));
  await store.load();
  return { app: createApp({ ...options, store }), store };
}
