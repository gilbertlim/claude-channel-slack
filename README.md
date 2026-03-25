# claude-channel-slack

- Claude Channels 를 활용하여 Slack 채널의 메시지를 모니터링하고 Claude Code가 자동으로 응답하는 MCP 서버입니다.
- Slack Socket Mode로 연결되며, Slack Channel 메시지를 처리합니다.

## 개요

- Slack Socket Mode를 통해 지정된 채널의 메시지를 수신
- MCP(Model Context Protocol) 서버로 동작하여 Claude Code에 메시지를 전달
- Claude Code가 메시지를 분석하고 MCP 도구를 통해 Slack에 응답
- 에러 알림(Grafana 웹훅 등) 수신 시 컨텍스트 기반 분석 수행

## 사전 준비

### 1. Slack App 설정

[Slack API](https://api.slack.com/apps)에서 앱을 생성하고 다음 권한을 부여합니다.

**Bot Token Scopes:**
- `channels:history` - public 채널 메시지 읽기
- `chat:write` - 메시지 작성
- `files:read` - 파일 다운로드
- `files:write` - 파일 업로드
- `channels:read` - public 채널 정보 조회
- `groups:history` - private 채널 메시지 읽기
- `groups:read` - private 채널 정보 조회
- `im:history` - DM 메시지 읽기
- `incoming-webhook` - 웹훅
- `reactions:write` - 리액션 추가/제거

**Subscribe to Bot Events:**
- `message.channels` - public 채널 메시지 수신
- `message.groups` - private 채널 메시지 수신
- `message.im` - DM 메시지 수신

**App-Level Token:**
- `connections:write` scope로 App-Level Token 생성 (Socket Mode 사용)

### 2. 환경변수

`.env.example`을 참고하여 환경변수를 설정합니다.

```bash
# Slack Bot Token (xoxb-...)
export APP_HELPER_SLACK_BOT_TOKEN=xoxb-your-bot-token

# Slack App-Level Token (xapp-...)
export APP_HELPER_SLACK_APP_TOKEN=xapp-your-app-token
```

### 3. 의존성 설치

[Bun](https://bun.sh) 런타임이 필요합니다.

```bash
bun install
```

## 사용 방법

환경변수를 설정한 후 아래 명령어로 실행합니다.

```bash
claude --dangerously-load-development-channels server:claude-channel-slack
```

이 명령어는 `.mcp.json`에 정의된 `claude-channel-slack` MCP 서버(`src/server.ts`)를 로드하고, Claude Code가 Slack 채널 메시지를 수신/응답할 수 있는 상태로 진입합니다.

## MCP 도구

| 도구 | 설명 |
|------|------|
| `reply` | Slack 메시지 답장 (채널: 스레드, DM: 톱레벨) |
| `add_reaction` | 메시지에 이모지 리액션 추가 |
| `remove_reaction` | 메시지에서 이모지 리액션 제거 |
| `upload_file` | 로컬 파일을 Slack 스레드에 업로드 |
| `get_channel_history` | 채널/DM의 최근 메시지 조회 (최대 100개) |
| `get_thread_replies` | 특정 스레드의 답글 조회 (최대 100개) |
| `list_bot_channels` | 봇이 참여 중인 채널 목록 조회 |

## 기술 스택

- **런타임:** [Bun](https://bun.sh)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Slack SDK:** `@slack/bolt` (Socket Mode)
- **언어:** TypeScript
