// Scheduled reminder sweep (every minute). The app also sweeps lazily on
// incoming requests, so reminders still fire on plans without scheduling.
import { BlobStore } from '../../src/db.js';
import { runReminderSweep } from '../../src/reminders.js';

export const handler = async () => {
  const store = new BlobStore();
  await store.load();
  const results = await runReminderSweep(store, Number(process.env.TZ_OFFSET_MINUTES ?? 330));
  await store.close();
  return { statusCode: 200, body: JSON.stringify({ sent: results.length }) };
};

export const config = { schedule: '* * * * *' };
