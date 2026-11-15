import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { createAppWithStore } from '../src/app.js';
import { runReminderSweep } from '../src/reminders.js';
import { todayLocal, nowHHMM } from '../src/util.js';

let server;
let base;
let store;
let tmpDir;

// A tiny cookie-aware client.
function client() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async req(method, url, body) {
      const res = await fetch(base + url, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: body ? new URLSearchParams(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: res.status, headers: res.headers, text: await res.text() };
    },
    get(url) { return this.req('GET', url); },
    post(url, body) { return this.req('POST', url, body); },
  };
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carecircle-test-'));
  const created = await createAppWithStore({ dataFile: path.join(tmpDir, 'data.json') });
  store = created.store;
  const { app } = created;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await store.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('landing page is accessible without a session', async () => {
  const c = client();
  const res = await c.get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Start a care circle/);
  assert.match(res.text, /lang="en"/);
  assert.match(res.text, /Skip to main content/);
});

test('security headers are set', async () => {
  const c = client();
  const res = await c.get('/');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('dashboard requires a session', async () => {
  const c = client();
  const res = await c.get('/dashboard');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/join');
});

test('create circle, add medication, mark dose taken', async () => {
  const c = client();
  const created = await c.post('/create', {
    elderName: 'Test Elder',
    yourName: 'Test Family',
    role: 'family',
    passcode: '1234',
    notifyEmail: '',
  });
  assert.equal(created.status, 200);
  assert.match(created.text, /Invite code/);
  assert.match(created.text, />1234</);

  const addMed = await c.post('/medications/new', {
    name: 'Metformin',
    dosage: '500 mg',
    times: '08:00\n20:00',
    instructions: 'After food',
  });
  assert.equal(addMed.status, 302);

  const dash = await c.get('/dashboard');
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Metformin/);
  assert.match(dash.text, /500 mg/);

  const med = store.data.medications.find((m) => m.name === 'Metformin');
  const date = todayLocal(330);
  const mark = await c.post('/doses/mark', { key: `${med.id}|${date}|08:00`, status: 'taken' });
  assert.equal(mark.status, 302);

  const dash2 = await c.get('/dashboard');
  assert.match(dash2.text, /Taken by Test Family/);
});

test('second member can join with invite code + passcode', async () => {
  const profile = store.data.profiles[0];
  const c = client();
  const joined = await c.post('/join', {
    inviteCode: profile.inviteCode,
    passcode: '1234',
    yourName: 'Neighbor Caretaker',
    role: 'caretaker',
  });
  assert.equal(joined.status, 302);
  assert.equal(joined.headers.get('location'), '/dashboard');
  const dash = await c.get('/dashboard');
  assert.match(dash.text, /Neighbor Caretaker/);
});

test('wrong passcode is rejected and does not create a session', async () => {
  const profile = store.data.profiles[0];
  const c = client();
  const res = await c.post('/join', {
    inviteCode: profile.inviteCode,
    passcode: '9999',
    yourName: 'Intruder',
    role: 'family',
  });
  assert.equal(res.status, 403);
  assert.match(res.text, /Incorrect passcode/);
  const dash = await c.get('/dashboard');
  assert.equal(dash.status, 302);
});

test('appointments can be added and listed', async () => {
  const c = client();
  await c.post('/join', {
    inviteCode: store.data.profiles[0].inviteCode,
    passcode: '1234',
    yourName: 'Test Family',
    role: 'family',
  });
  const future = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 16);
  const add = await c.post('/appointments/new', {
    doctor: 'Dr. Rao',
    specialty: 'ENT',
    datetime: future,
    location: 'Clinic',
    notes: '',
  });
  assert.equal(add.status, 302);
  const list = await c.get('/appointments');
  assert.match(list.text, /Dr. Rao/);
  const dash = await c.get('/dashboard');
  assert.match(dash.text, /Upcoming appointments/);
  assert.match(dash.text, /Dr. Rao/);
});

test('reminder sweep records a missed dose and is idempotent', async () => {
  // A dose due 45 minutes ago, still pending, must be flagged "missed" once.
  const profile = store.data.profiles[0];
  const past = nowHHMM(330);
  const [h, m] = past.split(':').map(Number);
  const pastMin = h * 60 + m - 45;
  if (pastMin < 0) return; // too close to midnight to test reliably
  const hhmm = `${String(Math.floor(pastMin / 60)).padStart(2, '0')}:${String(pastMin % 60).padStart(2, '0')}`;
  store.data.medications.push({
    id: 'med_testmissed', profileId: profile.id, name: 'LatePill', dosage: '1 tab',
    instructions: '', times: [hhmm], active: true, createdBy: 'test', createdAt: new Date().toISOString(),
  });
  store.save();

  const first = await runReminderSweep(store, 330);
  assert.ok(first.some((r) => r.kind === 'missed' && r.subject.includes('LatePill')));
  const second = await runReminderSweep(store, 330);
  assert.ok(!second.some((r) => r.kind === 'missed' && r.subject.includes('LatePill')));
  const reminder = store.data.reminders.find((r) => r.subject.includes('LatePill'));
  assert.ok(reminder, 'reminder logged in the in-app log');
});

test('fresh circle starts at 100% adherence (no phantom missed doses)', async () => {
  const c = client();
  await c.post('/create', { elderName: 'New Elder', yourName: 'Kin', role: 'family', passcode: '7777', notifyEmail: '' });
  await c.post('/medications/new', { name: 'D3', dosage: '1 cap', times: '09:00', instructions: '' });
  const dash = await c.get('/dashboard');
  assert.match(dash.text, /100%/);
});

test('health check responds for Cloud Run', async () => {
  const c = client();
  const res = await c.get('/healthz');
  assert.equal(res.status, 200);
  assert.match(res.text, /"ok":true/);
});
