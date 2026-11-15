// Seeds a demo care circle so judges can explore immediately.
// Usage: node src/seed.js [dataFile]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.js';
import { createProfile, logActivity } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.argv[2] ?? path.join(__dirname, '..', 'data', 'carecircle.json');
const store = createStore(dataFile);
await store.load();

if (store.data.profiles.length > 0) {
  console.log('Data already present - nothing seeded.');
  process.exit(0);
}

const { profile, passcode } = createProfile(store, {
  elderName: 'Asha Shinde',
  yourName: 'Asha Shinde',
  role: 'elder',
  notifyEmail: '',
  passcode: '4281',
});

store.data.medications.push(
  {
    id: store.id('med'), profileId: profile.id, name: 'Metformin', dosage: '500 mg, 1 tablet',
    instructions: 'After breakfast and dinner, with water', times: ['08:30', '20:30'],
    active: true, createdBy: 'Asha Shinde', createdAt: new Date().toISOString(),
  },
  {
    id: store.id('med'), profileId: profile.id, name: 'Amlodipine', dosage: '5 mg, 1 tablet',
    instructions: 'For blood pressure, before lunch', times: ['12:00'],
    active: true, createdBy: 'Asha Shinde', createdAt: new Date().toISOString(),
  },
  {
    id: store.id('med'), profileId: profile.id, name: 'Vitamin D3', dosage: '1000 IU, 1 capsule',
    instructions: '', times: ['09:00'],
    active: true, createdBy: 'Asha Shinde', createdAt: new Date().toISOString(),
  }
);

const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
inTwoDays.setHours(11, 0, 0, 0);
store.data.appointments.push({
  id: store.id('apt'), profileId: profile.id, doctor: 'Dr. Patil', specialty: 'Cardiologist',
  datetime: inTwoDays.toISOString(), location: 'Ruby Hall Clinic, Pune',
  notes: 'Bring recent blood pressure log', createdBy: 'Asha Shinde', createdAt: new Date().toISOString(),
});

logActivity(store, profile.id, 'Asha Shinde', 'elder', 'started this care circle');
await store.flush();

console.log(`Seeded demo circle for "${profile.elderName}".`);
console.log(`Invite code: ${profile.inviteCode}`);
console.log(`Passcode:    ${passcode}`);
