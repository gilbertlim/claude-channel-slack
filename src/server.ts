import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { SLACK_BOT_TOKEN } from "./config.js";
import { mcp } from "./mcp.js";
import { slackApp } from "./slack.js";

// --- Slack Event Handler ---
let botUserId: string | undefined;

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

  // Extract text from attachments (e.g. Grafana webhook messages)
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

  // Send as MCP channel notification
  console.error("[DEBUG] sending notification, text:", text.slice(0, 50));
  try {
    await mcp.notification({
      method: "notifications/claude/channel",
      params: {
        content: text,
        meta: {
          channel: event.channel,
          channel_type: isDM ? "dm" : "channel",
          ts: event.ts,
          thread_ts: threadTs,
          user_id: userId,
          username,
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
