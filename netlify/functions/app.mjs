// Netlify Functions entry: wraps the same Express app used everywhere else.
import serverless from 'serverless-http';
import { createAppWithStore } from '../../src/app.js';
import { BlobStore } from '../../src/db.js';

const { app } = await createAppWithStore({ store: new BlobStore() });

export const handler = serverless(app);
