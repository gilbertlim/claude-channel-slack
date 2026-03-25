// --- Environment ---
export const SLACK_BOT_TOKEN = process.env.APP_HELPER_SLACK_BOT_TOKEN!;
export const SLACK_APP_TOKEN = process.env.APP_HELPER_SLACK_APP_TOKEN!;

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error(
    "Missing required env vars: APP_HELPER_SLACK_BOT_TOKEN, APP_HELPER_SLACK_APP_TOKEN"
  );
  process.exit(1);
}
