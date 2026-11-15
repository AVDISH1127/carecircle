// Core domain logic: medication schedules, dose materialization, adherence.
import { todayLocal, nowHHMM, minutesOf } from './util.js';

export function medicationsFor(store, profileId) {
  return store.data.medications.filter((m) => m.profileId === profileId && m.active);
}

// The doses scheduled for a profile on a local date (YYYY-MM-DD), each with
// its current status. Status is stored sparsely: nothing stored = pending.
export function dosesForDate(store, profileId, date) {
  const doses = [];
  for (const med of medicationsFor(store, profileId)) {
    for (const time of med.times.slice().sort()) {
      const key = `${med.id}|${date}|${time}`;
      const rec = store.data.doseStatus[key];
      doses.push({
        key,
        medicationId: med.id,
        medicationName: med.name,
        dosage: med.dosage,
        instructions: med.instructions,
        date,
        time,
        status: rec?.status ?? 'pending',
        markedBy: rec?.markedBy ?? null,
        markedAt: rec?.markedAt ?? null,
      });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

export function markDose(store, profileId, medicationId, date, time, status, actor) {
  const med = store.data.medications.find((m) => m.id === medicationId && m.profileId === profileId);
  if (!med || !med.times.includes(time)) return null;
  const key = `${medicationId}|${date}|${time}`;
  store.data.doseStatus[key] = {
    status,
    markedBy: actor,
    markedAt: new Date().toISOString(),
  };
  store.save();
  return key;
}

// Adherence over the last `days` days (including today): taken / (taken+missed+skipped+overdue).
export function adherenceSummary(store, profileId, date, days = 7) {
  let taken = 0;
  let total = 0;
  const end = new Date(`${date}T00:00:00Z`);
  // Medications only count from the day they were added - a fresh circle
  // should start at 100%, not inherit a week of phantom missed doses.
  const medStart = new Map(
    store.data.medications.map((m) => [m.id, (m.createdAt ?? '').slice(0, 10)])
  );
  for (let i = 0; i < days; i++) {
    const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    for (const dose of dosesForDate(store, profileId, d)) {
      if (medStart.get(dose.medicationId) > d) continue;
      const isToday = d === date;
      if (dose.status === 'pending' && (!isToday || dose.time < nowHHMM())) {
        // An unmarked dose in the past counts against adherence.
        total += 1;
      } else if (dose.status !== 'pending') {
        total += 1;
        if (dose.status === 'taken') taken += 1;
      }
    }
  }
  return { taken, total, pct: total === 0 ? 100 : Math.round((taken / total) * 100) };
}

// Doses that are due or missed right now, used by the reminder scheduler.
export function dueAndMissed(store, tzOffsetMinutes = 0) {
  const date = todayLocal(tzOffsetMinutes);
  const nowMin = minutesOf(nowHHMM(tzOffsetMinutes));
  const out = [];
  for (const profile of store.data.profiles) {
    for (const dose of dosesForDate(store, profile.id, date)) {
      if (dose.status !== 'pending') continue;
      const doseMin = minutesOf(dose.time);
      if (doseMin > nowMin) continue; // not due yet
      out.push({
        profile,
        dose,
        kind: nowMin - doseMin >= 30 ? 'missed' : 'due',
      });
    }
  }
  return out;
}

export function upcomingAppointments(store, profileId, limit = 5) {
  const nowIso = new Date().toISOString();
  return store.data.appointments
    .filter((a) => a.profileId === profileId && a.datetime >= nowIso)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, limit);
}
