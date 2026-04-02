import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { SLACK_BOT_TOKEN } from "./config.js";
import { mcp } from "./mcp.js";
import { slackApp } from "./slack.js";

// --- Slack Event Handler ---
let botUserId: string | undefined;
const channelNameCache = new Map<string, string>();

async function resolveChannelName(channelId: string): Promise<string> {
  const cached = channelNameCache.get(channelId);
  if (cached) return cached;
  try {
    const info = await slackApp.client.conversations.info({
      token: SLACK_BOT_TOKEN,
      channel: channelId,
    });
    const name = info.channel?.name ?? channelId;
    channelNameCache.set(channelId, name);
    return name;
  } catch {
    return channelId;
  }
}

slackApp.event("message", async ({ event, context }) => {
  const channelType = "channel_type" in event ? (event.channel_type as string) : undefined;
  const isDM = channelType === "im";
  console.error("[DEBUG] message event received:", event.channel, "type:", channelType, "ts:", event.ts);

  // Skip bot's own messages (infinite loop prevention)
  if (!botUserId) {
    botUserId = context.botUserId;
  }
  if ("user" in event && event.user === botUserId) return;

  // Skip message subtypes like channel_join, but allow bot_message and file_share (webhook)
  const allowedSubtypes = ["bot_message", "file_share"];
  if ("subtype" in event && event.subtype && !allowedSubtypes.includes(event.subtype)) return;

  let text = "text" in event ? (event.text ?? "") : "";

  // Extract text from attachments (e.g. webhook messages)
  if ("attachments" in event && Array.isArray(event.attachments)) {
    const attachmentTexts = event.attachments
      .map((a) => {
        const parts: string[] = [];
        if (a.pretext) parts.push(String(a.pretext));
        if (a.title) parts.push(String(a.title));
        if (a.text) parts.push(String(a.text));
        if (a.fallback && !parts.length) parts.push(String(a.fallback));
        return parts.join("\n");
      })
      .filter(Boolean);
    if (attachmentTexts.length) {
      text = text ? `${text}\n${attachmentTexts.join("\n")}` : attachmentTexts.join("\n");
    }
  }

  // Download attached image files to temp directory
  const imageFilePaths: string[] = [];
  if ("files" in event && Array.isArray((event as unknown as Record<string, unknown>).files)) {
    const files = (event as unknown as Record<string, unknown>).files as Array<Record<string, unknown>>;
    const tmpDir = join(process.cwd(), "tmp", "slack-images");
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }

    for (const file of files) {
      const mimetype = String(file.mimetype ?? "");
      if (!mimetype.startsWith("image/")) continue;

      const downloadUrl = String(file.url_private_download ?? file.url_private ?? "");
      if (!downloadUrl) continue;

      try {
        const resp = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        });
        if (!resp.ok) continue;

        const buffer = Buffer.from(await resp.arrayBuffer());
        const filename = `${event.ts}_${String(file.name ?? file.id ?? "image")}`;
        const filePath = join(tmpDir, filename);
        writeFileSync(filePath, buffer);
        imageFilePaths.push(filePath);
      } catch (err) {
        console.error("[claude-channel-slack] Failed to download image:", err);
      }
    }

    if (imageFilePaths.length) {
      const imageInfo = imageFilePaths.map((p) => `[첨부 이미지: ${p}]`).join("\n");
      text = text ? `${text}\n\n${imageInfo}` : imageInfo;
    }
  }

  const userId = "user" in event ? (event.user ?? "unknown") : "unknown";
  const threadTs = "thread_ts" in event ? (event.thread_ts as string) : event.ts;

  // Resolve username
  let username = userId;
  if (userId !== "unknown") {
    try {
      const info = await slackApp.client.users.info({
        token: SLACK_BOT_TOKEN,
        user: userId,
      });
      username =
        info.user?.profile?.display_name || info.user?.real_name || userId;
    } catch {
      // Fall back to user ID
    }
  }

  // Convert timestamp to KST (UTC+9)
  const kst = new Date(parseFloat(event.ts) * 1000 + 9 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  // Resolve channel name for display
  const channelName = await resolveChannelName(event.channel);

  // Send as MCP channel notification
  const displayContent = `[${channelName}] ${username}: ${text}`;
  console.error("[DEBUG] sending notification, text:", displayContent.slice(0, 80));
  try {
    await mcp.notification({
      method: "notifications/claude/channel",
      params: {
        content: displayContent,
        meta: {
          channel: event.channel,
          channel_type: isDM ? "dm" : "channel",
          ts: event.ts,
          thread_ts: threadTs,
          user_id: userId,
          username,
          kst,
        },
      },
    });
    console.error("[DEBUG] notification sent OK");
  } catch (err) {
    console.error("[DEBUG] notification FAILED:", err);
  }
});

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  await slackApp.start();
  console.error("[claude-channel-slack] Connected to Slack and MCP ready");
}

main().catch((err) => {
  console.error("[claude-channel-slack] Fatal error:", err);
  process.exit(1);
});
