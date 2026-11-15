// Reminder scheduler: scans once a minute for due doses, missed doses and
// appointments in the next 24 hours, then emails the circle's notification
// addresses via the Gmail API (or logs when email is not configured).
import { dueAndMissed } from './care.js';
import { gmailConfigured, sendEmail } from './gmail.js';
import { formatTime } from './util.js';

const APPOINTMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function runReminderSweep(store, tzOffsetMinutes) {
  const results = [];

  // 1. Due and missed medication doses.
  for (const item of dueAndMissed(store, tzOffsetMinutes)) {
    const { profile, dose, kind } = item;
    const dedupKey = `${kind}:${dose.key}`;
    if (store.data.reminderSent[dedupKey]) continue;
    const subject =
      kind === 'missed'
        ? `Missed dose: ${dose.medicationName} for ${profile.elderName}`
        : `Dose due now: ${dose.medicationName} for ${profile.elderName}`;
    const text =
      kind === 'missed'
        ? `${profile.elderName}'s ${formatTime(dose.time)} dose of ${dose.medicationName} (${dose.dosage}) was due over 30 minutes ago and is still unmarked. Please check in.`
        : `It is time for ${profile.elderName} to take ${dose.medicationName} (${dose.dosage}). ${dose.instructions || ''}`.trim();
    const status = await deliver(store, profile, subject, text);
    store.data.reminderSent[dedupKey] = new Date().toISOString();
    results.push({ kind, status, subject });
  }

  // 2. Appointments in the next 24 hours.
  const now = Date.now();
  for (const profile of store.data.profiles) {
    for (const appt of store.data.appointments.filter((a) => a.profileId === profile.id)) {
      const when = Date.parse(appt.datetime);
      if (Number.isNaN(when) || when < now || when > now + APPOINTMENT_WINDOW_MS) continue;
      const dedupKey = `appt:${appt.id}`;
      if (store.data.reminderSent[dedupKey]) continue;
      const subject = `Upcoming appointment: ${appt.doctor} for ${profile.elderName}`;
      const text = `${profile.elderName} has an appointment with ${appt.doctor}${appt.specialty ? ` (${appt.specialty})` : ''} at ${new Date(when).toLocaleString('en-IN')}${appt.location ? `, ${appt.location}` : ''}.${appt.notes ? `\nNotes: ${appt.notes}` : ''}`;
      const status = await deliver(store, profile, subject, text);
      store.data.reminderSent[dedupKey] = new Date().toISOString();
      results.push({ kind: 'appointment', status, subject });
    }
  }

  store.save();
  return results;
}

async function deliver(store, profile, subject, text) {
  const recipients = profile.notifyEmails ?? [];
  store.data.reminders.unshift({
    id: store.id('rem'),
    profileId: profile.id,
    ts: new Date().toISOString(),
    subject,
    recipients,
  });
  if (!gmailConfigured()) {
    console.log(`[reminder:log-only] ${subject}`);
    return 'logged (email not configured)';
  }
  if (recipients.length === 0) return 'no recipients';
  try {
    for (const to of recipients) {
      await sendEmail({ to, subject, text });
    }
    return `emailed ${recipients.length} recipient(s)`;
  } catch (err) {
    console.error(`[reminder:error] ${err.message}`);
    return `error: ${err.message}`;
  }
}

export function startReminderLoop(store, tzOffsetMinutes, intervalMs = 60_000) {
  const timer = setInterval(() => {
    runReminderSweep(store, tzOffsetMinutes).catch((err) =>
      console.error('[reminder:sweep failed]', err)
    );
  }, intervalMs);
  timer.unref();
  return timer;
}
