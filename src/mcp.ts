import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { basename } from "path";
import { SLACK_BOT_TOKEN } from "./config.js";
import { slackApp } from "./slack.js";
import type { ReplyToolArgs, AddReactionToolArgs, RemoveReactionToolArgs, UploadFileToolArgs } from "./types.js";

// --- MCP Channel Server ---
export const mcp = new Server(
  { name: "claude-channel-slack", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `Messages from a Slack channel arrive as <channel source="claude-channel-slack" channel="C..." ts="..." thread_ts="..." user_id="..." username="...">.

When you receive a message:
1. Analyze the content — it may be an alert, error report, or question
2. Provide actionable analysis with possible root causes and remediation
3. Reply using the reply tool with channel and thread_ts from the tag attributes

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
        "Reply to a Slack message thread. Use channel and thread_ts from the incoming channel notification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Slack channel ID (e.g. C0123456789)",
          },
          thread_ts: {
            type: "string",
            description: "Thread timestamp to reply in",
          },
          text: {
            type: "string",
            description: "Reply message text",
          },
        },
        required: ["channel", "thread_ts", "text"],
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
  ],
}));

// --- Tool Handlers ---
mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { channel, thread_ts, text } = req.params.arguments as unknown as ReplyToolArgs;

    await slackApp.client.chat.postMessage({
      token: SLACK_BOT_TOKEN,
      channel,
      thread_ts,
      text,
    });

    return {
      content: [{ type: "text" as const, text: `Replied in thread ${thread_ts}` }],
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

  throw new Error(`Unknown tool: ${req.params.name}`);
});
