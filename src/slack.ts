import { App } from "@slack/bolt";
import { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } from "./config.js";

// --- Slack Bolt (Socket Mode) ---
export const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

// --- Semaphore for Slack API rate limiting ---
class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const apiSemaphore = new Semaphore(3);

/** Run a Slack API call with concurrency limiting. */
export async function withSlackLimit<T>(fn: () => Promise<T>): Promise<T> {
  await apiSemaphore.acquire();
  try {
    return await fn();
  } finally {
    apiSemaphore.release();
  }
}

// --- Display Name Cache ---
const displayNameCache = new Map<string, string>();

/** Resolve a user ID or bot ID to a display name, with caching. */
export async function resolveDisplayName(id: string, type: "user" | "bot"): Promise<string> {
  const cached = displayNameCache.get(id);
  if (cached) return cached;
  try {
    let name: string | undefined;
    if (type === "user") {
      const info = await withSlackLimit(() =>
        slackApp.client.users.info({ token: SLACK_BOT_TOKEN, user: id })
      );
      name = info.user?.profile?.display_name || info.user?.real_name;
    } else {
      const info = await withSlackLimit(() =>
        slackApp.client.bots.info({ token: SLACK_BOT_TOKEN, bot: id })
      );
      name = info.bot?.name;
    }
    if (name) {
      displayNameCache.set(id, name);
      return name;
    }
  } catch {}
  return id;
}

/** Get cached display name (sync). Returns id if not cached. */
export function getDisplayName(id: string): string {
  return displayNameCache.get(id) ?? id;
}

/** Pre-resolve display names for a batch of messages to warm the cache. */
export async function batchResolveDisplayNames(messages: any[]): Promise<void> {
  const ids = new Set<string>();
  for (const msg of messages) {
    if (msg.user && !displayNameCache.has(msg.user)) ids.add(`user:${msg.user}`);
    else if (msg.bot_id && !msg.bot_profile?.name && !displayNameCache.has(msg.bot_id)) ids.add(`bot:${msg.bot_id}`);
  }
  for (const entry of ids) {
    const [type, id] = entry.split(":", 2);
    await resolveDisplayName(id, type as "user" | "bot");
  }
}
