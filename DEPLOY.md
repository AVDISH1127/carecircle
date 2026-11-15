# Deploy CareCircle to Cloud Run (about 10 minutes)

Two ways: **Cloud Shell** (nothing to install, all in the browser) or your **laptop** with the gcloud CLI.

## Path A: Cloud Shell (recommended at the event)

1. Go to https://console.cloud.google.com and sign in with your Google account.
2. Create a project (or select an existing one): top bar - project picker - **New Project** - name it e.g. `carecircle` - Create. Note the **project ID**.
3. Make sure billing is linked to the project (Cloud Run has a free tier of 2 million requests/month, but the project still needs a billing account): https://console.cloud.google.com/billing/linkedaccount - if the event gave you a credits code, redeem it at https://console.cloud.google.com/billing first.
4. Click **Activate Cloud Shell** (terminal icon, top right). In the terminal that opens at the bottom:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
git clone https://github.com/AVDISH1127/carecircle.git
cd carecircle
gcloud run deploy carecircle --source . --region asia-south1 --allow-unauthenticated --set-env-vars TZ_OFFSET_MINUTES=330
```

5. Say yes to any prompt. When it finishes it prints a **Service URL** like `https://carecircle-xxxx-an.a.run.app` - that is your deployed project link for the submission form.
6. Open the URL: you should see the CareCircle landing page. Tap "Start a care circle" to create your demo circle, or run `node src/seed.js` locally first if you want seeded data (Cloud Run starts empty).

## Path B: laptop with gcloud CLI

1. Install: https://cloud.google.com/sdk/docs/install (or `brew install google-cloud-sdk` on macOS).
2. `gcloud auth login` and `gcloud config set project YOUR_PROJECT_ID`.
3. Same commands as Path A, steps 4's code block.

## Notes

- **Data on Cloud Run is ephemeral**: the JSON store lives in the container, so data resets when a new instance starts. Fine for the demo and judging; for production use, swap `src/db.js` for Firestore (the store interface is tiny).
- The service scales to zero when idle, so the free tier covers it easily.
- Reminder emails need the Gmail API env vars from the README; without them, reminders show in-app under Settings.
- Netlify config is also included (`netlify.toml`) if you want a second live link: `netlify deploy --dir . --prod`.
