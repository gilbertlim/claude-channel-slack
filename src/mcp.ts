import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { basename } from "path";
import { SLACK_BOT_TOKEN } from "./config.js";
import { slackApp } from "./slack.js";
import type { ReplyToolArgs, AddReactionToolArgs, RemoveReactionToolArgs, UploadFileToolArgs, GetChannelHistoryToolArgs, GetThreadRepliesToolArgs } from "./types.js";

// --- Helpers ---
function extractMessageText(msg: any): string {
  if (msg.text) return msg.text;

  const parts: string[] = [];

  if (msg.blocks) {
    for (const block of msg.blocks) {
      if (block.type === "rich_text" && block.elements) {
        for (const elem of block.elements) {
          if (elem.elements) {
            parts.push(elem.elements.map((e: any) => e.text ?? "").join(""));
          }
        }
      } else if (block.type === "section") {
        if (block.text?.text) parts.push(block.text.text);
        if (block.fields) {
          parts.push(block.fields.map((f: any) => f.text ?? "").join(" "));
        }
      }
    }
  }

  if (parts.length > 0) return parts.join("\n");

  if (msg.attachments) {
    for (const att of msg.attachments) {
      const t = att.pretext || att.title || att.text || att.fallback;
      if (t) parts.push(t);
    }
  }

  return parts.join("\n") || "";
}

// --- MCP Channel Server ---
export const mcp = new Server(
  { name: "claude-channel-slack", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `Messages from Slack arrive as <channel source="claude-channel-slack" channel="..." channel_type="dm|channel" ts="..." thread_ts="..." user_id="..." username="...">.

When you receive a message:
1. Analyze the content — it may be an alert, error report, question, or casual conversation
2. Provide actionable analysis with possible root causes and remediation
3. Reply using the reply tool with the channel from the tag attributes

For DM messages (channel_type="dm"):
- Respond conversationally, as if chatting directly with the user
- thread_ts is optional — omit it to send a top-level reply in the DM
- Do NOT add emoji reactions to DM messages

For channel messages (channel_type="channel"):
- Always include thread_ts to reply in the correct thread

Always reply in Korean (한국어). Keep replies concise.

When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared later.`,
  }
);

// --- Tool Definitions ---
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description:
        "Reply to a Slack message. For channel messages, include thread_ts to reply in thread. For DMs, thread_ts is optional.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel or DM channel ID",
          },
          thread_ts: {
            type: "string",
            description: "Thread timestamp to reply in (required for channels, optional for DMs)",
          },
          text: {
            type: "string",
            description: "Reply message text",
          },
        },
        required: ["channel", "text"],
      },
    },
    {
      name: "add_reaction",
      description:
        "Add an emoji reaction to a Slack message. Use channel and thread_ts from the incoming channel notification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel ID (e.g. C0123456789)",
          },
          timestamp: {
            type: "string",
            description: "Message timestamp to react to (thread_ts from the notification)",
          },
          name: {
            type: "string",
            description: "Emoji name without colons (e.g. white_check_mark)",
          },
        },
        required: ["channel", "timestamp", "name"],
      },
    },
    {
      name: "upload_file",
      description:
        "Upload a local file to a Slack thread. Use this to share images or documents in a conversation.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel ID (e.g. C0123456789)",
          },
          thread_ts: {
            type: "string",
            description: "Thread timestamp to upload the file in",
          },
          file_path: {
            type: "string",
            description: "Absolute path to the local file to upload",
          },
          title: {
            type: "string",
            description: "Optional title for the uploaded file",
          },
          comment: {
            type: "string",
            description: "Optional comment to include with the file",
          },
        },
        required: ["channel", "thread_ts", "file_path"],
      },
    },
    {
      name: "remove_reaction",
      description:
        "Remove an emoji reaction from a Slack message. Use channel and thread_ts from the incoming channel notification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel ID (e.g. C0123456789)",
          },
          timestamp: {
            type: "string",
            description: "Message timestamp to remove reaction from (thread_ts from the notification)",
          },
          name: {
            type: "string",
            description: "Emoji name without colons (e.g. white_check_mark)",
          },
        },
        required: ["channel", "timestamp", "name"],
      },
    },
    {
      name: "get_channel_history",
      description:
        "Get recent messages from a Slack channel. Use this to read previous conversation context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel or DM channel ID",
          },
          limit: {
            type: "number",
            description: "Number of messages to retrieve (default: 20, max: 100)",
          },
        },
        required: ["channel"],
      },
    },
    {
      name: "get_thread_replies",
      description:
        "Get replies in a Slack thread. Use this to read the full conversation context of a thread.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel or DM channel ID",
          },
          thread_ts: {
            type: "string",
            description: "Thread root message timestamp",
          },
          limit: {
            type: "number",
            description: "Number of replies to retrieve (default: 20, max: 100)",
          },
        },
        required: ["channel", "thread_ts"],
      },
    },
  ],
}));

// --- Tool Handlers ---
mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { channel, thread_ts, text } = req.params.arguments as unknown as ReplyToolArgs;

    await slackApp.client.chat.postMessage({
      token: SLACK_BOT_TOKEN,
      channel,
      ...(thread_ts ? { thread_ts } : {}),
      text,
    });

    return {
      content: [{ type: "text" as const, text: thread_ts ? `Replied in thread ${thread_ts}` : `Sent message to ${channel}` }],
    };
  }

  if (req.params.name === "add_reaction") {
    const { channel, timestamp, name } = req.params.arguments as unknown as AddReactionToolArgs;

    await slackApp.client.reactions.add({
      token: SLACK_BOT_TOKEN,
      channel,
      timestamp,
      name,
    });

    return {
      content: [{ type: "text" as const, text: `Added :${name}: reaction to ${timestamp}` }],
    };
  }

  if (req.params.name === "upload_file") {
    const { channel, thread_ts, file_path, title, comment } = req.params.arguments as unknown as UploadFileToolArgs;

    const fileData = readFileSync(file_path);
    const filename = basename(file_path);

    await slackApp.client.filesUploadV2({
      token: SLACK_BOT_TOKEN,
      channel_id: channel,
      thread_ts,
      file: fileData,
      filename,
      title: title ?? filename,
      initial_comment: comment,
    });

    return {
      content: [{ type: "text" as const, text: `Uploaded ${filename} to thread ${thread_ts}` }],
    };
  }

  if (req.params.name === "remove_reaction") {
    const { channel, timestamp, name } = req.params.arguments as unknown as RemoveReactionToolArgs;

    await slackApp.client.reactions.remove({
      token: SLACK_BOT_TOKEN,
      channel,
      timestamp,
      name,
    });

    return {
      content: [{ type: "text" as const, text: `Removed :${name}: reaction from ${timestamp}` }],
    };
  }

  if (req.params.name === "get_channel_history") {
    const { channel, limit } = req.params.arguments as unknown as GetChannelHistoryToolArgs;
    const effectiveLimit = Math.min(limit ?? 20, 100);

    const result = await slackApp.client.conversations.history({
      token: SLACK_BOT_TOKEN,
      channel,
      limit: effectiveLimit,
    });

    const messages = await Promise.all(
      (result.messages ?? []).reverse().map(async (msg) => {
        let username = msg.user ?? (msg as any).bot_profile?.name ?? (msg as any).username ?? "unknown";
        if (msg.user) {
          try {
            const userInfo = await slackApp.client.users.info({ token: SLACK_BOT_TOKEN, user: msg.user });
            username = userInfo.user?.profile?.display_name || userInfo.user?.real_name || msg.user;
          } catch {}
        }
        return `[${username}] (${msg.ts}): ${extractMessageText(msg)}`;
      })
    );

    return {
      content: [{ type: "text" as const, text: messages.length > 0 ? messages.join("\n") : "No messages found." }],
    };
  }

  if (req.params.name === "get_thread_replies") {
    const { channel, thread_ts, limit } = req.params.arguments as unknown as GetThreadRepliesToolArgs;
    const effectiveLimit = Math.min(limit ?? 20, 100);

    const result = await slackApp.client.conversations.replies({
      token: SLACK_BOT_TOKEN,
      channel,
      ts: thread_ts,
      limit: effectiveLimit,
    });

    const messages = await Promise.all(
      (result.messages ?? []).map(async (msg) => {
        let username = msg.user ?? (msg as any).bot_profile?.name ?? (msg as any).username ?? "unknown";
        if (msg.user) {
          try {
            const userInfo = await slackApp.client.users.info({ token: SLACK_BOT_TOKEN, user: msg.user });
            username = userInfo.user?.profile?.display_name || userInfo.user?.real_name || msg.user;
          } catch {}
        }
        return `[${username}] (${msg.ts}): ${extractMessageText(msg)}`;
      })
    );

    return {
      content: [{ type: "text" as const, text: messages.length > 0 ? messages.join("\n") : "No replies found." }],
    };
  }

  throw new Error(`Unknown tool: ${req.params.name}`);
});
