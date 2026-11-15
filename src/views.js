import { escapeHtml as esc, formatTime } from './util.js';

export function page({ title, body, session, profile, elderMode }) {
  const nav = session
    ? `<nav aria-label="Main">
        <a href="/dashboard">Today</a>
        <a href="/medications">Medications</a>
        <a href="/appointments">Appointments</a>
        <a href="/activity">Activity</a>
        <a href="/settings">Settings</a>
        <a href="/toggle-elder-mode" aria-pressed="${elderMode ? 'true' : 'false'}">${elderMode ? 'Normal text' : 'Larger text'}</a>
        <form method="post" action="/logout" class="inline"><button type="submit" class="linklike">Sign out</button></form>
      </nav>`
    : '';
  return `<!doctype html>
<html lang="en"${elderMode ? ' class="elder-mode"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)} - CareCircle</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header>
  <a class="brand" href="/">CareCircle</a>
  ${profile ? `<p class="tagline">Caring for <strong>${esc(profile.elderName)}</strong></p>` : ''}
  ${nav}
</header>
<main id="main">
${body}
</main>
<footer>
  <p>CareCircle - elderly care, together. Elderly people stay at the centre of their own care.</p>
</footer>
</body>
</html>`;
}

export function landingPage() {
  return `
  <section class="hero">
    <h1>One circle around the people who raised us</h1>
    <p class="lede">CareCircle helps elderly people manage medications and doctor appointments, with family and caretakers in the loop - protected by a simple passcode everyone can remember.</p>
    <div class="cta-row">
      <a class="button" href="/create">Start a care circle</a>
      <a class="button secondary" href="/join">Join with invite code</a>
    </div>
  </section>
  <section aria-label="What CareCircle does" class="features">
    <article><h2>Shared, not taken over</h2><p>Elders keep control. Family and caretakers join with a passcode and help manage the same profile.</p></article>
    <article><h2>Doses that can't slip</h2><p>One-tap taken / missed tracking with adherence scores, plus email alerts when a dose is missed.</p></article>
    <article><h2>Appointments, remembered</h2><p>Upcoming doctor visits on everyone's screen, with email reminders 24 hours ahead.</p></article>
  </section>`;
}

export function createForm({ error } = {}) {
  return `
  <h1>Start a care circle</h1>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/create" class="card form">
    <label>Elderly person's name
      <input name="elderName" required maxlength="80" autocomplete="off" placeholder="e.g. Asha Shinde">
    </label>
    <label>Your name
      <input name="yourName" required maxlength="80" autocomplete="name" placeholder="e.g. Avadhut">
    </label>
    <label>Your role
      <select name="role">
        <option value="elder">I am the elderly person</option>
        <option value="family" selected>Family member</option>
        <option value="caretaker">Caretaker</option>
      </select>
    </label>
    <label>Family passcode (4-8 digits; leave blank to generate one)
      <input name="passcode" inputmode="numeric" pattern="\\d{4,8}" autocomplete="off" placeholder="e.g. 4281">
    </label>
    <label>Notification email for reminders (optional)
      <input name="notifyEmail" type="email" autocomplete="email" placeholder="family@example.com">
    </label>
    <button class="button" type="submit">Create circle</button>
  </form>`;
}

export function joinForm({ error } = {}) {
  return `
  <h1>Join a care circle</h1>
  <p>Ask the person who created the circle for the <strong>invite code</strong> and <strong>passcode</strong>.</p>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/join" class="card form">
    <label>Invite code
      <input name="inviteCode" required maxlength="8" autocomplete="off" placeholder="e.g. K7P2QM" style="text-transform:uppercase">
    </label>
    <label>Passcode
      <input name="passcode" required inputmode="numeric" autocomplete="off" placeholder="6 digits">
    </label>
    <label>Your name
      <input name="yourName" required maxlength="80" autocomplete="name">
    </label>
    <label>Your role
      <select name="role">
        <option value="elder">I am the elderly person</option>
        <option value="family" selected>Family member</option>
        <option value="caretaker">Caretaker</option>
      </select>
    </label>
    <button class="button" type="submit">Join circle</button>
  </form>`;
}

export function dashboardPage({ profile, session, doses, appointments, adherence, date, flash }) {
  const doseList = doses.length
    ? `<ol class="dose-list">${doses
        .map((d) => {
          const statusLabel = { pending: 'Not taken yet', taken: 'Taken', missed: 'Missed', skipped: 'Skipped' }[d.status];
          return `<li class="dose ${d.status}">
            <div class="dose-info">
              <span class="dose-time">${esc(formatTime(d.time))}</span>
              <span class="dose-name">${esc(d.medicationName)}</span>
              <span class="dose-dosage">${esc(d.dosage)}</span>
              ${d.instructions ? `<span class="dose-instructions">${esc(d.instructions)}</span>` : ''}
              <span class="dose-status" aria-live="polite">${statusLabel}${d.markedBy ? ` by ${esc(d.markedBy)}` : ''}</span>
            </div>
            <div class="dose-actions" role="group" aria-label="Mark dose">
              <form method="post" action="/doses/mark"><input type="hidden" name="key" value="${esc(d.key)}"><input type="hidden" name="status" value="taken"><button class="button small" type="submit" ${d.status === 'taken' ? 'disabled' : ''}>Taken</button></form>
              <form method="post" action="/doses/mark"><input type="hidden" name="key" value="${esc(d.key)}"><input type="hidden" name="status" value="missed"><button class="button small warn" type="submit" ${d.status === 'missed' ? 'disabled' : ''}>Missed</button></form>
              <form method="post" action="/doses/mark"><input type="hidden" name="key" value="${esc(d.key)}"><input type="hidden" name="status" value="skipped"><button class="button small ghost" type="submit" ${d.status === 'skipped' ? 'disabled' : ''}>Skip</button></form>
            </div>
          </li>`;
        })
        .join('')}</ol>`
    : `<p class="empty">No medications scheduled today. <a href="/medications/new">Add the first one</a>.</p>`;

  const apptList = appointments.length
    ? `<ul class="card-list">${appointments
        .map(
          (a) => `<li>
            <strong>${esc(a.doctor)}</strong>${a.specialty ? ` <span class="muted">(${esc(a.specialty)})</span>` : ''}<br>
            <time datetime="${esc(a.datetime)}">${esc(new Date(a.datetime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</time>
            ${a.location ? `<br>${esc(a.location)}` : ''}
          </li>`
        )
        .join('')}</ul>`
    : '<p class="empty">No upcoming appointments. <a href="/appointments/new">Add one</a>.</p>';

  return `
  ${flash ? `<p class="flash" role="status">${esc(flash)}</p>` : ''}
  <h1>Today for ${esc(profile.elderName)}</h1>
  <p class="muted">Signed in as ${esc(session.memberName)} (${esc(session.role)}) - ${esc(date)}</p>
  <section class="adherence card" aria-label="Adherence this week">
    <h2>This week's adherence</h2>
    <p class="adherence-score" aria-label="${adherence.pct} percent">${adherence.pct}%</p>
    <p class="muted">${adherence.taken} of ${adherence.total} doses taken</p>
  </section>
  <section aria-label="Today's medications">
    <h2>Today's medications</h2>
    ${doseList}
  </section>
  <section aria-label="Upcoming appointments">
    <h2>Upcoming appointments</h2>
    ${apptList}
  </section>`;
}

export function medicationsPage({ medications }) {
  const list = medications.length
    ? `<ul class="card-list">${medications
        .map(
          (m) => `<li>
            <strong>${esc(m.name)}</strong> <span class="muted">${esc(m.dosage)}</span><br>
            <span>${m.times.map((t) => esc(formatTime(t))).join(', ')}</span>
            ${m.instructions ? `<br><span class="muted">${esc(m.instructions)}</span>` : ''}
            <div class="row-actions">
              <a class="button small secondary" href="/medications/${m.id}/edit">Edit</a>
              <form method="post" action="/medications/${m.id}/delete" onsubmit="return confirm('Remove ${esc(m.name)}?')"><button class="button small ghost" type="submit">Remove</button></form>
            </div>
          </li>`
        )
        .join('')}</ul>`
    : '<p class="empty">No medications yet.</p>';
  return `
  <h1>Medications</h1>
  <p><a class="button" href="/medications/new">Add medication</a></p>
  ${list}`;
}

export function medicationForm({ med, error }) {
  const times = med?.times?.length ? med.times : ['08:00'];
  return `
  <h1>${med ? 'Edit' : 'Add'} medication</h1>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="${med ? `/medications/${med.id}/edit` : '/medications/new'}" class="card form">
    <label>Medication name
      <input name="name" required maxlength="120" value="${esc(med?.name ?? '')}" placeholder="e.g. Metformin">
    </label>
    <label>Dosage
      <input name="dosage" required maxlength="80" value="${esc(med?.dosage ?? '')}" placeholder="e.g. 500 mg, 1 tablet">
    </label>
    <label>Times per day (one per line, 24-hour)
      <textarea name="times" required rows="3" placeholder="08:00&#10;20:00">${esc(times.join('\n'))}</textarea>
    </label>
    <label>Instructions (optional)
      <input name="instructions" maxlength="200" value="${esc(med?.instructions ?? '')}" placeholder="e.g. After breakfast, with water">
    </label>
    <button class="button" type="submit">${med ? 'Save changes' : 'Add medication'}</button>
  </form>`;
}

export function appointmentsPage({ appointments }) {
  const list = appointments.length
    ? `<ul class="card-list">${appointments
        .map(
          (a) => `<li>
            <strong>${esc(a.doctor)}</strong>${a.specialty ? ` <span class="muted">(${esc(a.specialty)})</span>` : ''}<br>
            <time datetime="${esc(a.datetime)}">${esc(new Date(a.datetime).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }))}</time>
            ${a.location ? `<br>${esc(a.location)}` : ''}
            ${a.notes ? `<br><span class="muted">${esc(a.notes)}</span>` : ''}
            <div class="row-actions">
              <form method="post" action="/appointments/${a.id}/delete" onsubmit="return confirm('Remove this appointment?')"><button class="button small ghost" type="submit">Remove</button></form>
            </div>
          </li>`
        )
        .join('')}</ul>`
    : '<p class="empty">No appointments scheduled.</p>';
  return `
  <h1>Appointments</h1>
  <p><a class="button" href="/appointments/new">Add appointment</a></p>
  ${list}`;
}

export function appointmentForm({ error } = {}) {
  return `
  <h1>Add appointment</h1>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/appointments/new" class="card form">
    <label>Doctor or clinic
      <input name="doctor" required maxlength="120" placeholder="e.g. Dr. Patil">
    </label>
    <label>Specialty (optional)
      <input name="specialty" maxlength="80" placeholder="e.g. Cardiologist">
    </label>
    <label>Date and time
      <input name="datetime" type="datetime-local" required>
    </label>
    <label>Location (optional)
      <input name="location" maxlength="200" placeholder="e.g. Ruby Hall Clinic, Pune">
    </label>
    <label>Notes (optional)
      <input name="notes" maxlength="300" placeholder="e.g. Bring recent reports">
    </label>
    <button class="button" type="submit">Add appointment</button>
  </form>`;
}

export function activityPage({ items }) {
  const list = items.length
    ? `<ol class="activity-list">${items
        .map(
          (a) => `<li><time datetime="${esc(a.ts)}">${esc(new Date(a.ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</time> - <strong>${esc(a.actor)}</strong> (${esc(a.role)}) ${esc(a.text)}</li>`
        )
        .join('')}</ol>`
    : '<p class="empty">Nothing yet. Activity across the circle shows up here.</p>';
  return `
  <h1>Circle activity</h1>
  <p class="muted">Everyone in the circle can see what everyone else did - transparency keeps care safe.</p>
  ${list}`;
}

export function settingsPage({ profile, reminders, flash, emailConfigured }) {
  const reminderList = reminders.length
    ? `<ul class="card-list">${reminders
        .slice(0, 20)
        .map(
          (r) => `<li><time datetime="${esc(r.ts)}">${esc(new Date(r.ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</time> - ${esc(r.subject)}${r.recipients?.length ? ` <span class="muted">to ${r.recipients.map(esc).join(', ')}</span>` : ''}</li>`
        )
        .join('')}</ul>`
    : '<p class="empty">No reminders sent yet.</p>';
  return `
  ${flash ? `<p class="flash" role="status">${esc(flash)}</p>` : ''}
  <h1>Circle settings</h1>
  <section class="card">
    <h2>Invite the circle</h2>
    <p>Share these with family and caretakers so they can join:</p>
    <dl class="invite">
      <dt>Invite code</dt><dd><code>${esc(profile.inviteCode)}</code></dd>
      <dt>Members</dt><dd>${profile.members.map((m) => `${esc(m.name)} (${esc(m.role)})`).join(', ')}</dd>
    </dl>
    <p class="muted">The passcode is only ever shown once, at creation. Ask the circle's creator.</p>
  </section>
  <section class="card">
    <h2>Reminder emails</h2>
    <p>Status: <strong>${emailConfigured ? 'Gmail API connected' : 'Not connected - reminders are logged in-app'}</strong></p>
    <form method="post" action="/settings/emails" class="form">
      <label>Notification emails (one per line - missed doses and appointments go here)
        <textarea name="notifyEmails" rows="3">${esc((profile.notifyEmails ?? []).join('\n'))}</textarea>
      </label>
      <button class="button" type="submit">Save emails</button>
    </form>
  </section>
  <section>
    <h2>Recent reminders</h2>
    ${reminderList}
  </section>`;
}

export function passcodeReveal({ profile, passcode, inviteCode }) {
  return `
  <h1>Your care circle is ready</h1>
  <section class="card highlight">
    <p>Share these with family and caretakers. The passcode is shown <strong>only once</strong> - write it down.</p>
    <dl class="invite">
      <dt>Invite code</dt><dd><code>${esc(inviteCode)}</code></dd>
      <dt>Passcode</dt><dd><code class="passcode">${esc(passcode)}</code></dd>
    </dl>
  </section>
  <p><a class="button" href="/dashboard">Open ${esc(profile.elderName)}'s dashboard</a></p>`;
}
