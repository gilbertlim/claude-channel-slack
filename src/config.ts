// --- Environment ---
export const SLACK_BOT_TOKEN = process.env.APP_HELPER_SLACK_BOT_TOKEN!;
export const SLACK_APP_TOKEN = process.env.APP_HELPER_SLACK_APP_TOKEN!;
const rawChannelIds = process.env.APP_HELPER_SLACK_CHANNEL_IDS ?? "";
export const SLACK_ALLOW_ALL_CHANNELS = rawChannelIds.trim() === "*";
export const SLACK_CHANNEL_IDS: string[] = SLACK_ALLOW_ALL_CHANNELS
  ? []
  : rawChannelIds.split("|").filter(Boolean);

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error(
    "Missing required env vars: APP_HELPER_SLACK_BOT_TOKEN, APP_HELPER_SLACK_APP_TOKEN"
  );
  process.exit(1);
}
