import { App } from "@slack/bolt";
import { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } from "./config.js";

// --- Slack Bolt (Socket Mode) ---
export const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

// --- Display Name Cache ---
const displayNameCache = new Map<string, string>();

/** Resolve a user ID or bot ID to a display name, with caching. */
export async function resolveDisplayName(id: string, type: "user" | "bot"): Promise<string> {
  const cached = displayNameCache.get(id);
  if (cached) return cached;
  try {
    let name: string | undefined;
    if (type === "user") {
      const info = await slackApp.client.users.info({ token: SLACK_BOT_TOKEN, user: id });
      name = info.user?.profile?.display_name || info.user?.real_name;
    } else {
      const info = await slackApp.client.bots.info({ token: SLACK_BOT_TOKEN, bot: id });
      name = info.bot?.name;
    }
    if (name) {
      displayNameCache.set(id, name);
      return name;
    }
  } catch {}
  return id;
}
