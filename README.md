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
- `channels:history` - 채널 메시지 읽기 (public)
- `groups:history` - 채널 메시지 읽기 (private)
- `chat:write` - 메시지 작성
- `reactions:write` - 리액션 추가/제거
- `files:read` - 파일 다운로드
- `files:write` - 파일 업로드
- `reactions:write` - 리액션 추가/제거
- `incoming-webhook` - 웹훅

**App-Level Token:**
- `connections:write` scope로 App-Level Token 생성 (Socket Mode 사용)

### 2. 환경변수

`.env.example`을 참고하여 환경변수를 설정합니다.

```bash
# Slack Bot Token (xoxb-...)
export APP_HELPER_SLACK_BOT_TOKEN=xoxb-your-bot-token

# Slack App-Level Token (xapp-...)
export APP_HELPER_SLACK_APP_TOKEN=xapp-your-app-token

# Slack Channel IDs to monitor
export APP_HELPER_SLACK_CHANNEL_IDS=C0123456789|C0123456789

# Application Source
export APP_HELPER_APP_SRC=$HOME/git-repo
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

## 기술 스택

- **런타임:** [Bun](https://bun.sh)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Slack SDK:** `@slack/bolt` (Socket Mode)
- **언어:** TypeScript
