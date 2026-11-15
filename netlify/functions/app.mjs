// Netlify Functions entry: wraps the same Express app used everywhere else.
import serverless from 'serverless-http';
import { createAppWithStore } from '../../src/app.js';
import { BlobStore } from '../../src/db.js';

let serverlessHandler = null;

export const handler = async (event, context) => {
  if (!serverlessHandler) {
    const { app } = await createAppWithStore({ store: new BlobStore() });
    serverlessHandler = serverless(app);
  }
  return serverlessHandler(event, context);
};
