// Tiny JSON-file data store with atomic writes.
// Chosen for the hackathon: zero native dependencies, container-friendly,
// durable across restarts, and simple to back up (one file per deployment).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EMPTY = {
  profiles: [],
  medications: [],
  appointments: [],
  doseStatus: {}, // key: `${medicationId}|${date}|${time}` -> dose record
  activity: [],
  reminders: [],
  reminderSent: {}, // dedup key -> iso timestamp
  sessions: [],
  meta: {}, // e.g. lastReminderSweep timestamp
};

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = structuredClone(EMPTY);
    this._writeTimer = null;
    this._writing = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...structuredClone(EMPTY), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.flush();
    }
  }

  // Schedule a durable write. Writes are debounced and atomic (tmp + rename),
  // so a crash never leaves a half-written database file.
  save() {
    if (this._writeTimer) return;
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this._writing = this._writing.then(() => this.flush());
    }, 25);
  }

  async close() {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    await this._writing;
    await this.flush();
  }

  async flush() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  id(prefix) {
    return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
  }
}

export function createStore(filePath) {
  return new Store(filePath);
}

// Netlify Blobs-backed store: same interface, durable on serverless deploys
// where the filesystem is ephemeral. Used automatically when running on
// Netlify (NETLIFY env var); the file store covers local dev and Cloud Run.
export class BlobStore {
  constructor(storeName = 'carecircle') {
    this.storeName = storeName;
    this.key = 'carecircle-data';
    this.data = structuredClone(EMPTY);
    this._writeTimer = null;
    this._writing = Promise.resolve();
    this._blobs = null;
  }

  async load() {
    try {
      const { getStore } = await import('@netlify/blobs');
      this._blobs = getStore(this.storeName);
      const parsed = await this._blobs.get(this.key, { type: 'json' });
      this.data = { ...structuredClone(EMPTY), ...(parsed ?? {}) };
    } catch (err) {
      console.warn('[BlobStore] Netlify Blobs not available, falling back to memory store:', err.message);
      this._blobs = null;
      this.data = structuredClone(EMPTY);
    }
  }

  save() {
    if (this._writeTimer) return;
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this._writing = this._writing.then(() => this.flush());
    }, 25);
  }

  async flush() {
    if (!this._blobs) return;
    try {
      await this._blobs.setJSON(this.key, this.data);
    } catch (err) {
      console.warn('[BlobStore] flush failed:', err.message);
    }
  }

  async close() {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    await this._writing;
    await this.flush();
  }

  id(prefix) {
    return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
  }
}

export function isNetlify() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
