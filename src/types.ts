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
