import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { basename } from "path";
import { SLACK_BOT_TOKEN } from "./config.js";
import { slackApp } from "./slack.js";
import type { ReplyToolArgs, AddReactionToolArgs, RemoveReactionToolArgs, UploadFileToolArgs, GetChannelHistoryToolArgs, GetThreadRepliesToolArgs, ListBotChannelsToolArgs } from "./types.js";

// --- Helpers ---
function extractMessageText(msg: any): string {
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
      } else if (block.type === "header") {
        if (block.text?.text) parts.push(`*${block.text.text}*`);
      } else if (block.type === "context" && block.elements) {
        const contextTexts = block.elements
          .map((e: any) => e.text ?? "")
          .filter(Boolean);
        if (contextTexts.length > 0) parts.push(contextTexts.join(" "));
      } else if (block.type === "divider") {
        parts.push("---");
      } else if (block.type === "image") {
        const label = block.alt_text || block.title?.text || "[image]";
        parts.push(label);
      } else if (block.text?.text) {
        parts.push(block.text.text);
      }
    }
  }

  if (parts.length > 0) return parts.join("\n");

  if (msg.text) return msg.text;

  if (msg.attachments) {
    for (const att of msg.attachments) {
      const attParts: string[] = [];
      // Handle blocks inside attachments (e.g., bot_message with attachment blocks)
      if (att.blocks) {
        for (const block of att.blocks) {
          if (block.type === "rich_text" && block.elements) {
            for (const elem of block.elements) {
              if (elem.elements) {
                attParts.push(elem.elements.map((e: any) => e.text ?? "").join(""));
              }
            }
          } else if (block.type === "section") {
            if (block.text?.text) attParts.push(block.text.text);
            if (block.fields) {
              attParts.push(block.fields.map((f: any) => f.text ?? "").join(" "));
            }
          } else if (block.type === "header") {
            if (block.text?.text) attParts.push(`*${block.text.text}*`);
          } else if (block.type === "context" && block.elements) {
            const contextTexts = block.elements
              .map((e: any) => e.text ?? "")
              .filter(Boolean);
            if (contextTexts.length > 0) attParts.push(contextTexts.join(" "));
          } else if (block.type === "divider") {
            attParts.push("---");
          } else if (block.type === "image") {
            const label = block.alt_text || block.title?.text || "[image]";
            attParts.push(label);
          } else if (block.text?.text) {
            attParts.push(block.text.text);
          }
        }
      }
      if (att.pretext) attParts.push(att.pretext);
      if (att.author_name) attParts.push(att.author_name);
      if (att.title && att.title_link) {
        attParts.push(`<${att.title_link}|${att.title}>`);
      } else if (att.title) {
        attParts.push(att.title);
      }
      if (att.text) attParts.push(att.text);
      if (att.fields) {
        for (const f of att.fields) {
          if (f.title || f.value) attParts.push(`${f.title ?? ""}: ${f.value ?? ""}`);
        }
      }
      if (att.image_url) attParts.push(`[image: ${att.image_url}]`);
      if (attParts.length === 0 && att.from_url) attParts.push(att.from_url);
      if (attParts.length === 0 && att.fallback) attParts.push(att.fallback);
      if (attParts.length > 0) parts.push(attParts.join("\n"));
    }
  }

  if (parts.length > 0) return parts.join("\n");

  // Handle file-only messages
  if (msg.files) {
    const fileDescs = msg.files.map((f: any) => `[file: ${f.name || f.title || f.id}]`);
    return fileDescs.join(", ");
  }

  // Show subtype info as fallback
  if (msg.subtype) return `[${msg.subtype}]`;

  // Debug: show available keys so we can identify unhandled message formats
  const keys = Object.keys(msg).filter(k => !["type", "ts", "user", "bot_id", "bot_profile", "team"].includes(k));
  return `[no preview available] (keys: ${keys.join(", ") || "none"})`;
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
    {
      name: "list_bot_channels",
      description:
        "List Slack channels where the bot is installed (member of).",
      inputSchema: {
        type: "object" as const,
        properties: {
          types: {
            type: "string",
            description:
              "Comma-separated channel types to include: public_channel, private_channel, im, mpim (default: public_channel,private_channel)",
          },
        },
        required: [],
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
        let username = msg.user ?? (msg as any).bot_profile?.name ?? (msg as any).username ?? (msg as any).bot_id ?? "unknown";
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
        let username = msg.user ?? (msg as any).bot_profile?.name ?? (msg as any).username ?? (msg as any).bot_id ?? "unknown";
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

  if (req.params.name === "list_bot_channels") {
    const { types } = (req.params.arguments ?? {}) as unknown as ListBotChannelsToolArgs;
    const channelTypes = types ?? "public_channel,private_channel";

    const channels: { id: string; name: string; is_private: boolean }[] = [];
    let cursor: string | undefined;

    do {
      const result = await slackApp.client.users.conversations({
        token: SLACK_BOT_TOKEN,
        types: channelTypes,
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });

      for (const ch of result.channels ?? []) {
        channels.push({
          id: ch.id!,
          name: ch.name ?? ch.id!,
          is_private: ch.is_private ?? false,
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    const lines = channels.map(
      (ch) => `${ch.is_private ? "🔒" : "#"} ${ch.name} (${ch.id})`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: lines.length > 0
            ? `Bot is in ${channels.length} channel(s):\n${lines.join("\n")}`
            : "Bot is not a member of any channels.",
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${req.params.name}`);
});
