import { createAppWithStore } from './app.js';
import { startReminderLoop } from './reminders.js';

const port = Number(process.env.PORT ?? 8080);
const tzOffsetMinutes = Number(process.env.TZ_OFFSET_MINUTES ?? 330); // default IST

const { app, store } = await createAppWithStore({
  dataFile: process.env.DATA_FILE,
  tzOffsetMinutes,
});

startReminderLoop(store, tzOffsetMinutes, Number(process.env.REMINDER_INTERVAL_MS ?? 60_000));

app.listen(port, () => {
  console.log(`CareCircle listening on :${port}`);
});
