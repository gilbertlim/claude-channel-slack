export interface SlackMessageMeta {
  channel: string;
  channel_type: "dm" | "channel";
  ts: string;
  thread_ts: string;
  user_id: string;
  username: string;
}

export interface ReplyToolArgs {
  channel: string;
  thread_ts?: string;
  text: string;
  blocks?: any[];
}

export interface AddReactionToolArgs {
  channel: string;
  timestamp: string;
  name: string;
}

export interface RemoveReactionToolArgs {
  channel: string;
  timestamp: string;
  name: string;
}

export interface UploadFileToolArgs {
  channel: string;
  thread_ts: string;
  file_path: string;
  title?: string;
  comment?: string;
}

export interface GetChannelHistoryToolArgs {
  channel: string;
  limit?: number;
}

export interface GetThreadRepliesToolArgs {
  channel: string;
  thread_ts: string;
  limit?: number;
}

export interface ListBotChannelsToolArgs {
  types?: string;
}

export interface ListChannelMembersToolArgs {
  channel: string;
}

export interface InviteToChannelToolArgs {
  channel: string;
  users: string;
}

// --- Canvas tool args ---
export interface CreateCanvasToolArgs {
  title?: string;
  markdown?: string;
  channel_id?: string;
}

export interface EditCanvasToolArgs {
  canvas_id: string;
  changes: Array<{
    operation: "insert_at_start" | "insert_at_end" | "insert_before" | "insert_after" | "replace" | "delete";
    section_id?: string;
    document_content?: { type: "markdown"; markdown: string };
  }>;
}

export interface DeleteCanvasToolArgs {
  canvas_id: string;
}

export interface LookupCanvasSectionsToolArgs {
  canvas_id: string;
  section_types?: Array<"any_header" | "h1" | "h2" | "h3">;
  contains_text?: string;
}

// --- Call tool args ---
export interface CreateCallToolArgs {
  external_unique_id: string;
  join_url: string;
  title?: string;
  date_start?: number;
}

export interface EndCallToolArgs {
  id: string;
  duration?: number;
}

export interface GetCallInfoToolArgs {
  id: string;
}
