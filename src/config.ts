// --- Environment ---
export const SLACK_BOT_TOKEN = process.env.APP_HELPER_SLACK_BOT_TOKEN!;
export const SLACK_APP_TOKEN = process.env.APP_HELPER_SLACK_APP_TOKEN!;
export const SLACK_CHANNEL_IDS: string[] = (process.env.APP_HELPER_SLACK_CHANNEL_IDS ?? "")
  .split("|")
  .filter(Boolean);

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN || !SLACK_CHANNEL_IDS.length) {
  console.error(
    "Missing required env vars: APP_HELPER_SLACK_BOT_TOKEN, APP_HELPER_SLACK_APP_TOKEN, APP_HELPER_SLACK_CHANNEL_IDS"
  );
  process.exit(1);
}
