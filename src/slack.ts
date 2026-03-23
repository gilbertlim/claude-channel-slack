import { App } from "@slack/bolt";
import { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } from "./config.js";

// --- Slack Bolt (Socket Mode) ---
export const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});
